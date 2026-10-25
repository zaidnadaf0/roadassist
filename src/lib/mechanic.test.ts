import { describe, expect, it } from 'vitest';
import {
  NEXT_STATUS,
  RELEASABLE,
  accessForRecord,
  canAdvance,
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
