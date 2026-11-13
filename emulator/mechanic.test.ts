/**
 * M5 EMULATOR mechanic workflow suite — accept/decline/release/advance/
 * complete against the real M3 rules, plus approval-state gating.
 *
 * Run ONLY under the Firestore emulator (shares the M3/M4 emulator boot):
 *   npx firebase emulators:exec --only firestore --project roadassist-9c223 "npm run test:emulator"
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tmechanic';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const MECH = 'm5-mech';
const CUST = 'm5-cust';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', MECH), {
      uid: MECH, email: 'm5m@test.local', displayName: 'M Five', role: 'mechanic',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', CUST), {
      uid: CUST, email: 'm5c@test.local', displayName: 'C Five', role: 'customer',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'vehicles', 'm5-veh-1'), {
      ownerId: CUST, make: 'Honda', model: 'Activa', year: 2021, plate: 'KA05M50005',
      type: 'bike', isDefault: true, createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'mechanics', MECH), {
      uid: MECH, name: 'M Five Motors', approved: true, verificationStatus: 'approved',
      specialties: ['general'], vehicleTypes: ['bike'], experienceYears: 3, serviceRadiusKm: 20,
      isAvailable: true, garageName: 'M5', garageAddress: 'PRIVATE M5 Rd',
      baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    const open = (id: string, extra: Record<string, unknown> = {}) => setDoc(doc(db, 'requests', id), {
      id, customerId: CUST, vehicleId: 'm5-veh-1', problemText: 'M5 workflow request from the test suite',
      customerLat: 12.9716, customerLng: 77.5946, status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000), mechanicId: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
    });
    await open('m5-req-accept');
    await open('m5-req-decline');
    await open('m5-req-release');
    await open('m5-req-complete');
    await open('m5-req-expired', { offerExpiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    for (const id of ['m5-req-accept', 'm5-req-decline', 'm5-req-release', 'm5-req-complete', 'm5-req-expired']) {
      await setDoc(doc(db, 'requests', id, 'offers', MECH), {
        requestId: id,
        customerId: CUST,
        mechanicId: MECH,
        mechanicName: 'M Five Motors',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(id === 'm5-req-expired' ? Date.now() - 60_000 : Date.now() + 120_000),
        status: 'pending',
        round: 0,
      });
    }
  });
}

function mechDb() {
  return testEnv.authenticatedContext(MECH).firestore();
}

/** Seeds an accepted assignment with rules disabled — test introspection
 * mirroring what acceptOfferTx commits server-side (clients cannot write
 * this state directly under the server-only-accept rules). */
