/**
 * M8 EMULATOR transaction suite — server-side dispatch brain against the
 * Firestore emulator via the Admin SDK (rules bypassed by design here: this
 * file proves SERVER logic — batching, first-win, expiry, rematch,
 * termination — while dispatch.test.ts proves the RULES side).
 *
 * Runs under the same boot (FIRESTORE_EMULATOR_HOST is set by
 * `emulators:exec`):
 *   npx firebase emulators:exec --only firestore --project roadassist-9c223 "npm run test:emulator"
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { aggregateCompletedRating } from '../functions/src/ratings';
import {
  acceptOfferTx,
  createOfferBatch,
  declineOfferTx,
  expireStaleOffers,
  rematchRequest,
  supersedePendingOffers,
  sweepRequest,
} from '../functions/src/dispatch';

// NOTE: seeds below MUST use Admin-SDK sentinels (FieldValue/Timestamp from
// firebase-admin): the dispatch core validates Admin classes, and the client
// SDK's same-named classes are different prototypes (dual-package hazard).

// Dedicated emulator namespace: this suite performs collection-wide server
// scans (eligibility), so it must not see other suites' mechanics when
// vitest runs files in parallel workers against the same emulator.
const PROJECT_ID = 'roadassist-m8tx';

let db: Firestore;

async function seed() {
  for (const [uid, role] of [
    ['m8t-a', 'mechanic'],
    ['m8t-b', 'mechanic'],
    ['m8t-far', 'mechanic'],
    ['m8t-cust', 'customer'],
  ] as const) {
    await db.collection('users').doc(uid).set({ uid, email: `${uid}@t.local`, displayName: uid, role });
  }
  const mech = (uid: string, extra: Record<string, unknown> = {}) =>
    db.collection('mechanics').doc(uid).set({
      uid, name: uid, approved: true, verificationStatus: 'approved',
      specialties: ['tow'], vehicleTypes: ['car'], experienceYears: 2, serviceRadiusKm: 30,
      isAvailable: true, garageName: uid, garageAddress: 'PRIVATE',
      baseLat: 12.9716, baseLng: 77.5946, ...extra,
    });
  await mech('m8t-a');
  await mech('m8t-b');
  await mech('m8t-far', { baseLat: 14.5, baseLng: 79.0, serviceRadiusKm: 5 });
  const open = (id: string, extra: Record<string, unknown> = {}) =>
    db.collection('requests').doc(id).set({
      id, customerId: 'm8t-cust', vehicleId: 'm8t-veh-1',
      problemText: 'M8 transaction probe request payload here',
      customerLat: 12.9716, customerLng: 77.5946, status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000), mechanicId: null,
      ...(extra as Record<string, unknown>),
    });
  await open('m8t-req-batch');
  await open('m8t-req-race');
  await open('m8t-req-decline');
  await open('m8t-req-expired', { offerExpiresAt: Timestamp.fromMillis(Date.now() - 1_000) });
  await open('m8t-req-accept-decline');
  await open('m8t-req-cancel', { status: 'cancelled' });
  await open('m8t-req-completed', { status: 'completed', mechanicId: 'm8t-a', rating: 4 });
}

async function seedOffer(requestId: string, mechanicId: string, expiresAt = Date.now() + 120_000) {
  await db.collection('requests').doc(requestId).collection('offers').doc(mechanicId).set({
    requestId, customerId: 'm8t-cust', mechanicId, mechanicName: mechanicId,
    expiresAt: Timestamp.fromMillis(expiresAt), status: 'pending', round: 0,
  });
}

async function openActiveJob(database: Firestore, id: string, mechanicId: string) {
  await database.collection('requests').doc(id).set({
    id,
    customerId: 'm8t-cust',
    vehicleId: 'm8t-veh-1',
    problemText: 'M8 active job fixture payload',
    customerLat: 12.9716,
    customerLng: 77.5946,
    status: 'accepted',
    offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
    mechanicId,
    mechanicName: mechanicId,
  });
}

beforeAll(async () => {
  initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  await seed();
}, 60_000);

afterAll(async () => {
  await Promise.all((await import('firebase-admin/app')).getApps().map((a) => a.delete().catch(() => {})));
});

describe('server dispatch transactions (M8)', () => {
  it('creates a bounded batch of eligible mechanics only', async () => {
    const res = await createOfferBatch(db, 'm8t-req-batch');
    expect(res.offers).toBe(2); // a + b; far is out of radius
    expect(res.stopped).toBeNull();
    const offers = await db.collection('requests').doc('m8t-req-batch').collection('offers').get();
    expect(offers.docs.map((d) => d.id).sort()).toEqual(['m8t-a', 'm8t-b']);
    for (const d of offers.docs) {
      expect(d.data().status).toBe('pending');
      expect(d.data().expiresAt.toMillis()).toBeGreaterThan(Date.now());
    }
  });

  it('CONCURRENCY: simultaneous accepts → exactly one winner, others superseded', async () => {
    await createOfferBatch(db, 'm8t-req-race');
    const [ra, rb] = await Promise.all([
      acceptOfferTx(db, 'm8t-req-race', 'm8t-a', Date.now()),
      acceptOfferTx(db, 'm8t-req-race', 'm8t-b', Date.now()),
    ]);
    const outcomes = [ra, rb].sort();
    expect(outcomes).toEqual(['accepted', 'alreadyTaken']);
    const req = await db.collection('requests').doc('m8t-req-race').get();
    expect(req.data()?.status).toBe('accepted');
    const winner = req.data()?.mechanicId as string;
    expect(['m8t-a', 'm8t-b']).toContain(winner);
    const offers = await db.collection('requests').doc('m8t-req-race').collection('offers').get();
    const byId = new Map(offers.docs.map((d) => [d.id, d.data().status]));
    expect(byId.get(winner)).toBe('accepted');
    expect(byId.get(winner === 'm8t-a' ? 'm8t-b' : 'm8t-a')).toBe('superseded');
  });

  it('rejects expired offers, missing offers, and ineligible mechanics', async () => {
    await createOfferBatch(db, 'm8t-req-expired');
    // Force expiry server-side, then attempt.
    const offers = await db.collection('requests').doc('m8t-req-expired').collection('offers').get();
    for (const d of offers.docs) {
      await d.ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1_000) });
    }
    expect(await acceptOfferTx(db, 'm8t-req-expired', 'm8t-a', Date.now())).toBe('expired');
    expect(await acceptOfferTx(db, 'm8t-req-expired', 'm8t-unknown-mech', Date.now())).toBe('no-offer');
    expect(await declineOfferTx(db, 'm8t-req-decline', 'm8t-unknown-mech')).toBe('alreadyTaken');
    // Unapprove a mechanic mid-flight → ineligible.
    await db.collection('mechanics').doc('m8t-b').update({ approved: false });
    expect(await acceptOfferTx(db, 'm8t-req-batch', 'm8t-b', Date.now())).toBe('ineligible');
    await db.collection('mechanics').doc('m8t-b').update({ approved: true });
  });

  it('decline appends but rematch does not reset another live mechanic offer', async () => {
    await createOfferBatch(db, 'm8t-req-decline');
    expect(await declineOfferTx(db, 'm8t-req-decline', 'm8t-a')).toBe('declined');
    const req = await db.collection('requests').doc('m8t-req-decline').get();
    expect(req.data()?.declinedBy).toContain('m8t-a');
    const res = await rematchRequest(db, 'm8t-req-decline');
    expect(res.offers).toBe(0);
    expect(res.stopped).toBe('offers-pending');
    const offers = await db.collection('requests').doc('m8t-req-decline').collection('offers').get();
    const pending = offers.docs.filter((d) => d.data().status === 'pending').map((d) => d.id);
    expect(pending).toEqual(['m8t-b']); // a never receives the same request again
  });

  it('terminates: rounds cap and no-eligible stop rematching honestly', async () => {
    // Exhaust rounds on the decline request (already round ≥1).
    let last = { offers: 1, stopped: null as string | null };
    for (let i = 0; i < 7 && last.stopped !== 'rounds-exhausted'; i++) {
      await expireStaleOffers(db, 'm8t-req-decline', Date.now() + 999_999_999);
      last = await rematchRequest(db, 'm8t-req-decline');
    }
    expect(last.stopped).toBe('rounds-exhausted');
    const req = await db.collection('requests').doc('m8t-req-decline').get();
    expect(req.data()?.status).toBe('requested'); // honest waiting state, no fake state
    // The loop expires each round before opening the next; no pending offer remains.
    expect(await expireStaleOffers(db, 'm8t-req-decline', Date.now() + 999_999_999)).toBe(0);
  });

  it('enforces the transactional active-job limit', async () => {
    for (let i = 0; i < 3; i++) {
      await openActiveJob(db, `m8t-active-${i}`, 'm8t-a');
    }
    await db.collection('requests').doc('m8t-req-active-limit').set({
      id: 'm8t-req-active-limit',
      customerId: 'm8t-cust',
      vehicleId: 'm8t-veh-1',
      problemText: 'M8 active job limit request payload',
      customerLat: 12.9716,
      customerLng: 77.5946,
      status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: null,
    });
    await db.collection('requests').doc('m8t-req-active-limit').collection('offers').doc('m8t-a').set({
      requestId: 'm8t-req-active-limit',
      customerId: 'm8t-cust',
      mechanicId: 'm8t-a',
      mechanicName: 'm8t-a',
      expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      status: 'pending',
      round: 0,
    });
    expect(await acceptOfferTx(db, 'm8t-req-active-limit', 'm8t-a', Date.now())).toBe('ineligible');
  });

  it('accept racing decline commits one consistent terminal result', async () => {
    const mechanicId = 'm8t-race-only';
    await db.collection('mechanics').doc(mechanicId).set({
      uid: mechanicId, name: mechanicId, approved: true, verificationStatus: 'approved',
      specialties: ['tow'], vehicleTypes: ['car'], serviceRadiusKm: 30, isAvailable: true,
      baseLat: 12.9716, baseLng: 77.5946, rating: 0, reviewCount: 0,
    });
    await seedOffer('m8t-req-accept-decline', mechanicId);
    const [accept, decline] = await Promise.all([
      acceptOfferTx(db, 'm8t-req-accept-decline', mechanicId, Date.now()),
      declineOfferTx(db, 'm8t-req-accept-decline', mechanicId),
    ]);
    const req = await db.collection('requests').doc('m8t-req-accept-decline').get();
    const offer = await db.collection('requests').doc('m8t-req-accept-decline').collection('offers').doc(mechanicId).get();
    if (accept === 'accepted') {
      expect(req.data()?.mechanicId).toBe(mechanicId);
      expect(offer.data()?.status).toBe('accepted');
      expect(decline).toBe('alreadyTaken');
    } else {
      expect(['expired', 'alreadyTaken']).toContain(accept);
      expect(decline).toBe('declined');
      expect(req.data()?.status).toBe('requested');
      expect(req.data()?.declinedBy).toContain(mechanicId);
      expect(offer.data()?.status).toBe('declined');
    }
  });

  it('cancellation closes multiple pending offers idempotently and blocks acceptance', async () => {
    await seedOffer('m8t-req-cancel', 'm8t-a');
    await seedOffer('m8t-req-cancel', 'm8t-b');
    await db.collection('requests').doc('m8t-req-cancel').update({ status: 'cancelled' });
    expect(await supersedePendingOffers(db, 'm8t-req-cancel')).toBe(2);
    expect(await supersedePendingOffers(db, 'm8t-req-cancel')).toBe(0);
    expect(await acceptOfferTx(db, 'm8t-req-cancel', 'm8t-a', Date.now())).toBe('alreadyTaken');
    const offers = await db.collection('requests').doc('m8t-req-cancel').collection('offers').get();
    expect(offers.docs.map((d) => d.data().status)).toEqual(['superseded', 'superseded']);
  });

  it('cancellation racing dispatch leaves no actionable offers', async () => {
    await db.collection('requests').doc('m8t-req-cancel-race').set({
      id: 'm8t-req-cancel-race', customerId: 'm8t-cust', vehicleId: 'm8t-veh-1',
      problemText: 'M8 cancellation dispatch race', customerLat: 12.9716, customerLng: 77.5946,
      status: 'requested', mechanicId: null,
    });
    await seedOffer('m8t-req-cancel-race', 'm8t-a');
    const [cancelled, rematch] = await Promise.all([
      (async () => {
        await db.collection('requests').doc('m8t-req-cancel-race').update({ status: 'cancelled' });
        return supersedePendingOffers(db, 'm8t-req-cancel-race');
      })(),
      rematchRequest(db, 'm8t-req-cancel-race'),
    ]);
    expect(cancelled).toBeGreaterThanOrEqual(1);
    expect(rematch.stopped === 'not-open' || rematch.stopped === 'round-changed' || rematch.stopped === 'offers-pending' || rematch.offers > 0).toBe(true);
    expect(await acceptOfferTx(db, 'm8t-req-cancel-race', 'm8t-a', Date.now())).toBe('alreadyTaken');
    const offers = await db.collection('requests').doc('m8t-req-cancel-race').collection('offers').get();
    expect(offers.docs.every((d) => d.data().status !== 'pending')).toBe(true);
  });

  it('expiry racing decline leaves no pending expired offer and rematches once', async () => {
    await seedOffer('m8t-req-expiry-decline', 'm8t-a', Date.now() - 1);
    await db.collection('requests').doc('m8t-req-expiry-decline').set({
      id: 'm8t-req-expiry-decline', customerId: 'm8t-cust', vehicleId: 'm8t-veh-1',
      problemText: 'M8 expiry race', customerLat: 12.9716, customerLng: 77.5946,
      status: 'requested', mechanicId: null,
    });
    const [expired, declined] = await Promise.all([
      expireStaleOffers(db, 'm8t-req-expiry-decline', Date.now()),
      declineOfferTx(db, 'm8t-req-expiry-decline', 'm8t-a'),
    ]);
    expect(expired + (declined === 'declined' ? 1 : 0)).toBeGreaterThanOrEqual(1);
    const offer = await db.collection('requests').doc('m8t-req-expiry-decline').collection('offers').doc('m8t-a').get();
    expect(['expired', 'declined']).toContain(offer.data()?.status);
    const results = await Promise.all([
      rematchRequest(db, 'm8t-req-expiry-decline'),
      rematchRequest(db, 'm8t-req-expiry-decline'),
    ]);
    const req = await db.collection('requests').doc('m8t-req-expiry-decline').get();
    expect(req.data()?.rematchRound).toBe(1);
    expect(results.filter((r) => r.offers > 0)).toHaveLength(1);
  });

  it('repeated concurrent sweeps advance a rematch round only once', async () => {
    await db.collection('requests').doc('m8t-req-sweep-once').set({
      id: 'm8t-req-sweep-once', customerId: 'm8t-cust', vehicleId: 'm8t-veh-1',
      problemText: 'M8 concurrent sweep', customerLat: 12.9716, customerLng: 77.5946,
      status: 'requested', mechanicId: null,
    });
    const results = await Promise.all([
      sweepRequest(db, 'm8t-req-sweep-once', Date.now()),
      sweepRequest(db, 'm8t-req-sweep-once', Date.now()),
    ]);
    const request = await db.collection('requests').doc('m8t-req-sweep-once').get();
    expect(request.data()?.rematchRound).toBe(1);
    expect(results.filter((result) => result.rematched)).toHaveLength(2);
    const pending = await db.collection('requests').doc('m8t-req-sweep-once').collection('offers').where('status', '==', 'pending').get();
    expect(pending.size).toBeGreaterThan(0);
  });

  it('retries after completion do not reassign or rematch', async () => {
    expect(await acceptOfferTx(db, 'm8t-req-completed', 'm8t-a', Date.now())).toBe('alreadyTaken');
    expect((await rematchRequest(db, 'm8t-req-completed')).stopped).toBe('not-open');
    expect(await sweepRequest(db, 'm8t-req-completed', Date.now())).toMatchObject({ rematched: false });
  });

  it('eligibility revalidation: unavailable/unapproved mechanics are not offered again', async () => {
    // Isolated locale so only these two mechanics are ever in radius for the
    // request — the Bangalore fixtures are thousands of km away.
    const mkMechanic = (uid: string) =>
      db.collection('mechanics').doc(uid).set({
        uid, name: uid, approved: true, verificationStatus: 'approved',
        specialties: ['tow'], vehicleTypes: ['car'], experienceYears: 2, serviceRadiusKm: 30,
        isAvailable: true, garageName: uid, garageAddress: 'PRIVATE',
        baseLat: 10.0, baseLng: 10.0, rating: 0, reviewCount: 0,
      });
    await mkMechanic('m8t-elig-a');
    await mkMechanic('m8t-elig-b');
    const reqId = 'm8t-req-elig-race';
    await db.collection('requests').doc(reqId).set({
      id: reqId, customerId: 'm8t-cust', vehicleId: 'm8t-veh-1',
      problemText: 'M8 eligibility revalidation', customerLat: 10.0, customerLng: 10.0,
      status: 'requested', mechanicId: null,
    });

    try {
      // Round 1: both eligible mechanics get pending offers.
      const first = await rematchRequest(db, reqId);
      expect(first.stopped).toBeNull();
      let offers = await db.collection('requests').doc(reqId).collection('offers').get();
      const round1 = new Map(offers.docs.map((d) => [d.id, d.data().status]));
      expect(round1.get('m8t-elig-a')).toBe('pending');
      expect(round1.get('m8t-elig-b')).toBe('pending');

      // Flag m8t-elig-b unavailable, expire the round-1 batch, then rematch.
      await db.collection('mechanics').doc('m8t-elig-b').update({ isAvailable: false });
      await expireStaleOffers(db, reqId, Date.now() + 999_999_999);
      const second = await rematchRequest(db, reqId);
      expect(second.stopped).toBeNull();

      offers = await db.collection('requests').doc(reqId).collection('offers').get();
      const statuses = new Map(offers.docs.map((d) => [d.id, d.data().status]));
      expect(statuses.get('m8t-elig-a')).toBe('pending'); // still available → offered again
      expect(statuses.get('m8t-elig-b')).not.toBe('pending'); // unavailable → never reopened
    } finally {
      await db.collection('mechanics').doc('m8t-elig-b').update({ isAvailable: true }).catch(() => {});
      await db.collection('mechanics').doc('m8t-elig-a').delete().catch(() => {});
      await db.collection('mechanics').doc('m8t-elig-b').delete().catch(() => {});
      await db.collection('requests').doc(reqId).delete().catch(() => {});
    }
  });
});

describe('sweep + supersede (stranded-request and phantom-offer fixes)', () => {
  const openStranded = (id: string, extra: Record<string, unknown> = {}) =>
    db.collection('requests').doc(id).set({
      id,
      customerId: 'm8t-cust',
      vehicleId: 'm8t-veh-1',
      problemText: 'M8 sweep probe request payload',
      customerLat: 12.9716,
      customerLng: 77.5946,
      status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: null,
      ...(extra as Record<string, unknown>),
    });
  const seedOffer = (id: string, mechanicId: string, status: 'pending' | 'superseded' = 'pending') =>
    db.collection('requests').doc(id).collection('offers').doc(mechanicId).set({
      requestId: id,
      customerId: 'm8t-cust',
      mechanicId,
      mechanicName: mechanicId,
      expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      status,
      round: 0,
    });

  it('sweep rematches a stranded request that has zero offers', async () => {
    // Created while no mechanic was eligible (or the initial batch failed):
    // the old sweep never revisited these. Now the first sweep step re-opens
    // a batch, and eligible mechanics receive real offers.
    await openStranded('m8t-req-stranded');
    const res = await sweepRequest(db, 'm8t-req-stranded', Date.now());
    expect(res.rematched).toBe(true);
    const offers = await db.collection('requests').doc('m8t-req-stranded').collection('offers').get();
    expect(offers.size).toBeGreaterThanOrEqual(1);
    for (const d of offers.docs) expect(d.data().status).toBe('pending');
  });

  it('sweep leaves a request with live pending offers alone', async () => {
    await openStranded('m8t-req-live');
    await seedOffer('m8t-req-live', 'm8t-b');
    const res = await sweepRequest(db, 'm8t-req-live', Date.now());
    expect(res.rematched).toBe(false);
    const offer = await db.collection('requests').doc('m8t-req-live').collection('offers').doc('m8t-b').get();
    expect(offer.data()?.status).toBe('pending');
  });

  it('sweep stops rematch once the round budget is exhausted', async () => {
    await openStranded('m8t-req-exhausted', { rematchRound: 5 });
    const res = await sweepRequest(db, 'm8t-req-exhausted', Date.now());
    expect(res.rematched).toBe(false);
    const offers = await db.collection('requests').doc('m8t-req-exhausted').collection('offers').get();
    expect(offers.empty).toBe(true);
  });

  it('supersedePendingOffers closes leftover pending offers exactly once', async () => {
    // An out-of-band accept (e.g. claim-admin write) left siblings pending:
    // the defense-in-depth trigger step closes them so no phantom jobs stay
    // live in mechanic queues.
    await db.collection('requests').doc('m8t-req-phantom').set({
      id: 'm8t-req-phantom',
      customerId: 'm8t-cust',
      vehicleId: 'm8t-veh-1',
      problemText: 'M8 phantom-offer probe request payload',
      customerLat: 12.9716,
      customerLng: 77.5946,
      status: 'accepted',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: 'm8t-a',
      mechanicName: 'm8t-a',
    });
    await seedOffer('m8t-req-phantom', 'm8t-a');
    await seedOffer('m8t-req-phantom', 'm8t-b');
    expect(await supersedePendingOffers(db, 'm8t-req-phantom')).toBe(2);
    const offers = await db.collection('requests').doc('m8t-req-phantom').collection('offers').get();
    for (const d of offers.docs) expect(d.data().status).toBe('superseded');
    expect(await supersedePendingOffers(db, 'm8t-req-phantom')).toBe(0);
  });
});

describe('completed-request rating aggregation', () => {
  const ratedRequest = (id: string, mechanicId = 'm8t-rating-default', rating = 4) => ({
    id, customerId: 'm8t-cust', vehicleId: 'm8t-veh-1', problemText: 'Rated service',
    customerLat: 12.9716, customerLng: 77.5946, status: 'completed' as const,
    mechanicId, rating, createdAt: Date.now(), updatedAt: Date.now(),
  });
  const seedRatingMechanic = async (uid: string) => db.collection('mechanics').doc(uid).set({
    uid, name: uid, approved: true, isAvailable: true, rating: 0, ratingTotal: 0, reviewCount: 0,
  });

  it('aggregates once and safely reprocesses the same event', async () => {
    const request = ratedRequest('m8t-rating-first', 'm8t-rating-first-mech');
    await db.collection('requests').doc(request.id).set(request);
    await seedRatingMechanic('m8t-rating-first-mech');
    await aggregateCompletedRating(db, request.id, request);
    await aggregateCompletedRating(db, request.id, request);
    const profile = (await db.collection('mechanics').doc('m8t-rating-first-mech').get()).data();
    expect(profile?.reviewCount).toBe(1);
    expect(profile?.ratingTotal).toBe(4);
    expect(profile?.rating).toBe(4);
  });

  it('applies an edit as a delta without increasing review count', async () => {
    const first = ratedRequest('m8t-rating-edit', 'm8t-rating-edit-mech', 3);
    await db.collection('requests').doc(first.id).set(first);
    await seedRatingMechanic('m8t-rating-edit-mech');
    await aggregateCompletedRating(db, first.id, first);
    await db.collection('requests').doc(first.id).update({ rating: 5 });
    await aggregateCompletedRating(db, first.id, { ...first, rating: 5 });
    const profile = (await db.collection('mechanics').doc('m8t-rating-edit-mech').get()).data();
    expect(profile?.reviewCount).toBe(1);
    expect(profile?.ratingTotal).toBe(5);
    expect(profile?.rating).toBe(5);
  });

  it('ignores out-of-order events and transfers a review when association changes', async () => {
    const first = ratedRequest('m8t-rating-order', 'm8t-rating-old-mech', 2);
    await db.collection('requests').doc(first.id).set(first);
    await seedRatingMechanic('m8t-rating-old-mech');
    await seedRatingMechanic('m8t-rating-new-mech');
    await aggregateCompletedRating(db, first.id, first);
    await db.collection('requests').doc(first.id).update({ rating: 5, mechanicId: 'm8t-rating-new-mech' });
    const latest = { ...first, rating: 5, mechanicId: 'm8t-rating-new-mech' };
    await aggregateCompletedRating(db, first.id, latest);
    const afterTransfer = await db.collection('mechanics').doc('m8t-rating-old-mech').get();
    expect(afterTransfer.data()?.reviewCount).toBe(0);
    await aggregateCompletedRating(db, first.id, first);
    const [oldProfile, newProfile] = await Promise.all([
      db.collection('mechanics').doc('m8t-rating-old-mech').get(), db.collection('mechanics').doc('m8t-rating-new-mech').get(),
    ]);
    expect(oldProfile.data()?.reviewCount).toBe(0);
    expect(oldProfile.data()?.ratingTotal).toBe(0);
    expect(newProfile.data()?.reviewCount).toBe(1);
    expect(newProfile.data()?.ratingTotal).toBe(5);
  });

  it('does not guess totals for legacy markers missing aggregation metadata', async () => {
    const request = ratedRequest('m8t-rating-legacy', 'm8t-rating-legacy-mech');
    await db.collection('requests').doc(request.id).set({ ...request, ratingAggregated: true });
    await db.collection('mechanics').doc('m8t-rating-legacy-mech').set({
      uid: 'm8t-rating-legacy-mech', rating: 2, ratingTotal: 2, reviewCount: 1,
    });
    await aggregateCompletedRating(db, request.id, request);
    expect((await db.collection('mechanics').doc('m8t-rating-legacy-mech').get()).data()).toMatchObject({
      rating: 2, ratingTotal: 2, reviewCount: 1,
    });
    expect((await db.collection('requests').doc(request.id).get()).data()?.aggregatedRating).toBeUndefined();
  });

  it('does not count an event when the request mechanic association is missing or the profile is gone', async () => {
    const request = ratedRequest('m8t-rating-missing', 'm8t-rating-missing-mech');
    await db.collection('requests').doc(request.id).set({ ...request, mechanicId: null });
    await seedRatingMechanic('m8t-rating-missing-mech');
    await aggregateCompletedRating(db, request.id, request);
    expect((await db.collection('mechanics').doc('m8t-rating-missing-mech').get()).data()?.reviewCount).toBe(0);

    const deletedMechanicEvent = ratedRequest('m8t-rating-deleted', 'm8t-deleted', 5);
    await db.collection('requests').doc(deletedMechanicEvent.id).set(deletedMechanicEvent);
    await aggregateCompletedRating(db, deletedMechanicEvent.id, deletedMechanicEvent);
    expect((await db.collection('requests').doc(deletedMechanicEvent.id).get()).data()?.ratingAggregated).toBeUndefined();
  });
});
