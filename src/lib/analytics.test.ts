import { describe, expect, it } from 'vitest';
import {
  demand,
  earnings,
  earningsByDay,
  estimatePaymentSummary,
  inWindow,
  mechanicPerf,
  normalizeRequests,
  offerStats,
  statusCounts,
  toCsv,
  toMs,
  utcDay,
  windowStartDaysAgo,
  type OfferRow,
  type RequestRow,
} from '@/lib/analytics';

function row(over: Partial<RequestRow> & { id: string; status: string }): RequestRow {
  return {
    problemCategory: 'tow',
    createdAtMs: Date.UTC(2026, 9, 10, 12),
    amountCents: null,
    durationMin: null,
    mechanicId: null,
    ...over,
  };
}

describe('utcDay / toMs / windows (UTC, no local mixing)', () => {
  it('buckets by UTC day', () => {
    expect(utcDay(Date.UTC(2026, 9, 10, 23, 59))).toBe('2026-10-10');
    expect(utcDay(Date.UTC(2026, 9, 11, 0, 0))).toBe('2026-10-11');
  });

  it('toMs never invents a time', () => {
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs(Number.NaN)).toBeNull();
    expect(toMs(123)).toBe(123);
    expect(toMs({ toMillis: () => 456 })).toBe(456);
    expect(toMs({} as { toMillis?: () => number })).toBeNull();
  });

  it('window boundaries are UTC-midnight aligned', () => {
    const now = Date.UTC(2026, 9, 15, 18, 30);
    const start = windowStartDaysAgo(7, now);
    expect(start).toBe(Date.UTC(2026, 9, 9, 0, 0, 0, 0));
    expect(windowStartDaysAgo(null, now)).toBeNull();
    expect(inWindow(Date.UTC(2026, 9, 9, 0, 0), { fromMs: start, toMs: null, label: 'w' })).toBe(true);
    expect(inWindow(Date.UTC(2026, 9, 8, 23, 59), { fromMs: start, toMs: null, label: 'w' })).toBe(false);
    expect(inWindow(null, { fromMs: start, toMs: null, label: 'w' })).toBe(false);
  });
});

