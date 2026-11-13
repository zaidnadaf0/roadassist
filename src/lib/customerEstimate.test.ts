/**
 * M17/M18 unit tests — customer estimate approval/rejection.
 *
 * The regression this file exists for: the write must carry a NUMERIC
 * `estimateApprovedAt`. firestore.rules validates `estimateApprovedAt is
 * number`, and a serverTimestamp() sentinel is evaluated as a Timestamp, so the
 * original implementation was denied outright — the customer could never
 * approve an estimate. Firestore is mocked; nothing reaches a backend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    doc: null as null | Record<string, unknown>,
    patches: [] as Record<string, unknown>[],
    failCode: null as string | null,
  };
  return { state };
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
    deleteDoc: vi.fn(),
    doc: (_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` }),
    getDoc: vi.fn(async () => ({ exists: () => h.state.doc !== null, data: () => h.state.doc })),
    getDocs: vi.fn(),
    limit: (n: number) => ({ kind: 'limit', n }),
    onSnapshot: vi.fn(),
    orderBy: (...args: unknown[]) => ({ kind: 'orderBy', args }),
    query: (...args: unknown[]) => ({ kind: 'query', args }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
    setDoc: vi.fn(),
    updateDoc: vi.fn(async (_ref: unknown, patch: Record<string, unknown>) => {
      if (h.state.failCode) throw Object.assign(new Error('denied'), { code: h.state.failCode });
      h.state.patches.push(patch);
    }),
    where: (...args: unknown[]) => ({ kind: 'where', args }),
    writeBatch: vi.fn(),
  };
});

vi.mock('@/lib/firebase', () => ({
  firebaseDb: () => ({}),
  firebaseAuth: () => null,
  firebaseFunctions: () => null,
  firebaseConfigured: false,
}));

import { approveRejectEstimate } from '@/lib/customer';

const CUST = 'cust-1';

function requestDoc(over: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    customerId: CUST,
    vehicleId: 'veh-1',
    problemText: 'battery dead',
    status: 'service',
    mechanicId: 'mech-1',
    mechanicName: 'Morgan Motors',
    estimateStatus: 'pending',
    estimatedAmountCents: 49_900,
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

describe('approveRejectEstimate (ownership + decision states)', () => {
  it('reports a missing request as not_found', async () => {
    expect(await approveRejectEstimate('req-1', CUST, 'approve')).toBe('not_found');
    expect(h.state.patches).toHaveLength(0);
  });

  it('refuses a customer who does not own the request', async () => {
    h.state.doc = requestDoc({ customerId: 'another-customer' });
    expect(await approveRejectEstimate('req-1', CUST, 'approve')).toBe('not_assigned');
    expect(h.state.patches).toHaveLength(0);
  });

  it('refuses on a completed or cancelled job', async () => {
    h.state.doc = requestDoc({ status: 'completed' });
    expect(await approveRejectEstimate('req-1', CUST, 'approve')).toBe('invalid_state');
    h.state.doc = requestDoc({ status: 'cancelled' });
    expect(await approveRejectEstimate('req-1', CUST, 'reject')).toBe('invalid_state');
    expect(h.state.patches).toHaveLength(0);
  });

  it('refuses to re-decide an estimate that is already approved or rejected', async () => {
    h.state.doc = requestDoc({ estimateStatus: 'approved' });
    expect(await approveRejectEstimate('req-1', CUST, 'reject')).toBe('invalid_state');
    h.state.doc = requestDoc({ estimateStatus: 'rejected' });
    expect(await approveRejectEstimate('req-1', CUST, 'approve')).toBe('invalid_state');
    expect(h.state.patches).toHaveLength(0);
  });

  it('approves with a NUMERIC estimateApprovedAt (the rules-validated type)', async () => {
    h.state.doc = requestDoc();
    const before = Date.now();
    expect(await approveRejectEstimate('req-1', CUST, 'approve')).toBe('approved');
    const patch = h.state.patches[0];
    expect(patch.estimateStatus).toBe('approved');
    expect(typeof patch.estimateApprovedAt).toBe('number');
    expect(patch.estimateApprovedAt as number).toBeGreaterThanOrEqual(before);
    expect(patch.estimateApprovedAt as number).toBeLessThanOrEqual(Date.now());
    expect(patch.updatedAt).toEqual({ __serverTimestamp: true });
    // The decision must not touch the mechanic's money or the request identity.
    for (const forbidden of ['estimatedAmountCents', 'amountCents', 'mechanicId', 'status', 'paymentStatus']) {
      expect(patch).not.toHaveProperty(forbidden);
    }
  });

  it('rejects with the same shape and never approves', async () => {
    h.state.doc = requestDoc();
    expect(await approveRejectEstimate('req-1', CUST, 'reject')).toBe('rejected');
    expect(h.state.patches[0]).toMatchObject({ estimateStatus: 'rejected' });
    expect(typeof h.state.patches[0].estimateApprovedAt).toBe('number');
  });

  it('maps a rules denial to forbidden, never to an approved estimate', async () => {
    h.state.doc = requestDoc();
    h.state.failCode = 'permission-denied';
    expect(await approveRejectEstimate('req-1', CUST, 'approve')).toBe('forbidden');
    expect(h.state.patches).toHaveLength(0);
  });
});
