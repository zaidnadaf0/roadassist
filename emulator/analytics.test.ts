/**
 * M13 EMULATOR analytics authorization — analytics queries obey the same
 * ownership boundaries (no separate analytics bypass exists).
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
import { Timestamp, collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tanalytics';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const A = 'm13-a-cust';
const B = 'm13-b-cust';
const MECH = 'm13-mech';
const BOSS = 'm13-boss';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [A, 'customer'],
      [B, 'customer'],
      [MECH, 'mechanic'],
      [BOSS, 'admin'],
    ] as const) {
      await setDoc(doc(db, 'users', uid), {
        uid, email: `${uid}@t.local`, displayName: uid, role,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'vehicles', 'm13-veh-a'), {
      ownerId: A, make: 'M', model: 'M', year: 2020, plate: 'KA13A1313',
      type: 'car', isDefault: true, createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'mechanics', MECH), {
      uid: MECH, name: 'M13 Motors', approved: true, verificationStatus: 'approved',
      specialties: ['general'], vehicleTypes: ['car'], experienceYears: 3, serviceRadiusKm: 20,
      isAvailable: true, garageName: 'M13', garageAddress: 'PRIVATE M13 Rd',
      baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'requests', 'm13-req-a'), {
      id: 'm13-req-a', customerId: A, vehicleId: 'm13-veh-a',
      problemText: 'M13 analytics probe request payload',
      customerLat: 12.97, customerLng: 77.59, status: 'completed',
      offerExpiresAt: Timestamp.fromMillis(Date.now() - 1000), mechanicId: MECH, mechanicName: 'M13 Motors',
      amountCents: 49900, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'requests', 'm13-req-a', 'offers', MECH), {
      requestId: 'm13-req-a', customerId: A, mechanicId: MECH, mechanicName: 'M13 Motors',
      createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() - 1000),
      status: 'accepted', round: 0,
    });
    await setDoc(doc(db, 'publicMechanics', MECH), {
      name: 'M13 Motors', approved: true, isAvailable: true, baseLat: 12.97, baseLng: 77.59,
    });
  });
}

function ctx(uid: string | null, claims: Record<string, unknown> = {}) {
  if (!uid) return testEnv.unauthenticatedContext();
  return testEnv.authenticatedContext(uid, { ...claims });
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

describe('analytics query boundaries (M13)', () => {
  it('customer analytics see only own requests; unfiltered listing denied', async () => {
    const db = ctx(A).firestore();
    const mine = await getDocs(
      query(collection(db, 'requests'), where('customerId', '==', A), orderBy('createdAt', 'desc'), limit(50)),
    );
    expect(mine.docs.length).toBe(1);
    // No owner filter → some doc unreadable → whole query denied.
    await assertFails(
      getDocs(query(collection(db, 'requests'), orderBy('createdAt', 'desc'), limit(50))),
    );
  });

  it('customer reads own request’s offers via subcollection; pool-wide scan denied', async () => {
    const db = ctx(A).firestore();
    await assertSucceeds(getDoc(doc(db, 'requests', 'm13-req-a', 'offers', MECH)));
    // A collection-group query without an ownership filter is not provable
    // to Firestore rules, even when the current dataset has one visible doc.
    await assertFails(getDocs(query(collectionGroup(db, 'offers'), limit(10))));
    const stranger = ctx(B).firestore();
    await assertFails(getDocs(query(collectionGroup(stranger, 'offers'), limit(10))));
  });

  it('other customer sees neither the request, its offers, nor the vehicles', async () => {
    const db = ctx(B).firestore();
    await assertFails(getDoc(doc(db, 'requests', 'm13-req-a')));
    await assertFails(getDoc(doc(db, 'requests', 'm13-req-a', 'offers', MECH)));
    await assertFails(getDoc(doc(db, 'vehicles', 'm13-veh-a')));
  });

  it('mechanic sees own jobs/offers but not the customer’s vehicles or inbox', async () => {
    const db = ctx(MECH).firestore();
    await assertSucceeds(getDoc(doc(db, 'requests', 'm13-req-a')));
    await assertSucceeds(getDoc(doc(db, 'requests', 'm13-req-a', 'offers', MECH)));
    await assertFails(getDoc(doc(db, 'vehicles', 'm13-veh-a')));
  });

  it('admin reads across collections; unauthenticated reads nothing', async () => {
    const boss = ctx(BOSS, { admin: true }).firestore();
    await assertSucceeds(getDocs(query(collection(boss, 'requests'), orderBy('createdAt', 'desc'), limit(50))));
    await assertSucceeds(getDocs(query(collectionGroup(boss, 'offers'), limit(50))));
    const anon = ctx(null).firestore();
    await assertFails(getDocs(query(collection(anon, 'requests'), orderBy('createdAt', 'desc'), limit(5))));
  });

  it('directory analytics use the projection (no exact coords leak)', async () => {
    const db = ctx(A).firestore();
    const snap = await getDoc(doc(db, 'publicMechanics', MECH));
    const data = snap.data() ?? {};
    expect(data).not.toHaveProperty('currentLat');
    expect(data).not.toHaveProperty('garageAddress');
    await assertFails(getDoc(doc(db, 'mechanics', MECH)));
  });
});