describe('normalizeRequests (drops counted, never silent)', () => {
  it('excludes status-less rows and counts them', () => {
    const { rows, excluded } = normalizeRequests([
      { id: 'a', status: 'completed' },
      { id: 'b' },
      { id: 'c', status: '' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a']);
    expect(excluded).toBe(2);
  });
});

describe('statusCounts (zero vs N/A)', () => {
  it('returns nulls on empty input, measured zeroes otherwise', () => {
    const empty = statusCounts([]);
    expect(empty).toEqual({ total: 0, byStatus: {}, completionRate: null, cancellationRate: null });
    const some = statusCounts([row({ id: 'a', status: 'requested' }), row({ id: 'b', status: 'requested' })]);
    expect(some.total).toBe(2);
    expect(some.completionRate).toBe(0); // measured zero: denominator exists
    expect(some.cancellationRate).toBe(0);
  });
});

describe('earnings (amounts only where recorded)', () => {
  it('returns nulls when no completed job carries an amount', () => {
    const e = earnings([row({ id: 'a', status: 'completed' }), row({ id: 'b', status: 'requested' })]);
    expect(e.totalCents).toBeNull();
    expect(e.avgCents).toBeNull();
    expect(e.completedJobs).toBe(1);
    expect(e.completedWithAmount).toBe(0);
  });

  it('sums and averages amount-carrying completions', () => {
    const e = earnings([
      row({ id: 'a', status: 'completed', amountCents: 49900, problemCategory: 'tow' }),
      row({ id: 'b', status: 'completed', amountCents: 59900, problemCategory: 'battery' }),
      row({ id: 'c', status: 'completed' }),
    ]);
    expect(e.totalCents).toBe(109800);
    expect(e.avgCents).toBe(54900);
    expect(e.byCategory).toEqual({ tow: 49900, battery: 59900 });
  });

  it('groups daily totals skipping amount-less and dateless rows', () => {
    const byDay = earningsByDay([
      row({ id: 'a', status: 'completed', amountCents: 10000, createdAtMs: Date.UTC(2026, 9, 10, 5) }),
      row({ id: 'b', status: 'completed', amountCents: 20000, createdAtMs: Date.UTC(2026, 9, 10, 20) }),
      row({ id: 'c', status: 'completed', createdAtMs: Date.UTC(2026, 9, 10, 21) }),
      row({ id: 'd', status: 'completed', amountCents: 30000, createdAtMs: null }),
    ]);
    expect(byDay).toEqual({ '2026-10-10': { totalCents: 30000, jobs: 2 } });
  });
});

describe('demand slices', () => {
  it('buckets category/day/hour and completed-vs-cancelled', () => {
    const d = demand([
      row({ id: 'a', status: 'completed', problemCategory: 'tow', createdAtMs: Date.UTC(2026, 9, 10, 8, 15) }),
      row({ id: 'b', status: 'cancelled', problemCategory: 'tow', createdAtMs: Date.UTC(2026, 9, 10, 8, 45) }),
      row({ id: 'c', status: 'requested', createdAtMs: null, problemCategory: undefined }),
    ]);
    expect(d.byCategory).toEqual({ tow: 2, other: 1 });
    expect(d.byDay).toEqual({ '2026-10-10': 2 });
    expect(d.byHourUtc).toEqual({ '08': 2 });
    expect(d.completedVsCancelledByCategory).toEqual({ tow: { completed: 1, cancelled: 1 } });
  });
});

describe('offerStats (terminal-denominator honesty)', () => {
  const o = (status: OfferRow['status'], round = 0): OfferRow => ({ requestId: 'r', mechanicId: 'm', status, round });

  it('nulls on empty input', () => {
    expect(offerStats([])).toMatchObject({ total: 0, acceptRate: null, avgRound: null, rematchShare: null });
  });

  it('rates over terminal offers only', () => {
    const s = offerStats([o('accepted'), o('declined'), o('expired'), o('pending', 1), o('superseded', 1)]);
    expect(s.total).toBe(5);
    expect(s.acceptRate).toBeCloseTo(1 / 3);
    expect(s.rematchShare).toBeCloseTo(2 / 5);
    expect(s.avgRound).toBeCloseTo(0.4);
  });
});

describe('mechanicPerf (own data only by construction)', () => {
  it('nulls rates without denominators', () => {
    const p = mechanicPerf([], []);
    expect(p).toMatchObject({ completed: 0, active: 0, acceptanceRate: null, completionRate: null, totalCents: null, avgCents: null });
  });

  it('computes acceptance/completion/earnings/category', () => {
    const p = mechanicPerf(
      [
        row({ id: 'a', status: 'completed', amountCents: 50000, problemCategory: 'tow' }),
        row({ id: 'b', status: 'accepted', problemCategory: 'tow' }),
      ],
      [
        { requestId: 'a', mechanicId: 'm', status: 'accepted', round: 0 },
        { requestId: 'b', mechanicId: 'm', status: 'accepted', round: 0 },
        { requestId: 'c', mechanicId: 'm', status: 'declined', round: 0 },
      ],
    );
    expect(p.acceptanceRate).toBeCloseTo(2 / 3);
    expect(p.completionRate).toBeCloseTo(1 / 2);
    expect(p.totalCents).toBe(50000);
    expect(p.byCategory).toEqual({ tow: 1 });
  });
});

describe('toCsv (escaping)', () => {
  it('quotes commas, quotes, and newlines', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'q"q'], ['plain', null], ['line\nbreak', 5]]);
    expect(csv).toBe('a,b\n"x,y","q""q"\nplain,\n"line\nbreak",5');
  });
});

describe('toCsv (spreadsheet formula injection guard)', () => {
  it('prefixes dangerous leading characters with an apostrophe', () => {
    const csv = toCsv(['a', 'b'], [['=cmd()', '+1'], ['-2+3', '@SUM(A1)'], ['\tTAB', 'safe']]);
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'\tTAB");
    expect(csv).toContain('safe');
  });

  it('leaves plain values and numbers untouched', () => {
    const csv = toCsv(['a'], [['plain text'], [42], [null]]);
    expect(csv).toBe('a\nplain text\n42\n');
  });
});

