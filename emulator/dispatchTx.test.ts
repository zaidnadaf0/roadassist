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

  it('decline appends + rematch opens the next batch without repeats', async () => {
    await createOfferBatch(db, 'm8t-req-decline');
    expect(await declineOfferTx(db, 'm8t-req-decline', 'm8t-a')).toBe('declined');
    const req = await db.collection('requests').doc('m8t-req-decline').get();
    expect(req.data()?.declinedBy).toContain('m8t-a');
    const res = await rematchRequest(db, 'm8t-req-decline');
    expect(res.offers).toBe(1);
    const offers = await db.collection('requests').doc('m8t-req-decline').collection('offers').get();
    const pending = offers.docs.filter((d) => d.data().status === 'pending').map((d) => d.id);
    expect(pending).toEqual(['m8t-b']); // a never receives the same request again
  });

  it('terminates: rounds cap and no-eligible stop rematching honestly', async () => {
    // Exhaust rounds on the decline request (already round ≥1).
    let last = { offers: 1, stopped: null as string | null };
    for (let i = 0; i < 7 && last.stopped !== 'rounds-exhausted'; i++) {
      last = await rematchRequest(db, 'm8t-req-decline');
    }
    expect(last.stopped).toBe('rounds-exhausted');
    const req = await db.collection('requests').doc('m8t-req-decline').get();
    expect(req.data()?.status).toBe('requested'); // honest waiting state, no fake state
    // Leftover pending offers from the last live round expire under the sweep clock.
    expect(await expireStaleOffers(db, 'm8t-req-decline', Date.now() + 999_999_999)).toBeGreaterThanOrEqual(1);
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
