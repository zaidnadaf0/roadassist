import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { writeAuditEvent } from './audit';

/**
 * M3 admin claim management (adapted from the proven MECHIST pattern).
 *
 * `admin: true` custom claim is the ONLY authoritative admin authority
 * (`firestore.rules: isClaimAdmin()`). `users/{uid}.role` is a synchronized
 * UI hint. Both callables require the CALLER to already hold the claim, so
 * no user can self-promote. The first admin is bootstrapped out-of-band via
 * `scripts/setAdminClaim.mjs` (service-account key, never in the client).
 */

export function requireTargetUid(data: unknown): string {
  const uid = (data as { uid?: unknown } | null)?.uid;
  if (typeof uid !== 'string' || uid.trim().length === 0 || uid.length > 128) {
    throw new functions.https.HttpsError('invalid-argument', 'uid (1-128 chars) required');
  }
  return uid.trim();
}

export function requireCallerAdmin(context: functions.https.CallableContext): void {
  if (!context.auth?.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
}

export const grantAdminRole = functions.https.onCall(async (data, context) => {
  requireCallerAdmin(context);
  const uid = requireTargetUid(data);
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  try {
    await admin
      .firestore()
      .collection('users')
      .doc(uid)
      .set({ role: 'admin', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error(`[grantAdminRole] ${uid}: claim set, role-hint sync failed`, err);
    return { success: true, uid, roleHintSynced: false };
  }
  try {
    await writeAuditEvent(admin.firestore(), {
      actorUid: context.auth?.uid ?? 'unknown',
      action: 'admin_claim_granted',
      targetType: 'user',
      targetId: uid,
    });
  } catch (err) {
    console.error(`[grantAdminRole] ${uid}: audit event failed`, err);
  }
  console.log(`[grantAdminRole] ${uid}: admin granted by ${context.auth?.uid}`);
  return { success: true, uid, roleHintSynced: true };
});

export const revokeAdminRole = functions.https.onCall(async (data, context) => {
  requireCallerAdmin(context);
  const uid = requireTargetUid(data);
  await admin.auth().setCustomUserClaims(uid, {});
  let roleHintSynced = false;
  try {
    const ref = admin.firestore().collection('users').doc(uid);
    const snap = await ref.get();
    if (snap.exists && (snap.data() as { role?: unknown } | undefined)?.role === 'admin') {
      await ref.set(
        { role: 'customer', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      roleHintSynced = true;
    } else {
      roleHintSynced = true;
    }
  } catch (err) {
    console.error(`[revokeAdminRole] ${uid}: claim cleared, role-hint sync failed`, err);
    return { success: true, uid, roleHintSynced: false };
  }
  try {
    await writeAuditEvent(admin.firestore(), {
      actorUid: context.auth?.uid ?? 'unknown',
      action: 'admin_claim_revoked',
      targetType: 'user',
      targetId: uid,
    });
  } catch (err) {
    console.error(`[revokeAdminRole] ${uid}: audit event failed`, err);
  }
  console.log(`[revokeAdminRole] ${uid}: admin revoked by ${context.auth?.uid}`);
  return { success: true, uid, roleHintSynced };
});
