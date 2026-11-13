/**
 * M17/M18 unit tests — estimate submission, offline payment recording and the
 * completion approval gate.
 *
 * These are the write paths that protect money, so the point is not only the
 * happy result code but the exact patch that would be committed: field names,
 * payment state, timestamp TYPE (a serverTimestamp() sentinel is rejected by
 * firestore.rules, which demands `is number`) and what is deliberately NOT
 * written. Firestore is mocked; nothing here reaches a backend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    /** Committed document snapshot: null means "does not exist". */
    doc: null as null | Record<string, unknown>,
    patches: [] as Record<string, unknown>[],
    failCode: null as string | null,
  };
  const tx = {
    get: async () => ({ exists: () => state.doc !== null, data: () => state.doc }),
    update: (_ref: unknown, patch: Record<string, unknown>) => {
      state.patches.push(patch);
    },
  };
  return { state, tx };
});

vi.mock('firebase/firestore', () => {
  class Timestamp {
    constructor(public milliseconds: number) {}
    toMillis() {
      return this.milliseconds;
    }
    static fromMillis(ms: number) {
      return new Timestamp(ms);
    }
  }
  return {
    Timestamp,
    collection: (...args: unknown[]) => ({ kind: 'collection', args }),
    collectionGroup: (...args: unknown[]) => ({ kind: 'collectionGroup', args }),
    doc: (_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` }),
    getDoc: vi.fn(async () => ({ exists: () => h.state.doc !== null, data: () => h.state.doc })),
    updateDoc: vi.fn(async (_ref: unknown, patch: Record<string, unknown>) => {
      h.state.patches.push(patch);
    }),
    limit: (n: number) => ({ kind: 'limit', n }),
    onSnapshot: vi.fn(),
    orderBy: (...args: unknown[]) => ({ kind: 'orderBy', args }),
    query: (...args: unknown[]) => ({ kind: 'query', args }),
    runTransaction: async (_db: unknown, fn: (t: unknown) => unknown) => {
      if (h.state.failCode) throw Object.assign(new Error('denied'), { code: h.state.failCode });
      return fn(h.tx);
    },
    serverTimestamp: () => ({ __serverTimestamp: true }),
    setDoc: vi.fn(),
    writeBatch: vi.fn(),
    where: (...args: unknown[]) => ({ kind: 'where', args }),
  };
});

// Never touch a real backend from unit tests (vitest loads .env.local).
vi.mock('@/lib/firebase', () => ({
  firebaseDb: () => ({}),
  firebaseAuth: () => null,
  firebaseFunctions: () => null,
  firebaseConfigured: false,
}));

import { advanceJob, recordPayment, submitEstimate } from '@/lib/mechanic';

const MECH = 'mech-1';
const CUST = 'cust-1';

function requestDoc(over: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    customerId: CUST,
    vehicleId: 'veh-1',
    problemText: 'battery dead',
    status: 'service',
    mechanicId: MECH,
    mechanicName: 'Morgan Motors',
    customerLat: 12.97,
    customerLng: 77.59,
    ...over,
  };
}

beforeEach(() => {
  h.state.doc = null;
  h.state.patches = [];
  h.state.failCode = null;
});

describe('submitEstimate (assigned mechanic only)', () => {
  it('rejects a mechanic who is not assigned to the request', async () => {
    h.state.doc = requestDoc({ mechanicId: 'someone-else' });
    expect(await submitEstimate('req-1', MECH, 'diagnosis', '499', '45')).toBe('not_assigned');
    expect(h.state.patches).toHaveLength(0);
  });

  it('reports a missing request as not assigned and writes nothing', async () => {
    h.state.doc = null;
    expect(await submitEstimate('req-1', MECH, 'diagnosis', '499', '45')).toBe('not_assigned');
    expect(h.state.patches).toHaveLength(0);
  });

  it('refuses to write on a completed or cancelled job', async () => {
    h.state.doc = requestDoc({ status: 'completed' });
    expect(await submitEstimate('req-1', MECH, 'd', '499', '45')).toBe('invalid_state');
    h.state.doc = requestDoc({ status: 'cancelled' });
    expect(await submitEstimate('req-1', MECH, 'd', '499', '45')).toBe('invalid_state');
    expect(h.state.patches).toHaveLength(0);
  });

  it('refuses to modify an already-approved estimate (customer owns the decision)', async () => {
    h.state.doc = requestDoc({ estimateStatus: 'approved' });
    expect(await submitEstimate('req-1', MECH, 'd', '999', '60')).toBe('invalid_state');
    expect(h.state.patches).toHaveLength(0);
  });

  it('writes the stored `estimated*` field names with money in integer cents', async () => {
    h.state.doc = requestDoc();
    expect(await submitEstimate('req-1', MECH, '  Alternator not charging  ', '499.5', '45')).toBe('submitted');
    expect(h.state.patches).toHaveLength(1);
    expect(h.state.patches[0]).toEqual({
      updatedAt: { __serverTimestamp: true },
      estimatedAmountCents: 49_950,
      estimatedDurationMin: 45,
      estimateDiagnosis: 'Alternator not charging',
      estimateStatus: 'pending',
    });
  });

  it('keeps a pending estimate pending on revision', async () => {
    h.state.doc = requestDoc({ estimateStatus: 'pending' });
    expect(await submitEstimate('req-1', MECH, 'revised', '550', '50')).toBe('submitted');
    expect(h.state.patches[0]).not.toHaveProperty('estimateStatus');
    expect(h.state.patches[0].estimatedAmountCents).toBe(55_000);
  });

  it('returns a rejected estimate to pending so the customer can decide again', async () => {
    h.state.doc = requestDoc({ estimateStatus: 'rejected' });
    expect(await submitEstimate('req-1', MECH, 'revised', '550', '50')).toBe('submitted');
    expect(h.state.patches[0].estimateStatus).toBe('pending');
  });

  it('omits optional fields entirely instead of writing ₹0 for "not given"', async () => {
    h.state.doc = requestDoc();
    expect(await submitEstimate('req-1', MECH, null, '', '')).toBe('submitted');
    const patch = h.state.patches[0];
    expect(patch).not.toHaveProperty('estimatedAmountCents');
    expect(patch).not.toHaveProperty('estimatedDurationMin');
    expect(patch).not.toHaveProperty('estimateDiagnosis');
    expect(patch.estimateStatus).toBe('pending');
  });

  it('rejects out-of-bounds input without writing (validated before the patch)', async () => {
    h.state.doc = requestDoc();
    expect(await submitEstimate('req-1', MECH, 'd', '10000.01', '45')).toBe('error');
    expect(await submitEstimate('req-1', MECH, 'd', '-5', '45')).toBe('error');
    expect(await submitEstimate('req-1', MECH, 'd', '499', '1441')).toBe('error');
    expect(h.state.patches).toHaveLength(0);
  });

  it('maps a rules denial to forbidden, never to success', async () => {
    h.state.doc = requestDoc();
    h.state.failCode = 'permission-denied';
    expect(await submitEstimate('req-1', MECH, 'd', '499', '45')).toBe('forbidden');
    expect(h.state.patches).toHaveLength(0);
  });
});

describe('recordPayment (recorded, never independently verified)', () => {
  it('authorizes on the AUTHENTICATED uid, not on a caller-supplied customer id', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 49_900 });
    // Echoing the document's own customerId must not satisfy ownership.
    expect(await recordPayment('req-1', 'stranger', 'cash', '499')).toBe('not_assigned');
    expect(h.state.patches).toHaveLength(0);
  });

  it('refuses to record a payment for a job that is not completed', async () => {
    h.state.doc = requestDoc({ status: 'service' });
    expect(await recordPayment('req-1', CUST, 'cash', '499')).toBe('invalid_state');
    expect(h.state.patches).toHaveLength(0);
  });

  it('records method, paid state, numeric paidAt and the acting uid', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 49_900 });
    const before = Date.now();
    expect(await recordPayment('req-1', CUST, 'upi', '499')).toBe('recorded');
    const patch = h.state.patches[0];
    expect(patch).toMatchObject({ paymentMethod: 'upi', paymentStatus: 'paid', paidBy: CUST });
    // firestore.rules requires `paidAt is number` — a Timestamp sentinel is denied.
    expect(typeof patch.paidAt).toBe('number');
    expect(patch.paidAt as number).toBeGreaterThanOrEqual(before);
    expect(patch.paidAt as number).toBeLessThanOrEqual(Date.now());
  });

  it('lets the assigned mechanic record the payment as well', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 25_050 });
    expect(await recordPayment('req-1', MECH, 'cash', '250.5')).toBe('recorded');
    expect(h.state.patches[0]).toMatchObject({ paymentMethod: 'cash', paidBy: MECH });
    // Payment recording must never rewrite the billed amount.
    expect(h.state.patches[0]).not.toHaveProperty('amountCents');
  });

  it('refuses an amount that contradicts the billed amount instead of dropping it', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 49_900 });
    expect(await recordPayment('req-1', CUST, 'cash', '300')).toBe('amount_mismatch');
    expect(h.state.patches).toHaveLength(0);
  });

  it('accepts any amount when the job carries no billed amount', async () => {
    h.state.doc = requestDoc({ status: 'completed' });
    expect(await recordPayment('req-1', CUST, 'cash', '250.5')).toBe('recorded');
    expect(h.state.patches).toHaveLength(1);
  });

  it('never writes a "verified" flag — only the recorded state exists', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 49_900 });
    await recordPayment('req-1', CUST, 'cash', '499');
    const patch = h.state.patches[0];
    expect(patch).not.toHaveProperty('verified');
    expect(patch).not.toHaveProperty('verifiedAt');
    expect(patch).not.toHaveProperty('paymentVerified');
  });

  it('rejects an unsupported method or amount without writing', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 49_900 });
    expect(await recordPayment('req-1', CUST, 'card', '499')).toBe('error');
    expect(await recordPayment('req-1', CUST, 'cash', '10000.01')).toBe('error');
    expect(await recordPayment('req-1', CUST, 'cash', '')).toBe('error');
    expect(h.state.patches).toHaveLength(0);
  });

  it('maps a rules denial to forbidden', async () => {
    h.state.doc = requestDoc({ status: 'completed', amountCents: 49_900 });
    h.state.failCode = 'permission-denied';
    expect(await recordPayment('req-1', CUST, 'cash', '499')).toBe('forbidden');
    expect(h.state.patches).toHaveLength(0);
  });
});

describe('advanceJob completion gate (client half of the rules invariant)', () => {
  it('refuses completion while the estimate is not approved', async () => {
    h.state.doc = requestDoc({ status: 'service', estimateStatus: 'pending' });
    expect(await advanceJob('req-1', 'completed', { amountCents: 49_900 })).toBe('estimate_required');
    expect(h.state.patches).toHaveLength(0);

    h.state.doc = requestDoc({ status: 'service' });
    expect(await advanceJob('req-1', 'completed', { amountCents: 49_900 })).toBe('estimate_required');
    expect(h.state.patches).toHaveLength(0);

    h.state.doc = requestDoc({ status: 'service', estimateStatus: 'rejected' });
    expect(await advanceJob('req-1', 'completed', { amountCents: 49_900 })).toBe('estimate_required');
    expect(h.state.patches).toHaveLength(0);
  });

  it('completes an approved job, clearing the live pin and rounding billing', async () => {
    h.state.doc = requestDoc({ status: 'service', estimateStatus: 'approved', mechanicLat: 12.9, mechanicLng: 77.5 });
    expect(await advanceJob('req-1', 'completed', { amountCents: 49_900.6, durationMin: 35.4 })).toBe('advanced');
    expect(h.state.patches[0]).toMatchObject({
      status: 'completed',
      mechanicLat: null,
      mechanicLng: null,
      amountCents: 49_901,
      durationMin: 35,
    });
  });

  it('rejects a skipped lifecycle step and terminal re-entry', async () => {
    h.state.doc = requestDoc({ status: 'accepted', estimateStatus: 'approved' });
    expect(await advanceJob('req-1', 'completed', {})).toBe('invalid_transition');
    h.state.doc = requestDoc({ status: 'completed', estimateStatus: 'approved' });
    expect(await advanceJob('req-1', 'completed', {})).toBe('terminal');
    expect(h.state.patches).toHaveLength(0);
  });

  it('allows the intermediate steps without an estimate', async () => {
    h.state.doc = requestDoc({ status: 'accepted' });
    expect(await advanceJob('req-1', 'on-the-way')).toBe('advanced');
    expect(h.state.patches[0]).toMatchObject({ status: 'on-the-way' });
  });
});
