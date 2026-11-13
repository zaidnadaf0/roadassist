import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT_CENTS,
  MAX_DURATION_MIN,
  MAX_ESTIMATE_AMOUNT_CENTS,
  MAX_ESTIMATE_DURATION_MIN,
  NEXT_STATUS,
  RELEASABLE,
  accessForRecord,
  canAdvance,
  parseBillingInput,
  parseEstimateInput,
  parsePaymentInput,
  summarizeEarnings,
  type MechanicRecord,
} from '@/lib/mechanic';

function record(over: Partial<MechanicRecord> = {}): MechanicRecord {
  return {
    id: 'm1',
    name: 'M One',
    approved: false,
    verificationStatus: 'pending',
    specialties: ['tow'],
    isAvailable: true,
    ...over,
  };
}

describe('mechanic access states', () => {
  it('maps absence to none', () => {
    expect(accessForRecord(null)).toEqual({ kind: 'none' });
  });

  it('approved + not suspended → approved', () => {
    const a = accessForRecord(record({ approved: true, verificationStatus: 'approved' }));
    expect(a.kind).toBe('approved');
  });

  it('suspended is never approved, even with the stale flag', () => {
    const a = accessForRecord(record({ approved: true, verificationStatus: 'suspended' }));
    expect(a.kind).toBe('suspended');
  });

  it('pending / under_review / rejected map through', () => {
    expect(accessForRecord(record({ verificationStatus: 'pending' })).kind).toBe('pending');
    expect(accessForRecord(record({ verificationStatus: 'under_review' })).kind).toBe('under_review');
    expect(accessForRecord(record({ verificationStatus: 'rejected' })).kind).toBe('rejected');
  });

  it('unapproved without a known state maps to none (never approved)', () => {
    expect(accessForRecord(record({ approved: false, verificationStatus: undefined })).kind).toBe('none');
  });
});

describe('transition guard (mirrors M3 rules)', () => {
  it('allows exactly the canonical chain', () => {
    expect(canAdvance('accepted', 'on-the-way')).toBe(true);
    expect(canAdvance('on-the-way', 'arrived')).toBe(true);
    expect(canAdvance('arrived', 'service')).toBe(true);
    expect(canAdvance('service', 'completed')).toBe(true);
  });

  it('rejects skips, reversals, and terminal exits', () => {
    expect(canAdvance('accepted', 'arrived')).toBe(false);
    expect(canAdvance('on-the-way', 'accepted')).toBe(false);
    expect(canAdvance('service', 'accepted')).toBe(false);
    expect(canAdvance('completed', 'service')).toBe(false);
    expect(canAdvance('requested', 'accepted')).toBe(false);
    expect(canAdvance('cancelled', 'requested')).toBe(false);
  });

  it('releasable set matches the rules release branch', () => {
    expect(RELEASABLE).toEqual(['accepted', 'on-the-way', 'arrived', 'service']);
    expect(Object.keys(NEXT_STATUS)).toEqual(['accepted', 'on-the-way', 'arrived', 'service']);
  });
});

describe('earnings summary (trusted data only)', () => {
  it('sums completed amounts, ignores everything else', () => {
    const s = summarizeEarnings([
      { id: 'a', customerId: 'c', vehicleId: 'v', problemText: 'x', status: 'completed', customerLat: 0, customerLng: 0, amountCents: 49900 },
      { id: 'b', customerId: 'c', vehicleId: 'v', problemText: 'x', status: 'completed', customerLat: 0, customerLng: 0 },
      { id: 'c', customerId: 'c', vehicleId: 'v', problemText: 'x', status: 'accepted', customerLat: 0, customerLng: 0, amountCents: 99999 },
      { id: 'd', customerId: 'c', vehicleId: 'v', problemText: 'x', status: 'completed', customerLat: 0, customerLng: 0, amountCents: -5 },
    ]);
    expect(s).toEqual({ totalCents: 49900, jobs: 3 });
  });
});

describe('parseBillingInput (server bounds: ₹10,000 / 24h)', () => {
  it('accepts plain amounts and durations', () => {
    expect(parseBillingInput('499', '25')).toEqual({ ok: true, extra: { amountCents: 49900, durationMin: 25 } });
    expect(parseBillingInput('', '')).toEqual({ ok: true, extra: {} });
    expect(parseBillingInput('0', '0')).toEqual({ ok: true, extra: { amountCents: 0, durationMin: 0 } });
  });

  it('rejects non-finite input (typos like "4 9")', () => {
    const res = parseBillingInput('4 9', '');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/positive number/i);
  });

  it('rejects negative amounts and durations', () => {
    expect(parseBillingInput('-5', '').ok).toBe(false);
    expect(parseBillingInput('', '-10').ok).toBe(false);
  });

  it('rejects over-limit amounts and durations with specific messages', () => {
    const big = parseBillingInput(String(MAX_AMOUNT_CENTS / 100 + 0.01), '');
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toContain('10,000');
    const long = parseBillingInput('', String(MAX_DURATION_MIN + 1));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toContain('1440');
  });

  it('accepts the exact bounds', () => {
    expect(parseBillingInput(String(MAX_AMOUNT_CENTS / 100), String(MAX_DURATION_MIN)).ok).toBe(true);
  });
});

describe('parseEstimateInput', () => {
  it('accepts valid diagnosis, amount and duration', () => {
    const res = parseEstimateInput('Battery dead, alternator not charging', '499', '45');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.extra).toEqual({ estimatedAmountCents: 49900, estimatedDurationMin: 45, diagnosis: 'Battery dead, alternator not charging' });
    }
  });

  it('rejects non-finite amounts', () => {
    const res = parseEstimateInput('test', '4 9', '25');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/positive number/i);
  });

  it('rejects negative amounts', () => {
    const res = parseEstimateInput('test', '-5', '25');
    expect(res.ok).toBe(false);
  });

  it('rejects over-limit amounts', () => {
    const res = parseEstimateInput('test', String(MAX_ESTIMATE_AMOUNT_CENTS / 100 + 0.01), '25');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('10,000');
  });

  it('rejects negative durations', () => {
    const res = parseEstimateInput('test', '100', '-10');
    expect(res.ok).toBe(false);
  });

  it('accepts empty diagnosis and optional fields', () => {
    const res = parseEstimateInput(null, '', '');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.extra).toEqual({});
  });

  it('accepts exact estimate bounds', () => {
    const res = parseEstimateInput('test', String(MAX_ESTIMATE_AMOUNT_CENTS / 100), String(MAX_ESTIMATE_DURATION_MIN));
    expect(res.ok).toBe(true);
  });
});

describe('parsePaymentInput', () => {
  it('accepts cash payment', () => {
    const res = parsePaymentInput('cash', '499');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.extra).toEqual({ paymentMethod: 'cash', amountCents: 49900 });
  });

  it('accepts UPI payment', () => {
    const res = parsePaymentInput('upi', '250.50');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.extra).toEqual({ paymentMethod: 'upi', amountCents: 25050 });
  });

  it('rejects invalid payment method', () => {
    const res = parsePaymentInput('card', '100');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cash or UPI/i);
  });

  it('rejects non-finite amounts', () => {
    const res = parsePaymentInput('cash', '4 9');
    expect(res.ok).toBe(false);
  });

  it('rejects over-limit amounts', () => {
    const res = parsePaymentInput('cash', String(MAX_AMOUNT_CENTS / 100 + 0.01));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('10,000');
  });

  it('accepts exact payment bound', () => {
    const res = parsePaymentInput('cash', String(MAX_AMOUNT_CENTS / 100));
    expect(res.ok).toBe(true);
  });
});
