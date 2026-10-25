import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireCallerAdmin, requireTargetUid } from './admin';
import { noticeForApproval, putNotification } from './notifications';
import type { VerificationStatus } from './types';
import { writeAuditEvent } from './audit';

/**
 * M3 mechanic approval (trusted backend only).
 *
 * Transitions a mechanic's verification state; ONLY callable by an
 * existing claim-admin. The client can never approve itself: rules freeze
 * `approved`/`verificationStatus` on the self-update path, so this
 * callable (plus direct claim-admin writes) is the sole approval route.
 *
 * States: pending → under_review → approved ⇄ suspended → approved;
 * rejected is terminal-ish (requires fresh review to leave). `approved`
 * is always kept consistent with `verificationStatus === 'approved'`.
 * The `users/{uid}.role` hint is synced to 'mechanic' on approval so the
 * portal routing hint matches reality.
 */

export const APPROVABLE_STATUSES: VerificationStatus[] = [
  'pending',
  'under_review',
  'approved',
  'suspended',
  'rejected',
];

export function isApprovableStatus(value: unknown): value is VerificationStatus {
  return typeof value === 'string' && (APPROVABLE_STATUSES as string[]).includes(value);
}

/** Pure transition guard — unit-tested. Rejected mechanics need re-review. */
export function isAllowedTransition(from: VerificationStatus | undefined, to: VerificationStatus): boolean {
  if (from === to) return true;
  if (to === 'approved' || to === 'suspended' || to === 'rejected' || to === 'under_review') {
    if (from === 'rejected' && to !== 'under_review') return false;
    return true;
  }
  return false;
}

export const setMechanicApproval = functions.https.onCall(async (data, context) => {
  requireCallerAdmin(context);
  const uid = requireTargetUid(data);
  const status = (data as { status?: unknown } | null)?.status;
  if (!isApprovableStatus(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'status must be pending|under_review|approved|suspended|rejected');
  }
  const db = getFirestore();
  const mechRef = db.collection('mechanics').doc(uid);
  const snap = await mechRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Mechanic profile not found');
  }
  const current = (snap.data() as { verificationStatus?: VerificationStatus } | undefined)?.verificationStatus;
  if (!isAllowedTransition(current, status)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Cannot move verification from ${current ?? 'unknown'} to ${status}`,
    );
  }
  const approved = status === 'approved';
  await mechRef.set(
    {
      approved,
      verificationStatus: status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  try {
    await writeAuditEvent(db, {
      actorUid: context.auth?.uid ?? 'unknown',
      action: `mechanic_${status}`,
      targetType: 'mechanic',
      targetId: uid,
      metadata: { previousStatus: current ?? null, approved },
    });
  } catch (err) {
    console.error(`[setMechanicApproval] ${uid}: audit event failed`, err);
  }
  // Sync the UI hint so portal routing matches the trusted state.
  try {
    await db
      .collection('users')
      .doc(uid)
      .set(
        { role: approved ? 'mechanic' : 'customer', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  } catch (err) {
    console.error(`[setMechanicApproval] ${uid}: approval set, role-hint sync failed`, err);
    try {
      await putNotification(uid, `approval_${status}`, noticeForApproval(status));
    } catch (err2) {
      console.error(`[setMechanicApproval] ${uid}: approval notice failed:`, err2);
    }
    return { success: true, uid, status, approved, roleHintSynced: false };
  }
  console.log(`[setMechanicApproval] ${uid}: -> ${status} by ${context.auth?.uid}`);
  // Inform the mechanic (idempotent; failures never roll back approval).
  try {
    await putNotification(uid, `approval_${status}`, noticeForApproval(status));
  } catch (err) {
    console.error(`[setMechanicApproval] ${uid}: approval notice failed:`, err);
  }
  return { success: true, uid, status, approved, roleHintSynced: true };
});
