/**
 * M3 EMULATOR security suite — runtime proof for firestore.rules.
 *
 * Run ONLY under the Firestore emulator:
 *   npx firebase emulators:exec --only firestore --project roadassist-9c223 "npm run test:emulator"
 *
 * Covers: unauthenticated denial, ownership, role-escalation blocks,
 * mechanic approval boundary, lifecycle/integrity guards, claim authority
 * (role-without-claim grants nothing), and the projection privacy boundary.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-tsecurity';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-customer';
const BOB = 'bob-customer';
const MEG = 'meg-mechanic';
const OTHER = 'other-approved-mechanic';
const UNA = 'una-mechanic-unapproved';
const ADMIN = 'ada-admin';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [ALICE, 'customer'],
      [BOB, 'customer'],
      [MEG, 'mechanic'],
      [OTHER, 'mechanic'],
      [UNA, 'mechanic'],
      [ADMIN, 'admin'],
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
    await setDoc(doc(db, 'vehicles', 'veh-alice-1'), {
      ownerId: ALICE,
      make: 'Maruti',
      model: 'Swift',
      year: 2020,
      plate: 'KA01AB1234',
      type: 'car',
      isDefault: true,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'mechanics', MEG), {
      uid: MEG,
      name: 'Meg Motors',
      approved: true,
      verificationStatus: 'approved',
      specialties: ['tow'],
      vehicleTypes: ['car'],
      experienceYears: 5,
      serviceRadiusKm: 25,
      isAvailable: true,
      garageName: 'Meg',
      garageAddress: 'PRIVATE 1 Exact Rd',
      baseLat: 12.9716,
      baseLng: 77.5946,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'mechanics', UNA), {
      uid: UNA,
      name: 'Una Motors',
      approved: false,
      verificationStatus: 'pending',
      specialties: ['tow'],
      vehicleTypes: ['car'],
      experienceYears: 2,
      serviceRadiusKm: 10,
      isAvailable: true,
      garageName: 'Una',
      garageAddress: 'PRIVATE 2 Exact Rd',
      baseLat: 12.9716,
      baseLng: 77.5946,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'mechanics', OTHER), {
      uid: OTHER, name: 'Other Motors', approved: true, verificationStatus: 'approved',
      specialties: ['tow'], vehicleTypes: ['car'], experienceYears: 3, serviceRadiusKm: 25,
      isAvailable: true, garageName: 'Other', garageAddress: 'PRIVATE 3 Exact Rd',
      baseLat: 12.9716, baseLng: 77.5946, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'requests', 'req-open-1'), {
      id: 'req-open-1',
      customerId: ALICE,
      vehicleId: 'veh-alice-1',
      problemText: 'Need a tow from Outer Ring Road',
      customerLat: 12.9716,
      customerLng: 77.5946,
      status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'requests', 'req-open-1', 'offers', MEG), {
      requestId: 'req-open-1',
      customerId: ALICE,
      mechanicId: MEG,
      mechanicName: 'Meg Motors',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      status: 'pending',
      round: 0,
    });
    await setDoc(doc(db, 'notifications', ALICE, 'items', 'notif_seed'), {
      id: 'notif_seed',
      type: 'job_accepted',
      title: 'Seed notice',
      requestId: 'req-open-1',
      createdAt: Date.now(),
      read: false,
    });
    // Server-written projection (as the onMechanicWrite trigger would).
    await setDoc(doc(db, 'publicMechanics', MEG), {
      name: 'Meg Motors',
      approved: true,
      isAvailable: true,
      baseLat: 12.97,
      baseLng: 77.59,
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

describe('unauthenticated', () => {
  it('cannot read or write private data', async () => {
    const db = ctx(null).firestore();
    await assertFails(getDoc(doc(db, 'users', ALICE)));
    await assertFails(getDoc(doc(db, 'requests', 'req-open-1')));
    await assertFails(getDoc(doc(db, 'mechanics', MEG)));
  });

  it('can read the public projection (login-free directory)', async () => {
    const db = ctx(null).firestore();
    await assertSucceeds(getDoc(doc(db, 'publicMechanics', MEG)));
  });
});

describe('customer ownership + escalation', () => {
  it('alice reads her own profile, not bob’s', async () => {
    const db = ctx(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', ALICE)));
    await assertFails(getDoc(doc(db, 'users', BOB)));
  });

  it('alice cannot promote herself to admin', async () => {
    const db = ctx(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'users', ALICE), { role: 'admin' }));
  });

  it('alice can edit her display name but not her role', async () => {
    const db = ctx(ALICE).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', ALICE), { displayName: 'Alice K', updatedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(doc(db, 'users', ALICE), { displayName: 'Alice K', role: 'mechanic' }));
  });

  it('alice cannot transfer her vehicle', async () => {
    const db = ctx(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'vehicles', 'veh-alice-1'), { ownerId: BOB }));
  });

  it('bob cannot read alice’s vehicle or request', async () => {
    const db = ctx(BOB).firestore();
    await assertFails(getDoc(doc(db, 'vehicles', 'veh-alice-1')));
    await assertFails(getDoc(doc(db, 'requests', 'req-open-1')));
  });

  it('alice cannot preassign a mechanic or attach money at create', async () => {
    const db = ctx(ALICE).firestore();
    const base = {
      id: 'req-forge-1',
      customerId: ALICE,
      vehicleId: 'veh-alice-1',
      problemText: 'forged request payload',
      customerLat: 12.97,
      customerLng: 77.59,
      status: 'requested',
      offerExpiresAt: Timestamp.fromMillis(Date.now() + 120_000),
      mechanicId: MEG,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(db, 'requests', 'req-forge-1'), base));
    await assertFails(
      setDoc(doc(db, 'requests', 'req-forge-2'), { ...base, id: 'req-forge-2', mechanicId: null, amountCents: 999 }),
    );
  });

  it('requested → completed jump is denied', async () => {
    const db = ctx(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'requests', 'req-open-1'), { status: 'completed' }));
  });

  it('alice cannot touch the operational profile or private contact', async () => {
    const db = ctx(ALICE).firestore();
    await assertFails(getDoc(doc(db, 'mechanics', MEG)));
    await assertFails(getDoc(doc(db, 'mechanics', MEG, 'private', 'contact')));
  });
});

describe('mechanic approval boundary', () => {
  it('only an offered approved mechanic, the customer, or a claim-admin reads an open request', async () => {
    await assertSucceeds(getDoc(doc(ctx(MEG).firestore(), 'requests', 'req-open-1')));
    await assertFails(getDoc(doc(ctx(OTHER).firestore(), 'requests', 'req-open-1')));
    await assertSucceeds(getDoc(doc(ctx(ALICE).firestore(), 'requests', 'req-open-1')));
    await assertSucceeds(getDoc(doc(ctx(ADMIN, { admin: true }).firestore(), 'requests', 'req-open-1')));
  });

  it('does not allow a broad requested-queue query that cannot prove offer access', async () => {
    const db = ctx(MEG).firestore();
    await assertFails(getDocs(query(collection(db, 'requests'), where('status', '==', 'requested'))));
  });

  it('unapproved mechanic cannot accept the open offer', async () => {
    const db = ctx(UNA).firestore();
    await assertFails(
      updateDoc(doc(db, 'requests', 'req-open-1'), {
        status: 'accepted',
        mechanicId: UNA,
        mechanicName: 'Una Motors',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('approved mechanic cannot accept by direct write — callable-only', async () => {
    // Assignment is server-only: even an approved mechanic holding a valid,
    // in-window offer is denied a client-direct accept. The callable path
    // revalidates everything server-side (proven in dispatchTx.test.ts).
    const db = ctx(MEG).firestore();
    await assertFails(
      updateDoc(doc(db, 'requests', 'req-open-1'), {
        status: 'accepted',
        mechanicId: MEG,
        mechanicName: 'Meg Motors',
        etaMin: 15,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('mechanic cannot forge the public projection', async () => {
    const db = ctx(MEG).firestore();
    await assertFails(
      setDoc(doc(db, 'publicMechanics', MEG), { name: 'Meg Motors', approved: true, isAvailable: true }),
    );
  });

  it('mechanic cannot self-rate via the request doc', async () => {
    const db = ctx(MEG).firestore();
    await assertFails(updateDoc(doc(db, 'requests', 'req-open-1'), { rating: 5 }));
  });

  it('mechanic self-update is limited to availability + live location', async () => {
    const db = ctx(MEG).firestore();
    await assertSucceeds(updateDoc(doc(db, 'mechanics', MEG), { isAvailable: false, updatedAt: serverTimestamp() }));
    // NOTE: writing approved:true when it is already true is a no-op diff
    // (empty change set) and is correctly allowed — so test a real flip.
    await assertFails(updateDoc(doc(db, 'mechanics', MEG), { approved: false }));
    await assertFails(updateDoc(doc(db, 'mechanics', MEG), { rating: 5 }));
  });
});

describe('notification tampering', () => {
  it('owner reads and flips the read flag, but cannot forge items', async () => {
    const db = ctx(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'notifications', ALICE, 'items', 'notif_seed')));
    await assertSucceeds(updateDoc(doc(db, 'notifications', ALICE, 'items', 'notif_seed'), { read: true }));
    await assertFails(
      setDoc(doc(db, 'notifications', ALICE, 'items', 'notif_forge'), {
        id: 'notif_forge',
        type: 'job_accepted',
        title: 'Forged',
        createdAt: Date.now(),
        read: false,
      }),
    );
    await assertFails(updateDoc(doc(db, 'notifications', ALICE, 'items', 'notif_seed'), { title: 'Edited' }));
  });

  it('bob cannot read alice’s inbox', async () => {
    const db = ctx(BOB).firestore();
    await assertFails(getDoc(doc(db, 'notifications', ALICE, 'items', 'notif_seed')));
  });
});

describe('claim authority (hint is not authority)', () => {
  it('users.role=admin WITHOUT the claim grants nothing', async () => {
    const db = ctx(ADMIN).firestore();
    await assertFails(deleteDoc(doc(db, 'requests', 'req-open-1')));
    await assertFails(getDoc(doc(db, 'users', ALICE)));
  });

  it('token.admin claim grants admin paths', async () => {
    const db = ctx(ADMIN, { admin: true }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', ALICE)));
    await assertSucceeds(deleteDoc(doc(db, 'requests', 'req-open-1')));
  });
});
