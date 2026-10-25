#!/usr/bin/env node
/**
 * scripts/backfill-public-mechanics.mjs — projection backfill (OPERATOR).
 *
 * Rebuilds `publicMechanics/{uid}` from `mechanics/{uid}` using the same
 * customer-safe mapping as the `onMechanicWrite` trigger: approved profiles
 * get a coarse-coordinate projection, everything else gets its stale
 * projection deleted. Idempotent and safe to rerun.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/backfill-public-mechanics.mjs --project roadassist-XXXXX
 *   node scripts/backfill-public-mechanics.mjs --project roadassist-XXXXX --apply
 *
 * Dry-run by default. Refuses MECHIST project ids (see setAdminClaim.mjs).
 */
const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const get = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const project = get('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-roadassist';
if (/mechist/i.test(project)) {
  console.error(`REFUSED: '${project}' looks like the MECHIST reference project.`);
  process.exit(2);
}

const coarsen = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

function buildProjection(id, raw) {
  if (!raw || raw.approved !== true) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const out = { name: raw.name.trim(), approved: true, isAvailable: raw.isAvailable === true };
  if (Array.isArray(raw.specialties)) out.specialties = raw.specialties.filter((s) => typeof s === 'string');
  if (Array.isArray(raw.vehicleTypes)) out.vehicleTypes = raw.vehicleTypes.filter((s) => typeof s === 'string');
  if (typeof raw.experienceYears === 'number') out.experienceYears = raw.experienceYears;
  if (typeof raw.serviceRadiusKm === 'number') out.serviceRadiusKm = raw.serviceRadiusKm;
  if (typeof raw.rating === 'number') out.rating = raw.rating;
  if (typeof raw.reviewCount === 'number') out.reviewCount = raw.reviewCount;
  if (typeof raw.vehicleDescription === 'string') out.vehicleDescription = raw.vehicleDescription;
  else if (raw.vehicleDescription == null) out.vehicleDescription = null;
  if (typeof raw.garageName === 'string') out.garageName = raw.garageName;
  out.baseLat = coarsen(raw.baseLat);
  out.baseLng = coarsen(raw.baseLng);
  return out;
}

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!usingEmulator) {
  const { existsSync } = await import('node:fs');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS or FIRESTORE_EMULATOR_HOST.');
    process.exit(2);
  }
}
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ projectId: project });
const db = getFirestore();

const snap = await db.collection('mechanics').get();
let published = 0;
let removed = 0;
let skipped = 0;
for (const d of snap.docs) {
  const proj = buildProjection(d.id, d.data() ?? {});
  const pubRef = db.collection('publicMechanics').doc(d.id);
  if (!proj) {
    const existing = await pubRef.get();
    if (!existing.exists) {
      skipped++;
      continue;
    }
    if (!APPLY) {
      process.stdout.write(`WOULD REMOVE  publicMechanics/${d.id} (not approved)\n`);
    } else {
      await pubRef.delete();
      process.stdout.write(`REMOVED  publicMechanics/${d.id}\n`);
    }
    removed++;
    continue;
  }
  if (!APPLY) {
    process.stdout.write(`WOULD PUBLISH  publicMechanics/${d.id} (${proj.name})\n`);
  } else {
    await pubRef.set({ ...proj, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    process.stdout.write(`PUBLISHED  publicMechanics/${d.id}\n`);
  }
  published++;
}
process.stdout.write(
  `\n${APPLY ? 'Done' : 'Dry-run'}: ${published} published, ${removed} removed, ${skipped} skipped ` +
    `(${usingEmulator ? 'emulator' : `project ${project}`}).\n`,
);
process.exit(0);