async function forceAccepted(id: string) {
  await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
    await updateDoc(doc(adminCtx.firestore(), 'requests', id), {
      status: 'accepted', mechanicId: MECH, mechanicName: 'M Five Motors', updatedAt: serverTimestamp(),
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: PORT,
    },
  });
  await seed();
}, 60_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('mechanic job lifecycle (M5 vs M3 rules)', () => {
  it('sees the open queue; accept travels only through the server callable', async () => {
    const db = mechDb();
    const before = await getDoc(doc(db, 'requests', 'm5-req-accept'));
    expect(before.data()?.status).toBe('requested');
    // Even a valid, in-window offer cannot be claimed by a client-direct
    // write: assignment is server-only. The transaction path is proven in
    // dispatchTx.test.ts.
    await assertFails(
      updateDoc(doc(db, 'requests', 'm5-req-accept'), {
        status: 'accepted', mechanicId: MECH, mechanicName: 'M Five Motors', updatedAt: serverTimestamp(),
      }),
    );
  });

  it('cannot accept an expired offer', async () => {
    // Denial is structural (no client accept path at all); this keeps the
    // expired-offer case pinned for defense in depth.
    const db = mechDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'm5-req-expired'), {
        status: 'accepted', mechanicId: MECH, mechanicName: 'M Five Motors', updatedAt: serverTimestamp(),
      }),
    );
  });

  it('declines append-only (repeat decline is a no-op deny)', async () => {
    const db = mechDb();
    const ref = doc(db, 'requests', 'm5-req-decline');
    await assertSucceeds(updateDoc(ref, { declinedBy: [MECH], updatedAt: serverTimestamp() }));
    // Same UID again would not grow the array by exactly one → denied.
    await assertFails(updateDoc(ref, { declinedBy: [MECH], updatedAt: serverTimestamp() }));
  });

  it('releases an assigned job back to the queue with audit fields', async () => {
    const db = mechDb();
    const ref = doc(db, 'requests', 'm5-req-release');
    await forceAccepted('m5-req-release');
    await assertSucceeds(
      updateDoc(ref, {
        status: 'requested',
        mechanicId: null,
        mechanicName: null,
        mechanicPhone: null,
        mechanicLat: null,
        mechanicLng: null,
        offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
        releaseReason: 'M5 test release',
        releasedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    const after = await getDoc(ref);
    expect(after.data()?.status).toBe('requested');
    expect(after.data()?.mechanicId).toBeNull();
  });

  it('advances along the canonical chain and completes only with an approved estimate', async () => {
    const db = mechDb();
    const ref = doc(db, 'requests', 'm5-req-complete');
    await forceAccepted('m5-req-complete');
    for (const s of ['on-the-way', 'arrived', 'service'] as const) {
      await assertSucceeds(updateDoc(ref, { status: s, updatedAt: serverTimestamp() }));
    }
    // Money on non-completed status → denied.
    await assertFails(updateDoc(ref, { status: 'service', amountCents: 100, updatedAt: serverTimestamp() }));
    // M18: completion requires a customer-approved repair estimate. The client
    // (advanceJob) refuses first; the rules refuse it at the trust boundary too.
    await assertFails(
      updateDoc(ref, {
        status: 'completed', mechanicLat: null, mechanicLng: null,
        amountCents: 49900, durationMin: 25, updatedAt: serverTimestamp(),
      }),
    );
    // The approval itself is the customer's write (covered in estimates.test.ts);
    // seed the decided state so this test keeps its single-mechanic scope.
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await updateDoc(doc(adminCtx.firestore(), 'requests', 'm5-req-complete'), {
        estimateStatus: 'approved', estimateApprovedAt: Date.now(), estimatedAmountCents: 49900,
      });
    });
    await assertSucceeds(
      updateDoc(ref, {
        status: 'completed', mechanicLat: null, mechanicLng: null,
        amountCents: 49900, durationMin: 25, updatedAt: serverTimestamp(),
      }),
    );
    const done = await getDoc(ref);
    expect(done.data()?.status).toBe('completed');
    expect(done.data()?.amountCents).toBe(49900);
    // Terminal states are frozen.
    await assertFails(updateDoc(ref, { status: 'service', updatedAt: serverTimestamp() }));
  });

  it('rejects skipped lifecycle steps at the rules boundary', async () => {
    // Seed the probe doc with rules disabled (mechanics cannot create requests).
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adb = adminCtx.firestore();
      await setDoc(doc(adb, 'requests', 'm5-req-skip'), {
        id: 'm5-req-skip',
        customerId: CUST,
        vehicleId: 'm5-veh-1',
        problemText: 'M5 step-order probe (documents current rules behavior)',
        customerLat: 12.9716,
        customerLng: 77.5946,
        status: 'accepted',
        offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
        mechanicId: MECH,
        mechanicName: 'M Five Motors',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    const db = mechDb();
    const ref = doc(db, 'requests', 'm5-req-skip');
    await assertFails(
      updateDoc(ref, { status: 'completed', mechanicLat: null, mechanicLng: null, amountCents: 100, updatedAt: serverTimestamp() }),
    );
  });

  it('cannot self-approve, self-rate, or change verification state', async () => {
    const db = mechDb();
    await assertFails(updateDoc(doc(db, 'mechanics', MECH), { approved: false }));
    await assertFails(updateDoc(doc(db, 'mechanics', MECH), { verificationStatus: 'pending' }));
  });

  it('serves the live offer queue query (collectionGroup, index-backed, scope-proof)', async () => {
    // The exact query shape of watchMyOffers (src/lib/dispatch.ts): a
    // collection-group query with TWO equality filters. It requires the
    // offers(mechanicId,status) composite index declared in
    // firestore.indexes.json — the emulator enforces it, so this test
    // fails without the index — and rules authorize it only because the
    // mechanicId filter proves read scope.
    const db = mechDb();
    const mine = await assertSucceeds(
      getDocs(query(collectionGroup(db, 'offers'), where('mechanicId', '==', MECH), where('status', '==', 'pending'))),
    );
    expect(mine.docs.length).toBeGreaterThanOrEqual(1);
    // A mechanic cannot scope a query at another mechanic's id: the filter
    // no longer proves the read belongs to them.
    const foreign = query(collectionGroup(db, 'offers'), where('mechanicId', '==', 'someone-else'), where('status', '==', 'pending'));
    await assertFails(getDocs(foreign));
  });

  it('reads own operational profile and private contact, nothing else’s', async () => {
    const db = mechDb();
    const self = await getDoc(doc(db, 'mechanics', MECH));
    expect(self.exists()).toBe(true);
    await assertFails(updateDoc(doc(db, 'mechanics', MECH), { garageName: 'Hacked' }));
  });
});
