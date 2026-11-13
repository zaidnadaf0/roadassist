#!/usr/bin/env node
/**
 * scripts/setAdminClaim.mjs — first-admin bootstrap (OPERATOR ONLY).
 *
 * Sets/clears the authoritative `admin` custom claim for ONE account using a
 * service-account key that MUST NEVER enter the repo, the client, or chat.
 * The target may be a UID or an email address (resolved via Firebase Auth).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/setAdminClaim.mjs --project roadassist-XXXXX --grant you@example.com
 *   node scripts/setAdminClaim.mjs --project roadassist-XXXXX --revoke <uid>
 *   node scripts/setAdminClaim.mjs --project roadassist-XXXXX --grant <uid> --no-sync
 *
 * --grant sets claim {admin:true} (preserving any other custom claims) and
 *   syncs users/{uid}.role='admin' (hint).
 * --revoke removes only the admin key (other claims preserved) and demotes
 *   the hint to 'customer' when it reads 'admin'.
 * --no-sync skips the hint sync (claim is still authoritative either way).
 * --dry-run prints what WOULD happen without touching anything.
 * Refuses to run against any project id containing 'mechist'.
 */
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const project = get('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const grantUid = get('--grant');
const revokeUid = get('--revoke');
const noSync = args.includes('--no-sync');
const dryRun = args.includes('--dry-run');

if (!project) {
  console.error('Missing --project <id> (e.g. --project roadassist-XXXXX).');
  process.exit(2);
}
if (/mechist/i.test(project)) {
  console.error(`REFUSED: '${project}' looks like the MECHIST reference project. Use the RoadAssist project.`);
  process.exit(2);
}
if ((!grantUid && !revokeUid) || (grantUid && revokeUid)) {
  console.error('Pass exactly one of --grant <uid> or --revoke <uid>.');
  process.exit(2);
}
const target = grantUid ?? revokeUid;
const mode = grantUid ? 'grant' : 'revoke';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!dryRun && (!credPath || !existsSync(credPath))) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS must point at a service-account JSON file.');
  process.exit(2);
}
try {
  if (!dryRun) JSON.parse(readFileSync(credPath, 'utf8'));
} catch {
  console.error('Service-account file is not valid JSON.');
  process.exit(2);
}

if (dryRun) {
  console.log(`[dry-run] would ${mode} admin for uid=${target} on project=${project} (hint sync ${noSync ? 'off' : 'on'})`);
  process.exit(0);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))), projectId: project });

if (mode === 'grant') {
  // Resolve email targets: `--grant you@example.com` works without knowing
  // the UID. The account must already exist (sign up in the app first).
  let resolved = target;
  if (target.includes('@')) {
    try {
      const user = await getAuth().getUserByEmail(target);
      resolved = user.uid;
      console.log(`resolved ${target} → uid ${resolved}`);
    } catch {
      console.error(`No Firebase Auth user found for ${target}. Sign up in the app first, then re-run.`);
      process.exit(1);
    }
  }
  const user = await getAuth().getUser(resolved);
  // Preserve every other custom claim — setCustomUserClaims REPLACES the map.
  await getAuth().setCustomUserClaims(resolved, { ...(user.customClaims ?? {}), admin: true });
  let synced = false;
  if (!noSync) {
    try {
      await getFirestore().collection('users').doc(resolved).set(
        { role: 'admin', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      synced = true;
    } catch (err) {
      console.error('Claim set; hint sync failed:', err instanceof Error ? err.message : err);
    }
  }
  console.log(`granted admin claim to ${resolved} (hint synced: ${synced}). Sign out and sign back in (or re-authenticate) to refresh the claim.`);
} else {
  let resolved = target;
  if (target.includes('@')) {
    try {
      const user = await getAuth().getUserByEmail(target);
      resolved = user.uid;
    } catch {
      console.error(`No Firebase Auth user found for ${target}.`);
      process.exit(1);
    }
  }
  // Remove only the admin key; every other custom claim survives.
  const user = await getAuth().getUser(resolved);
  await getAuth().setCustomUserClaims(resolved, { ...(user.customClaims ?? {}), admin: null });
  let synced = false;
  if (!noSync) {
    try {
      const ref = getFirestore().collection('users').doc(resolved);
      const snap = await ref.get();
      if (snap.exists && snap.data()?.role === 'admin') {
        await ref.set({ role: 'customer', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      synced = true;
    } catch (err) {
      console.error('Claim cleared; hint sync failed:', err instanceof Error ? err.message : err);
    }
  }
  console.log(`revoked admin claim from ${resolved} (hint synced: ${synced})`);
}
process.exit(0);
