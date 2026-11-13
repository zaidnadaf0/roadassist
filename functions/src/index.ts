import * as functions from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { MechanicProfile, ServiceRequest } from './types';
import { buildPublicProjection } from './projection';
import { acceptOfferTx, createOfferBatch, declineOfferTx, rematchRequest, supersedePendingOffers, sweepRequest } from './dispatch';
import { noticeForOffer, noticesForTransition, putNotification } from './notifications';
import { aggregateCompletedRating } from './ratings';

initializeApp();
const db = getFirestore();

export { grantAdminRole, revokeAdminRole } from './admin';
export { setMechanicApproval } from './approval';

/**
 * M3 projection sync: every `mechanics/{uid}` write rebuilds (or removes)
 * the customer-safe `publicMechanics/{uid}` doc. This is the write path the
 * earlier projection sketch lacked — without it the projection would rot.
 */
export const onMechanicWrite = functions.firestore
  .document('mechanics/{mechanicId}')
  .onWrite(async (change, context) => {
    const mechanicId = context.params.mechanicId as string;
    const pubRef = db.collection('publicMechanics').doc(mechanicId);
    if (!change.after.exists) {
      await pubRef.delete().catch(() => {});
      console.log(`[onMechanicWrite] ${mechanicId}: source deleted, projection removed`);
      return;
    }
    const projection = buildPublicProjection(change.after.data() as MechanicProfile);
    if (!projection) {
      await pubRef.delete().catch(() => {});
      console.log(`[onMechanicWrite] ${mechanicId}: not approved, projection removed`);
      return;
    }
    await pubRef.set(
      { ...projection, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`[onMechanicWrite] ${mechanicId}: projection synced`);
  });

/**
 * Request lifecycle triggers: customer-rating aggregation into the
 * mechanic profile, mechanic-phone denormalization onto the request
 * (so customers can call without reading `mechanics`), and live-location
 * cleanup when a job completes. All idempotent under retries.
 */
export const onRequestWrite = functions
  .runWith({ failurePolicy: true })
  .firestore.document('requests/{requestId}')
  .onWrite(async (change, context) => {
    const requestId = context.params.requestId as string;
    const before = change.before.exists ? (change.before.data() as ServiceRequest) : null;
    const after = change.after.exists ? (change.after.data() as ServiceRequest) : null;
    if (!after) return;
    if (!before) return; // creates need no server follow-ups in M3
    await aggregateCompletedRating(db, requestId, after);
    if (after.status === 'cancelled' && before.status !== 'cancelled') {
      try {
        await supersedePendingOffers(db, requestId);
      } catch (err) {
        // Re-throw so Cloud Functions retries transient cleanup failures under
        // the trigger's failurePolicy (retry). Every step in this handler —
        // including supersedePendingOffers — is idempotent under re-delivery:
        // a repeated run only flips whatever offers are still pending and can
        // never reopen or rematch a cancelled request.
        console.error(`[dispatch] ${requestId}: cancellation offer cleanup failed:`, err);
        throw err;
      }
    }
    await maybeAttachMechanicPhone(requestId, before, after);
    await maybeClearMechanicLiveLocation(requestId, before, after);
    await maybeSupersedeOnAccept(requestId, before, after);
    await maybeNotifyTransition(before, after);
  });

/**
 * Defense in depth: when a request flips to `accepted`, close any offer
 * still pending. acceptOfferTx already supersedes siblings inside its
 * transaction (so this is a no-op on the normal path); out-of-band accept
 * paths (e.g. claim-admin console edits) would otherwise leave phantom
 * pending offers live in every mechanic's queue.
 */
async function maybeSupersedeOnAccept(
  requestId: string,
  before: ServiceRequest,
  after: ServiceRequest,
): Promise<void> {
  if (after.status !== 'accepted' || before.status === 'accepted') return;
  try {
    const n = await supersedePendingOffers(db, requestId);
    if (n > 0) console.log(`[dispatch] ${requestId}: superseded ${n} leftover pending offer(s) on accept`);
  } catch (err) {
    console.error(`[dispatch] ${requestId}: supersede-on-accept failed:`, err);
  }
}

/** Fan out idempotent lifecycle notices (never throws into dispatch). */
async function maybeNotifyTransition(before: ServiceRequest, after: ServiceRequest): Promise<void> {
  try {
    for (const n of noticesForTransition(before, after)) {
      await putNotification(n.toUid, n.event, n.notice);
    }
  } catch (err) {
    console.error('[notify] transition fan-out failed:', err);
  }
}

async function maybeAttachMechanicPhone(
  requestId: string,
  before: ServiceRequest,
  after: ServiceRequest,
): Promise<void> {
  const mechanicId = after.mechanicId;
  if (!mechanicId) return;
  if (after.mechanicPhone && after.mechanicId === before.mechanicId) return;
  let phone: string | null = null;
  try {
    const contact = await db.collection('mechanics').doc(mechanicId).collection('private').doc('contact').get();
    if (contact.exists) {
      const raw = contact.data() as { phone?: unknown };
      if (typeof raw.phone === 'string' && raw.phone.trim()) phone = raw.phone.trim();
    }
    if (!phone) {
      const parent = await db.collection('mechanics').doc(mechanicId).get();
      const raw = (parent.exists ? parent.data() : null) as { phone?: unknown } | null;
      if (raw && typeof raw.phone === 'string' && raw.phone.trim()) phone = raw.phone.trim();
    }
  } catch (err) {
    console.error(`[maybeAttachMechanicPhone] ${requestId}: contact read failed:`, err);
    return;
  }
  if (!phone) return;
  await db.collection('requests').doc(requestId).set(
    { mechanicPhone: phone, updatedAt: new Date() },
    { merge: true },
  );
}

/**
 * Privacy cleanup: when a job reaches `completed`, the mechanic's live
 * profile coordinates are nulled (last-known job pin stays on the request
 * itself, visible only to its participants). Historical billing/reporting
 * fields are untouched.
 */
async function maybeClearMechanicLiveLocation(
  requestId: string,
  before: ServiceRequest,
  after: ServiceRequest,
): Promise<void> {
  if (after.status !== 'completed' || before.status === 'completed') return;
  const mechanicId = after.mechanicId;
  if (!mechanicId) return;
  try {
    await db.collection('mechanics').doc(mechanicId).set(
      {
        currentLat: null,
        currentLng: null,
        locationUpdatedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`[maybeClearMechanicLiveLocation] ${requestId}: cleared live coords for ${mechanicId}`);
  } catch (err) {
    console.error(`[maybeClearMechanicLiveLocation] ${requestId}: failed:`, err);
  }
}

/**
 * M8 DISPATCH — server-authoritative offer pool.
 *
 * - onRequestCreate: opens the first controlled batch (top-N eligible).
 * - acceptOffer (callable): transactional first-win with full revalidation.
 * - declineOffer (callable): marks my offer + appends declinedBy, then rematches.
 * - scheduledOfferSweep: expires stale offers each minute and rematches.
 * Clients may display offers but NEVER decide assignment; rules additionally
 * guard every direct write path (see firestore.rules offers block).
 */
export const onRequestCreate = functions.firestore
  .document('requests/{requestId}')
  .onCreate(async (snap, context) => {
    const requestId = context.params.requestId as string;
    try {
      await createOfferBatch(db, requestId);
    } catch (err) {
      console.error(`[dispatch] ${requestId}: initial batch failed:`, err);
    }
    // Customer "received" notice (idempotent; same path as transitions).
    try {
      const after = { ...(snap.data() as ServiceRequest), id: requestId };
      for (const n of noticesForTransition(null, after)) {
        await putNotification(n.toUid, n.event, n.notice);
      }
    } catch (err) {
      console.error(`[notify] ${requestId}: created fan-out failed:`, err);
    }
  });

/**
 * Offer-created notices: each pending offer notifies its addressed
 * mechanic exactly once (deterministic ID + existence check inside put).
 * Expiry/supersede stay silent — the live queue already updates.
 */
export const onOfferWrite = functions.firestore
  .document('requests/{requestId}/offers/{mechanicId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const after = change.after.data() as { status?: unknown; mechanicId?: unknown; round?: unknown };
    if (after.status !== 'pending' || typeof after.mechanicId !== 'string') return;
    if (change.before.exists) return; // updates are not new offers
    const requestId = context.params.requestId as string;
    let category: string | undefined;
    try {
      const req = await db.collection('requests').doc(requestId).get();
      category = (req.data() as ServiceRequest | undefined)?.problemCategory;
    } catch {
      category = undefined;
    }
    await putNotification(
      after.mechanicId,
      `offer_round_${typeof after.round === 'number' ? after.round : 0}`,
      noticeForOffer(requestId, category, typeof after.round === 'number' ? after.round : 0),
    );
  });

function requireUid(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  return uid;
}

export const acceptOffer = functions.https.onCall(async (data, context) => {
  const mechanicId = requireUid(context);
  const requestId = (data as { requestId?: unknown } | null)?.requestId;
  if (typeof requestId !== 'string' || !requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId required');
  }
  const outcome = await acceptOfferTx(db, requestId, mechanicId, Date.now());
  if (outcome !== 'accepted') {
    const code =
      outcome === 'expired' ? 'deadline-exceeded'
      : outcome === 'alreadyTaken' ? 'aborted'
      : outcome === 'ineligible' ? 'permission-denied'
      : 'not-found';
    throw new functions.https.HttpsError(code, `Offer cannot be accepted: ${outcome}`);
  }
  console.log(`[dispatch] ${requestId}: accepted by ${mechanicId} (server-validated)`);
  return { success: true, requestId, mechanicId };
});

export const declineOffer = functions.https.onCall(async (data, context) => {
  const mechanicId = requireUid(context);
  const requestId = (data as { requestId?: unknown } | null)?.requestId;
  if (typeof requestId !== 'string' || !requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId required');
  }
  const outcome = await declineOfferTx(db, requestId, mechanicId);
  if (outcome === 'declined') {
    try {
      await rematchRequest(db, requestId);
    } catch (err) {
      console.error(`[dispatch] ${requestId}: rematch after decline failed:`, err);
    }
  }
  return { success: outcome === 'declined', requestId };
});

export const scheduledOfferSweep = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const now = Date.now();
    const open = await db
      .collection('requests')
      .where('status', '==', 'requested')
      .where('mechanicId', '==', null)
      .limit(50)
      .get();
    if (open.empty) return;
    for (const d of open.docs) {
      try {
        await sweepRequest(db, d.id, now);
      } catch (err) {
        console.error(`[dispatch] sweep ${d.id} failed:`, err);
      }
    }
  });
