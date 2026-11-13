/**
 * M17/M18 EMULATOR security suite — repair estimates, customer approval,
 * completion gating and offline payment recording, exercised against the REAL
 * firestore.rules on the local emulator.
 *
 * What this file pins (the trust boundary, not the UI):
 *   1. Only the ASSIGNED mechanic may write estimate fields.
 *   2. A mechanic can never self-approve an estimate.
 *   3. Estimate fields are frozen once the customer approves, and once the job
 *      leaves the live lifecycle.
 *   4. Only the request-owning customer may approve/reject, only while an
 *      estimate is pending, and only the two decision fields.
 *   5. Completion REQUIRES a customer-approved estimate (rules-level, so a
 *      direct SDK write cannot bill an unapproved repair).
 *   6. Payments may only be recorded by the customer or assigned mechanic, only
 *      on a completed job, only as 'paid' with a numeric paidAt — and never
 *      bundled with any other field.
 *
 * Run ONLY under the Firestore emulator:
 *   npm run test:emulator:rules
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'roadassist-testimates';
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let testEnv: RulesTestEnvironment;

const MECH = 'est-mech';
const OTHER_MECH = 'est-mech-other';
const CUST = 'est-cust';
const OTHER_CUST = 'est-cust-other';

function customerDb(uid = CUST) {
  return testEnv.authenticatedContext(uid, { role: 'customer' }).firestore();
}
function mechanicDb(uid = MECH) {
  return testEnv.authenticatedContext(uid, { role: 'mechanic' }).firestore();
}

/** Seeds a request through the admin path — clients cannot create these states. */
async function seedRequest(id: string, extra: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'requests', id), {
      id,
      customerId: CUST,
      vehicleId: 'est-veh-1',
      problemText: 'estimate suite request',
      problemCategory: 'battery',
      customerLat: 12.9716,
      customerLng: 77.5946,
      status: 'service',
      mechanicId: MECH,
      mechanicName: 'Est Mechanic',
      offerExpiresAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...extra,
    });
  });
}

