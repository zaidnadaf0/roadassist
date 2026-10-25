/**
 * M4 EMULATOR customer happy-path suite — proves the client payloads the
 * M4 screens send actually pass the M3 rules (not just fail closed).
 *
 * Run ONLY under the Firestore emulator (shares the M3 emulator boot):
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
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { buildRequestPayload, buildVehiclePayload } from '../src/lib/customer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tcustomer';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const CUST = 'm4-customer';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', CUST), {
      uid: CUST,
      email: 'm4@test.local',
      displayName: 'M Four',
      role: 'customer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

function customerDb() {
  return testEnv.authenticatedContext(CUST).firestore();
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

describe('customer happy paths (M4 payloads vs M3 rules)', () => {
  it('creates a vehicle with the exact create shape', async () => {
    const db = customerDb();
    const ref = doc(collection(db, 'vehicles'));
    await assertSucceeds(setDoc(ref, buildVehiclePayload(CUST, {
      make: 'Maruti',
      model: 'Swift',
      year: 2020,
      plate: 'KA04M40004',
      type: 'car',
      isDefault: true,
    })));
    const snap = await getDoc(ref);
    expect(snap.exists()).toBe(true);
  });

  it('lists only its own vehicles', async () => {
    const db = customerDb();
    const snap = await getDocs(
      query(collection(db, 'vehicles'), where('ownerId', '==', CUST), orderBy('createdAt', 'desc'), limit(20)),
    );
    expect(snap.docs.length).toBeGreaterThan(0);
    for (const d of snap.docs) expect(d.data().ownerId).toBe(CUST);
  });

  it('creates a request with the exact create shape, then cancels it', async () => {
    const db = customerDb();
    const vehicles = await getDocs(
      query(collection(db, 'vehicles'), where('ownerId', '==', CUST), limit(1)),
    );
    expect(vehicles.empty).toBe(false);
    const vehicleId = vehicles.docs[0].id;

    const ref = doc(collection(db, 'requests'));
    const payload = buildRequestPayload(CUST, {
      vehicleId,
      problemText: 'M4 happy-path tow request from the test suite',
      problemCategory: 'tow',
      customerLat: 12.9716,
      customerLng: 77.5946,
    });
    await assertSucceeds(setDoc(ref, { id: ref.id, ...payload }));

    const created = await getDoc(ref);
    expect(created.data()?.status).toBe('requested');
    expect(created.data()?.mechanicId).toBeNull();
    expect(created.data()?.offerExpiresAt).toBeInstanceOf(Timestamp);

    // Cancel (live → cancelled with audit fields).
    await assertSucceeds(
      updateDoc(ref, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'customer',
        cancellationReason: 'M4 test cleanup',
        updatedAt: serverTimestamp(),
      }),
    );
    const cancelled = await getDoc(ref);
    expect(cancelled.data()?.status).toBe('cancelled');
    expect(cancelled.data()?.cancelledBy).toBe('customer');
  });

  it('uses a deterministic request key to prevent duplicate and conflicting retries', async () => {
    const db = customerDb();
    const vehicles = await getDocs(query(collection(db, 'vehicles'), where('ownerId', '==', CUST), limit(1)));
    expect(vehicles.empty).toBe(false);
    const ref = doc(db, 'requests', 'm4-idempotency-key');
    const payload = buildRequestPayload(CUST, {
      vehicleId: vehicles.docs[0].id,
      problemText: 'M4 idempotency probe request payload',
      problemCategory: 'tow',
      customerLat: 12.9716,
      customerLng: 77.5946,
    });
    const writes = await Promise.allSettled([
      setDoc(ref, { id: ref.id, ...payload }),
      setDoc(ref, { id: ref.id, ...payload }),
    ]);
    expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await assertFails(setDoc(ref, {
      id: ref.id,
      ...payload,
      problemText: 'M4 conflicting retry must not overwrite the original request',
    }));
    const stored = await getDoc(ref);
    expect(stored.data()?.problemText).toBe(payload.problemText);
  });

  it('rejects short problem text at create', async () => {
    const db = customerDb();
    const ref = doc(collection(db, 'requests'));
    const payload = buildRequestPayload(CUST, {
      vehicleId: 'veh-alice-1',
      problemText: 'ok this is long enough for the rule',
      customerLat: 12.97,
      customerLng: 77.59,
    });
    // Tampered: too-short text + someone else's vehicle.
    await assertFails(setDoc(ref, { id: ref.id, ...payload, problemText: 'hi' }));
  });
});
