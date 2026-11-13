import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { MechanicProfile, ServiceRequest } from './types';

type AggregatedRequest = ServiceRequest & {
  aggregatedRating?: unknown;
  aggregatedMechanicId?: unknown;
};

function roundedRating(total: number, count: number): number {
  return count > 0 ? Math.round((total / count) * 10) / 10 : 0;
}

/**
 * Idempotently apply the current completed request rating to mechanic totals.
 * The request value is re-read in the transaction so delayed trigger events
 * cannot roll an aggregate back to an older rating or mechanic association.
 */
export async function aggregateCompletedRating(
  db: Firestore,
  requestId: string,
  eventAfter: ServiceRequest,
): Promise<void> {
  if (eventAfter.status !== 'completed') return;
  const eventRating = eventAfter.rating;
  const eventMechanicId = eventAfter.mechanicId;
  if (typeof eventRating !== 'number' || eventRating < 1 || eventRating > 5 || !eventMechanicId) return;

  const requestRef = db.collection('requests').doc(requestId);
  await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) return;
    const current = requestSnap.data() as AggregatedRequest;

    // Only apply the latest committed rating/assignment. Older trigger
    // deliveries are harmless once the request has moved on.
    if (
      current.status !== 'completed' ||
      current.rating !== eventRating ||
      current.mechanicId !== eventMechanicId
    ) return;

    const hasMarker = current.ratingAggregated === true;
    const priorRating = current.aggregatedRating;
    const priorMechanicId = current.aggregatedMechanicId;

    // Legacy marker means an earlier deployment already changed mechanic
    // totals, but did not retain enough metadata to safely edit or transfer
    // that aggregate. Preserve totals rather than counting it again.
    if (hasMarker && (
      typeof priorRating !== 'number' || priorRating < 1 || priorRating > 5 ||
      typeof priorMechanicId !== 'string' || !priorMechanicId
    )) return;

    if (hasMarker && priorRating === eventRating && priorMechanicId === eventMechanicId) return;

    const priorMechanicRef = hasMarker
      ? db.collection('mechanics').doc(priorMechanicId as string)
      : null;
    const currentMechanicRef = db.collection('mechanics').doc(eventMechanicId);
    const priorMechanicSnap = priorMechanicRef && priorMechanicId !== eventMechanicId
      ? await tx.get(priorMechanicRef)
      : null;
    const currentMechanicSnap = await tx.get(currentMechanicRef);
    if (!currentMechanicSnap.exists) return;

    if (priorMechanicSnap?.exists) {
      const oldProfile = priorMechanicSnap.data() as MechanicProfile;
      const oldCount = typeof oldProfile.reviewCount === 'number' ? oldProfile.reviewCount : 0;
      const oldTotal = typeof oldProfile.ratingTotal === 'number'
        ? oldProfile.ratingTotal
        : (typeof oldProfile.rating === 'number' ? oldProfile.rating : 0) * oldCount;
      const nextCount = Math.max(0, oldCount - 1);
      const nextTotal = Math.max(0, oldTotal - (priorRating as number));
      tx.update(priorMechanicRef as FirebaseFirestore.DocumentReference, {
        ratingTotal: nextTotal,
        reviewCount: nextCount,
        rating: roundedRating(nextTotal, nextCount),
      });
    }

    const profile = currentMechanicSnap.data() as MechanicProfile;
    const count = typeof profile.reviewCount === 'number' ? profile.reviewCount : 0;
    const total = typeof profile.ratingTotal === 'number'
      ? profile.ratingTotal
      : (typeof profile.rating === 'number' ? profile.rating : 0) * count;
    const sameMechanicEdit = hasMarker && priorMechanicId === eventMechanicId;
    const nextTotal = sameMechanicEdit
      ? Math.max(0, total - (priorRating as number) + eventRating)
      : total + eventRating;
    const nextCount = sameMechanicEdit ? count : count + 1;

    tx.update(currentMechanicRef, {
      ratingTotal: nextTotal,
      reviewCount: nextCount,
      rating: roundedRating(nextTotal, nextCount),
    });
    tx.update(requestRef, {
      ratingAggregated: true,
      aggregatedRating: eventRating,
      aggregatedMechanicId: eventMechanicId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
