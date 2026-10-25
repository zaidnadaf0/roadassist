/**
 * M7 EMULATOR location-security suite — live-location write boundaries and
 * projection privacy, against the real M3 rules.
 *
 * Run ONLY under the Firestore emulator (shares the M3–M6 emulator boot):
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
import { Timestamp, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tlocation';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const MECH = 'm7-mech';
const OTHER = 'm7-other-mech';
const CUST = 'm7-cust';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [MECH, 'mechanic'],
      [OTHER, 'mechanic'],
      [CUST, 'customer'],
    ] as const) {
      await setDoc(doc(db, 'users', uid), {
        uid, email: `${uid}@test.local`, displayName: uid, role,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    for (const uid of [MECH, OTHER]) {
      await setDoc(doc(db, 'mechanics', uid), {
        uid, name: uid, approved: true, verificationStatus: 'approved',
        specialties: ['general'], vehicleTypes: ['car'], experienceYears: 3, serviceRadiusKm: 20,
        isAvailable: true, garageName: uid, garageAddress: `PRIVATE ${uid} Rd`,
        baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'vehicles', 'm7-veh-1'), {
      ownerId: CUST, make: 'TVS', model: 'Jupiter', year: 2022, plate: 'KA07M70007',
      type: 'bike', isDefault: true, createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'requests', 'm7-req-live'), {
      id: 'm7-req-live', customerId: CUST, vehicleId: 'm7-veh-1',
      problemText: 'M7 live-location probe request',
      customerLat: 12.9716, customerLng: 77.5946, status: 'on-the-way',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: MECH, mechanicName: 'm7-mech',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'publicMechanics', MECH), {
      name: 'm7-mech', approved: true, isAvailable: true, baseLat: 12.97, baseLng: 77.59,
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

describe('live-location write boundaries (M7 vs M3 rules)', () => {
  it('mechanic pushes own profile fix (allowed keys, finite numbers)', async () => {
    const db = testEnv.authenticatedContext(MECH).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'mechanics', MECH), {
        currentLat: 12.972, currentLng: 77.595, locationUpdatedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
  });

  it('mechanic pushes the assigned request pin', async () => {
    const db = testEnv.authenticatedContext(MECH).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'm7-req-live'), {
        mechanicLat: 12.972, mechanicLng: 77.595, updatedAt: serverTimestamp(),
      }),
    );
  });

  it('mechanic cannot write another mechanic’s profile location', async () => {
    const db = testEnv.authenticatedContext(MECH).firestore();
    await assertFails(
      updateDoc(doc(db, 'mechanics', OTHER), { currentLat: 12.972, currentLng: 77.595, updatedAt: serverTimestamp() }),
    );
  });

  it('customer cannot write mechanic coordinates anywhere', async () => {
    const db = testEnv.authenticatedContext(CUST).firestore();
    await assertFails(updateDoc(doc(db, 'mechanics', MECH), { currentLat: 1, currentLng: 1 }));
    await assertFails(
      updateDoc(doc(db, 'requests', 'm7-req-live'), { mechanicLat: 1, mechanicLng: 1, updatedAt: serverTimestamp() }),
    );
  });

  it('profile live-location fields reject non-finite values', async () => {
    const db = testEnv.authenticatedContext(MECH).firestore();
    await assertFails(updateDoc(doc(db, 'mechanics', MECH), { currentLat: 'far', updatedAt: serverTimestamp() }));
  });

  it('projection carries no live or private coordinates', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const snap = await getDoc(doc(db, 'publicMechanics', MECH));
    expect(snap.exists()).toBe(true);
    const data = snap.data() ?? {};
    expect(data).not.toHaveProperty('currentLat');
    expect(data).not.toHaveProperty('currentLng');
    expect(data).not.toHaveProperty('garageAddress');
    expect(data).not.toHaveProperty('phone');
    // Coarse by construction: at most 2 decimals of precision.
    for (const k of ['baseLat', 'baseLng'] as const) {
      const v = data[k] as number | null;
      if (v != null) expect(Math.round(v * 100) / 100).toBe(v);
    }
  });
});
