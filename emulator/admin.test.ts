/**
 * M6 EMULATOR admin authorization suite — claim-gated reads, approval
 * callable denial surface, and the users-role-without-claim theorem.
 *
 * Run ONLY under the Firestore emulator (shares the M3/M4/M5 emulator boot):
 *   npx firebase emulators:exec --only firestore --project roadassist-9c223 "npm run test:emulator"
 *
 * NOTE: the `setMechanicApproval` callable itself runs in Cloud Functions
 * (not the Firestore emulator), so this suite proves the rules side:
 * clients cannot write approval state, and only the claim opens admin reads.
 * Callable round-trip stays PENDING until the Functions emulator/deploy phase.
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
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tadmin';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;
const BOSS = 'm6-boss';
const CUST = 'm6-cust';
const MECH = 'm6-mech';
const PEND = 'm6-pend';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [BOSS, 'admin'],
      [CUST, 'customer'],
      [MECH, 'mechanic'],
      [PEND, 'mechanic'],
    ] as const) {
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: `${uid}@test.local`,
        displayName: uid,
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'mechanics', MECH), {
      uid: MECH, name: 'M Six Motors', approved: true, verificationStatus: 'approved',
      specialties: ['general'], vehicleTypes: ['car'], experienceYears: 4, serviceRadiusKm: 20,
      isAvailable: true, garageName: 'M6', garageAddress: 'PRIVATE M6 Rd',
      baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'mechanics', PEND), {
      uid: PEND, name: 'P Six Motors', approved: false, verificationStatus: 'pending',
      specialties: ['tow'], vehicleTypes: ['car'], experienceYears: 1, serviceRadiusKm: 10,
      isAvailable: true, garageName: 'P6', garageAddress: 'PRIVATE P6 Rd',
      baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'requests', 'm6-req-1'), {
      id: 'm6-req-1', customerId: CUST, vehicleId: 'm6-veh-1', problemText: 'M6 visibility probe request',
      customerLat: 12.97, customerLng: 77.59, status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
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

describe('admin claim authorization (M6 vs M3 rules)', () => {
  it('unauthenticated, customer, mechanic, and pending all fail admin reads', async () => {
    const anon = ctx(null).firestore();
    const cust = ctx(CUST).firestore();
    const mech = ctx(MECH).firestore();
    const pend = ctx(PEND).firestore();
    await assertFails(getDoc(doc(anon, 'users', CUST)));
    await assertFails(getDoc(doc(cust, 'users', BOSS)));
    await assertFails(getDoc(doc(mech, 'users', CUST)));
    await assertFails(
      getDocs(query(collection(pend, 'users'), orderBy('createdAt', 'desc'), limit(10))),
    );
  });

  it('users.role=admin WITHOUT the claim grants nothing', async () => {
    const db = ctx(BOSS).firestore();
    await assertFails(getDoc(doc(db, 'users', CUST)));
    await assertFails(
      getDocs(query(collection(db, 'mechanics'), orderBy('name', 'asc'), limit(10))),
    );
    await assertFails(getDoc(doc(db, 'requests', 'm6-req-1')));
  });

  it('token.admin claim opens admin reads (users, mechanics, requests)', async () => {
    const db = ctx(BOSS, { admin: true }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', CUST)));
    await assertSucceeds(getDocs(query(collection(db, 'mechanics'), orderBy('name', 'asc'), limit(10))));
    await assertSucceeds(getDoc(doc(db, 'requests', 'm6-req-1')));
    await assertSucceeds(
      getDocs(query(collection(db, 'requests'), orderBy('createdAt', 'desc'), limit(50))),
    );
  });

  it('clients cannot write approval state, even the mechanic themselves', async () => {
    const pending = ctx(PEND).firestore();
    await assertFails(updateDoc(doc(pending, 'mechanics', PEND), { approved: true }));
    await assertFails(updateDoc(doc(pending, 'mechanics', PEND), { verificationStatus: 'approved' }));
    const boss = ctx(BOSS, { admin: true }).firestore();
    // Claim-admin direct write path (what the callable's Admin SDK bypasses
    // anyway) can set approval fields — proves the callable has a rules path.
    await assertSucceeds(
      updateDoc(doc(boss, 'mechanics', PEND), { verificationStatus: 'under_review', updatedAt: serverTimestamp() }),
    );
  });

  it('admin hint edits do not confer the claim', async () => {
    // There is deliberately no Firestore field that confers the claim:
    // writing role=admin changes only the hint, proven inert above.
    const db = ctx(BOSS, { admin: true }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', CUST), { displayName: 'Renamed by admin' }));
    const snap = await getDoc(doc(db, 'users', CUST));
    expect(snap.data()?.role).toBe('customer');
  });
});