describe('estimatePaymentSummary (recorded, never "verified")', () => {
  it('measures nothing on empty input — null totals, not zero rupees', () => {
    expect(estimatePaymentSummary([])).toEqual({
      totalEstimates: 0,
      estimatesByStatus: { pending: 0, approved: 0, rejected: 0 },
      totalEstimatedAmountCents: null,
      estimatesWithAmount: 0,
      totalApprovedEstimateAmountCents: null,
      approvedEstimatesWithAmount: 0,
      cashPayments: 0,
      upiPayments: 0,
      pendingPayments: 0,
      paidPayments: 0,
    });
  });

  it('counts estimates by status and sums only priced ones', () => {
    const s = estimatePaymentSummary([
      row({ id: 'a', status: 'service', estimateStatus: 'pending', estimatedAmountCents: 49_900 }),
      row({ id: 'b', status: 'completed', estimateStatus: 'approved', estimatedAmountCents: 61_000 }),
      row({ id: 'c', status: 'completed', estimateStatus: 'rejected', estimatedAmountCents: 12_500 }),
      // Approvable with no priced amount: counted as an estimate, never as ₹0.
      row({ id: 'd', status: 'arrived', estimateStatus: 'pending' }),
      // No estimate at all: contributes nothing to estimate metrics.
      row({ id: 'e', status: 'requested' }),
    ]);
    expect(s.totalEstimates).toBe(4);
    expect(s.estimatesByStatus).toEqual({ pending: 2, approved: 1, rejected: 1 });
    expect(s.totalEstimatedAmountCents).toBe(49_900 + 61_000 + 12_500);
    expect(s.estimatesWithAmount).toBe(3);
    expect(s.totalApprovedEstimateAmountCents).toBe(61_000);
    expect(s.approvedEstimatesWithAmount).toBe(1);
  });

  it('ignores non-numeric and negative estimated amounts', () => {
    const s = estimatePaymentSummary([
      row({ id: 'a', status: 'service', estimateStatus: 'pending', estimatedAmountCents: null }),
      row({ id: 'b', status: 'service', estimateStatus: 'pending', estimatedAmountCents: -100 }),
      row({ id: 'c', status: 'service', estimateStatus: 'pending', estimatedAmountCents: 100.6 }),
    ]);
    expect(s.estimatesWithAmount).toBe(1);
    expect(s.totalEstimatedAmountCents).toBe(101);
    expect(s.totalApprovedEstimateAmountCents).toBeNull();
  });

  it('counts recorded cash/UPI payments and separates paid from awaiting', () => {
    const s = estimatePaymentSummary([
      row({ id: 'a', status: 'completed', amountCents: 49_900, paymentMethod: 'cash', paymentStatus: 'paid', paidAt: 1 }),
      row({ id: 'b', status: 'completed', amountCents: 25_000, paymentMethod: 'upi', paymentStatus: 'paid', paidAt: 2 }),
      // Completed, nothing recorded yet → the only reachable "pending" set.
      row({ id: 'c', status: 'completed', amountCents: 10_000 }),
      // A live job is not "pending payment": it is not billable yet.
      row({ id: 'd', status: 'service' }),
    ]);
    expect(s.cashPayments).toBe(1);
    expect(s.upiPayments).toBe(1);
    expect(s.paidPayments).toBe(2);
    expect(s.pendingPayments).toBe(1);
  });

  it('never treats a recorded payment as verified revenue (no verified counter exists)', () => {
    const s = estimatePaymentSummary([
      row({ id: 'a', status: 'completed', amountCents: 49_900, paymentMethod: 'cash', paymentStatus: 'paid', paidAt: 1, paidBy: 'mech-1' }),
    ]);
    expect(s.paidPayments).toBe(1);
    expect(Object.keys(s)).not.toContain('verifiedPayments');
    expect(Object.keys(s)).not.toContain('verifiedRevenueCents');
  });
});

