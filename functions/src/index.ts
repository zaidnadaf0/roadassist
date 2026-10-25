import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import type { MechanicProfile, ServiceRequest } from './types';
import { buildPublicProjection } from './projection';
import { acceptOfferTx, createOfferBatch, declineOfferTx, rematchRequest, supersedePendingOffers, sweepRequest } from './dispatch';
import { noticeForOffer, noticesForTransition, putNotification } from './notifications';

admin.initializeApp();
const db = admin.firestore();

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
      { ...projection, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
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
export const onRequestWrite = functions.firestore
  .document('requests/{requestId}')
  .onWrite(async (change, context) => {
    const requestId = context.params.requestId as string;
    const before = change.before.exists ? (change.before.data() as ServiceRequest) : null;
    const after = change.after.exists ? (change.after.data() as ServiceRequest) : null;
    if (!after) return;
    if (!before) return; // creates need no server follow-ups in M3
    await maybeAggregateRating(requestId, before, after);
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

async function maybeAggregateRating(
  requestId: string,
  before: ServiceRequest,
  after: ServiceRequest,
): Promise<void> {
  if (after.status !== 'completed') return;
  const rating = after.rating;
  if (typeof rating !== 'number' || !(rating >= 1 && rating <= 5)) return;
  const mechanicId = after.mechanicId;
  if (!mechanicId) return;
  if (before.rating === rating) return;
  const hadPrior = typeof before.rating === 'number' && before.mechanicId === mechanicId;
  const delta = hadPrior ? rating - (before.rating as number) : rating;
  const mechRef = db.collection('mechanics').doc(mechanicId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(mechRef);
      if (!snap.exists) throw new Error('mechanic-missing');
      const cur = snap.data() as MechanicProfile;
      const count0 = typeof cur.reviewCount === 'number' ? cur.reviewCount : 0;
      const avg0 = typeof cur.rating === 'number' ? cur.rating : 0;
      const count1 = hadPrior ? count0 : count0 + 1;
      const avg1 = count1 > 0 ? Math.round(((avg0 * count0 + delta) / count1) * 10) / 10 : 0;
      tx.update(mechRef, { rating: avg1, reviewCount: count1 });
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'mechanic-missing') return;
    throw err;
  }
  await db.collection('requests').doc(requestId).set(
    { ratingAggregated: true, updatedAt: new Date() },
    { merge: true },
  );
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