async function readRequest(id: string) {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), 'requests', id))).data();
  });
  return data;
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
  // Roles resolve through users/{uid}.role, so every actor needs a profile.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      [MECH, 'mechanic'],
      [OTHER_MECH, 'mechanic'],
      [CUST, 'customer'],
      [OTHER_CUST, 'customer'],
    ] as const) {
      await setDoc(doc(db, 'users', uid), {
        uid, role, email: `${uid}@test.local`, displayName: uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    for (const uid of [MECH, OTHER_MECH]) {
      await setDoc(doc(db, 'mechanics', uid), {
        uid, name: uid, approved: true, verificationStatus: 'approved',
        specialties: ['battery'], isAvailable: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, 'vehicles', 'est-veh-1'), {
      ownerId: CUST, make: 'Honda', model: 'Activa', year: 2021,
      plate: 'KA01EST0001', type: 'bike', isDefault: true, createdAt: serverTimestamp(),
    });
  });
}, 60_000);

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('estimate submission — assigned mechanic only', () => {
  it('lets the assigned mechanic submit a pending estimate', async () => {
    await seedRequest('est-open');
    const db = mechanicDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'est-open'), {
        estimatedAmountCents: 49_900,
        estimatedDurationMin: 45,
        estimateDiagnosis: 'Battery dead, alternator not charging',
        estimateStatus: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
    const after = await readRequest('est-open');
    expect(after?.estimateStatus).toBe('pending');
    expect(after?.estimatedAmountCents).toBe(49_900);
    expect(after?.estimateDiagnosis).toBe('Battery dead, alternator not charging');
  });

  it('denies an unassigned mechanic (mechanicId is the authority)', async () => {
    await seedRequest('est-unassigned', { mechanicId: OTHER_MECH });
    const db = mechanicDb(MECH);
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-unassigned'), {
        estimatedAmountCents: 1_000,
        estimateStatus: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-unassigned'))?.estimateStatus).toBeUndefined();
  });

  it('denies a customer writing estimate fields', async () => {
    await seedRequest('est-cust-write');
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-cust-write'), {
        estimatedAmountCents: 1_000,
        estimateStatus: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies a mechanic self-approving the estimate', async () => {
    await seedRequest('est-self-approve', { estimateStatus: 'pending', estimatedAmountCents: 4_000 });
    const db = mechanicDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-self-approve'), {
        estimateStatus: 'approved',
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-self-approve'))?.estimateStatus).toBe('pending');
  });

  it('denies smuggling another field into an estimate write', async () => {
    await seedRequest('est-smuggle');
    const db = mechanicDb();
    // amountCents/payment fields/rating are outside the estimate allowlist.
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-smuggle'), {
        estimatedAmountCents: 5_000,
        estimateStatus: 'pending',
        amountCents: 5_000,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-smuggle'), {
        estimatedAmountCents: 5_000,
        estimateStatus: 'pending',
        paymentStatus: 'paid',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('enforces the value bounds the client mirrors (₹10,000 / 1440 min / 2000 chars)', async () => {
    await seedRequest('est-bounds');
    const db = mechanicDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-bounds'), {
        estimatedAmountCents: 1_000_001, estimateStatus: 'pending', updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-bounds'), {
        estimatedDurationMin: 1_441, estimateStatus: 'pending', updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-bounds'), {
        estimateDiagnosis: 'x'.repeat(2_001), estimateStatus: 'pending', updatedAt: serverTimestamp(),
      }),
    );
    // The exact bounds are allowed.
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'est-bounds'), {
        estimatedAmountCents: 1_000_000,
        estimatedDurationMin: 1_440,
        estimateStatus: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('lets a REJECTED estimate be revised back to pending', async () => {
    await seedRequest('est-revise', { estimateStatus: 'rejected', estimatedAmountCents: 9_000 });
    const db = mechanicDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'est-revise'), {
        estimatedAmountCents: 7_500,
        estimateDiagnosis: 'Revised: starter motor',
        estimateStatus: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-revise'))?.estimateStatus).toBe('pending');
  });

  it('freezes estimate fields once the customer has approved', async () => {
    await seedRequest('est-locked', {
      estimateStatus: 'approved', estimatedAmountCents: 9_000, estimateApprovedAt: Date.now(),
    });
    const db = mechanicDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-locked'), {
        estimatedAmountCents: 90_000, updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-locked'), {
        estimateStatus: 'pending', updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-locked'))?.estimatedAmountCents).toBe(9_000);
  });

  it('freezes estimate fields once the job is completed or cancelled', async () => {
    await seedRequest('est-done', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    await seedRequest('est-cancelled', { status: 'cancelled' });
    const db = mechanicDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-done'), {
        estimatedAmountCents: 1_000, updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-cancelled'), {
        estimatedAmountCents: 1_000, estimateStatus: 'pending', updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('customer approval — owner only, pending only, two fields only', () => {
  it('lets the owning customer approve a pending estimate with a numeric timestamp', async () => {
    await seedRequest('est-approve', { estimateStatus: 'pending', estimatedAmountCents: 49_900 });
    const db = customerDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'est-approve'), {
        estimateStatus: 'approved',
        estimateApprovedAt: Date.now(),
        updatedAt: serverTimestamp(),
      }),
    );
    const after = await readRequest('est-approve');
    expect(after?.estimateStatus).toBe('approved');
    expect(typeof after?.estimateApprovedAt).toBe('number');
  });

  it('lets the owning customer reject a pending estimate', async () => {
    await seedRequest('est-reject', { estimateStatus: 'pending' });
    const db = customerDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'est-reject'), {
        estimateStatus: 'rejected',
        estimateApprovedAt: Date.now(),
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-reject'))?.estimateStatus).toBe('rejected');
  });

  it('denies a different customer approving the same request', async () => {
    await seedRequest('est-not-mine', { estimateStatus: 'pending' });
    const db = customerDb(OTHER_CUST);
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-not-mine'), {
        estimateStatus: 'approved', estimateApprovedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-not-mine'))?.estimateStatus).toBe('pending');
  });

  it('denies approval when no estimate is pending', async () => {
    await seedRequest('est-no-estimate');
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-no-estimate'), {
        estimateStatus: 'approved', estimateApprovedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies the decision VERB as a stored state (only approved/rejected exist)', async () => {
    await seedRequest('est-verb', { estimateStatus: 'pending' });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-verb'), {
        estimateStatus: 'approve', estimateApprovedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-verb'), {
        estimateStatus: 'reject', estimateApprovedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies a timestamp sentinel where the rule demands a number', async () => {
    await seedRequest('est-sentinel', { estimateStatus: 'pending' });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-sentinel'), {
        estimateStatus: 'approved',
        estimateApprovedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies the customer rewriting the estimate amount while deciding', async () => {
    await seedRequest('est-cust-amount', { estimateStatus: 'pending', estimatedAmountCents: 49_900 });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-cust-amount'), {
        estimateStatus: 'approved',
        estimateApprovedAt: Date.now(),
        estimatedAmountCents: 1_000,
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('est-cust-amount'))?.estimatedAmountCents).toBe(49_900);
  });

  it('denies re-deciding an estimate that is already approved or rejected', async () => {
    await seedRequest('est-decided', { estimateStatus: 'approved', estimateApprovedAt: Date.now() });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-decided'), {
        estimateStatus: 'rejected', estimateApprovedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies approving after the job is completed', async () => {
    await seedRequest('est-after-done', {
      status: 'completed', estimateStatus: 'pending', amountCents: 49_900,
    });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-after-done'), {
        estimateStatus: 'approved', estimateApprovedAt: Date.now(), updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('completion requires an approved estimate (rules-level, not just UI)', () => {
  for (const [label, estimateStatus] of [
    ['no estimate', undefined],
    ['pending', 'pending'],
    ['rejected', 'rejected'],
  ] as const) {
    it(`denies completion with ${label}`, async () => {
      await seedRequest('est-gate', estimateStatus ? { estimateStatus } : {});
      const db = mechanicDb();
      await assertFails(
        updateDoc(doc(db, 'requests', 'est-gate'), {
          status: 'completed',
          mechanicLat: null,
          mechanicLng: null,
          amountCents: 49_900,
          updatedAt: serverTimestamp(),
        }),
      );
      expect((await readRequest('est-gate'))?.status).toBe('service');
      expect((await readRequest('est-gate'))?.amountCents).toBeUndefined();
    });
  }

  it('allows completion with billing once the estimate is approved', async () => {
    await seedRequest('est-gate-ok', { estimateStatus: 'approved', estimatedAmountCents: 49_900 });
    const db = mechanicDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'est-gate-ok'), {
        status: 'completed',
        mechanicLat: null,
        mechanicLng: null,
        amountCents: 49_900,
        durationMin: 35,
        updatedAt: serverTimestamp(),
      }),
    );
    const after = await readRequest('est-gate-ok');
    expect(after?.status).toBe('completed');
    expect(after?.amountCents).toBe(49_900);
  });

  it('still denies billing before completion', async () => {
    await seedRequest('est-bill-early', { estimateStatus: 'approved' });
    const db = mechanicDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'est-bill-early'), {
        amountCents: 49_900, updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('offline payment recording — authorized actors, completed jobs only', () => {
  it('lets the owning customer record cash payment on a completed job', async () => {
    await seedRequest('pay-ok', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    const db = customerDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'pay-ok'), {
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        paidAt: Date.now(),
        paidBy: CUST,
        updatedAt: serverTimestamp(),
      }),
    );
    const after = await readRequest('pay-ok');
    expect(after?.paymentMethod).toBe('cash');
    expect(after?.paymentStatus).toBe('paid');
    expect(typeof after?.paidAt).toBe('number');
    expect(after?.paidBy).toBe(CUST);
  });

  it('lets the assigned mechanic record a UPI payment', async () => {
    await seedRequest('pay-mech', { status: 'completed', estimateStatus: 'approved', amountCents: 25_000 });
    const db = mechanicDb();
    await assertSucceeds(
      updateDoc(doc(db, 'requests', 'pay-mech'), {
        paymentMethod: 'upi',
        paymentStatus: 'paid',
        paidAt: Date.now(),
        paidBy: MECH,
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('pay-mech'))?.paymentMethod).toBe('upi');
  });

  it('denies an unrelated customer or mechanic recording the payment', async () => {
    await seedRequest('pay-stranger', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    await assertFails(
      updateDoc(doc(customerDb(OTHER_CUST), 'requests', 'pay-stranger'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: Date.now(), paidBy: OTHER_CUST,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(mechanicDb(OTHER_MECH), 'requests', 'pay-stranger'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: Date.now(), paidBy: OTHER_MECH,
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('pay-stranger'))?.paymentStatus).toBeUndefined();
  });

  it('denies recording a payment before the job is completed', async () => {
    await seedRequest('pay-live', { estimateStatus: 'approved' });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-live'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: Date.now(), paidBy: CUST,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies a "pending" payment state — recording is one-way', async () => {
    await seedRequest('pay-pending', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-pending'), {
        paymentMethod: 'cash', paymentStatus: 'pending', paidAt: Date.now(), paidBy: CUST,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies an unsupported method and a sentinel paidAt', async () => {
    await seedRequest('pay-bad', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-bad'), {
        paymentMethod: 'card', paymentStatus: 'paid', paidAt: Date.now(), paidBy: CUST,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-bad'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: serverTimestamp(), paidBy: CUST,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies bundling any other field into the payment write', async () => {
    await seedRequest('pay-smuggle', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    const db = customerDb();
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-smuggle'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: Date.now(), paidBy: CUST,
        amountCents: 1_000,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-smuggle'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: Date.now(), paidBy: CUST,
        rating: 5,
        updatedAt: serverTimestamp(),
      }),
    );
    expect((await readRequest('pay-smuggle'))?.amountCents).toBe(49_900);
  });

  it('denies an unauthenticated caller outright', async () => {
    await seedRequest('pay-anon', { status: 'completed', estimateStatus: 'approved', amountCents: 49_900 });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      updateDoc(doc(db, 'requests', 'pay-anon'), {
        paymentMethod: 'cash', paymentStatus: 'paid', paidAt: Date.now(), paidBy: 'nobody',
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
