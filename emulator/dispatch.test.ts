/**
 * M8 EMULATOR offer-pool rules suite — offers access matrix + first-win
 * race at the commit path, against the real M3+M8 rules.
 *
 * Run ONLY under the Firestore emulator (shares the phase boots):
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
import { Timestamp, collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tdispatch';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const A = 'm8-racer-a';
const B = 'm8-racer-b';
const CUST = 'm8-cust';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [A, 'mechanic'],
      [B, 'mechanic'],
      [CUST, 'customer'],
    ] as const) {
      await setDoc(doc(db, 'users', uid), {
        uid, email: `${uid}@test.local`, displayName: uid, role,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    for (const uid of [A, B]) {
      await setDoc(doc(db, 'mechanics', uid), {
        uid, name: uid, approved: true, verificationStatus: 'approved',
        specialties: ['tow'], vehicleTypes: ['car'], experienceYears: 2, serviceRadiusKm: 30,
        isAvailable: true, garageName: uid, garageAddress: `PRIVATE ${uid} Rd`,
        baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'vehicles', 'm8-veh-1'), {
      ownerId: CUST, make: 'Bajaj', model: 'Pulsar', year: 2023, plate: 'KA08M80008',
      type: 'bike', isDefault: true, createdAt: serverTimestamp(),
    });
    const open = (id: string) => setDoc(doc(db, 'requests', id), {
      id, customerId: CUST, vehicleId: 'm8-veh-1', problemText: 'M8 race probe request payload here',
      customerLat: 12.9716, customerLng: 77.5946, status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000), mechanicId: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await open('m8-req-race');
    await open('m8-req-offers');
    await open('m8-req-no-offer');
    // Server-written offers on m8-req-offers (as onRequestCreate would).
    const batch = [
      { id: A, name: 'm8-racer-a' },
      { id: B, name: 'm8-racer-b' },
    ];
    for (const m of batch) {
      await setDoc(doc(db, 'requests', 'm8-req-offers', 'offers', m.id), {
        requestId: 'm8-req-offers', customerId: CUST, mechanicId: m.id, mechanicName: m.name,
        createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
        status: 'pending', round: 0,
      });
      await setDoc(doc(db, 'requests', 'm8-req-race', 'offers', m.id), {
        requestId: 'm8-req-race', customerId: CUST, mechanicId: m.id, mechanicName: m.name,
        createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
        status: 'pending', round: 0,
      });
    }
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

describe('offer-pool rules matrix (M8)', () => {
  it('addressed mechanic reads their offer; others and strangers cannot', async () => {
    const aDb = testEnv.authenticatedContext(A).firestore();
    await assertSucceeds(getDoc(doc(aDb, 'requests', 'm8-req-offers', 'offers', A)));
    // Filtered collection-group (the live queue query) passes: the
    // mechanicId filter makes the scope provable to the rules engine.
    const mine = await getDocs(
      query(collectionGroup(aDb, 'offers'), where('mechanicId', '==', A), where('status', '==', 'pending')),
    );
    expect(mine.docs.length).toBeGreaterThanOrEqual(1);
    const bDb = testEnv.authenticatedContext(B).firestore();
    await assertFails(getDoc(doc(bDb, 'requests', 'm8-req-offers', 'offers', A)));
    const custDb = testEnv.authenticatedContext(CUST).firestore();
    await assertSucceeds(getDoc(doc(custDb, 'requests', 'm8-req-offers', 'offers', A)));
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'requests', 'm8-req-offers', 'offers', A)));
  });

  it('no client can create, modify, or delete offers', async () => {
    const aDb = testEnv.authenticatedContext(A).firestore();
    await assertFails(
      setDoc(doc(aDb, 'requests', 'm8-req-offers', 'offers', A), { forged: true }),
    );
    await assertFails(updateDoc(doc(aDb, 'requests', 'm8-req-offers', 'offers', A), { status: 'accepted' }));
    const custDb = testEnv.authenticatedContext(CUST).firestore();
    await assertFails(
      setDoc(doc(custDb, 'requests', 'm8-req-offers', 'offers', 'intruder'), { forged: true }),
    );
  });

  it('CONCURRENCY: client-direct assignment is denied — only the callable accepts', async () => {
    // Two eligible mechanics race the SAME open request with client-direct
    // writes. Under the server-only-accept rules BOTH writes are denied:
    // there is no last-writer-wins window left to exploit, and the request
    // stays open and unassigned. The true first-win race (exactly one
    // winner, losers rejected with alreadyTaken) lives in the server
    // transaction, proven in dispatchTx.test.ts.
    const aDb = testEnv.authenticatedContext(A).firestore();
    const bDb = testEnv.authenticatedContext(B).firestore();
    const accept = (db: ReturnType<typeof aDb>, uid: string, name: string) =>
      updateDoc(doc(db, 'requests', 'm8-req-race'), {
        status: 'accepted', mechanicId: uid, mechanicName: name, updatedAt: serverTimestamp(),
      });
    const [ra, rb] = await Promise.allSettled([accept(aDb, A, 'm8-racer-a'), accept(bDb, B, 'm8-racer-b')]);
    expect(ra.status).toBe('rejected');
    expect(rb.status).toBe('rejected');
    // Final state is read with rules disabled: it is test introspection, not
    // an access assertion.
    let final: Record<string, unknown> = {};
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const snap = await getDoc(doc(adminCtx.firestore(), 'requests', 'm8-req-race'));
      final = (snap.data() ?? {}) as Record<string, unknown>;
    });
    expect(final.status).toBe('requested');
    expect(final.mechanicId == null || final.mechanicId === '').toBe(true);
  });

  it('rejects cross-mechanic and no-offer direct assignment attempts', async () => {
    const aDb = testEnv.authenticatedContext(A).firestore();
    const bDb = testEnv.authenticatedContext(B).firestore();
    await assertFails(updateDoc(doc(bDb, 'requests', 'm8-req-offers'), {
      status: 'accepted', mechanicId: A, mechanicName: 'm8-racer-a', updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(aDb, 'requests', 'm8-req-no-offer'), {
      status: 'accepted', mechanicId: A, mechanicName: 'm8-racer-a', updatedAt: serverTimestamp(),
    }));
  });
});
