import { describe, expect, it } from 'vitest';
import { resolveAdminGate } from '@/components/RequireAdmin';
import { computeStats, type AdminMechanic, type AdminRequest, type AdminUser } from '@/lib/admin';

describe('admin gate decisions (hint is never authority)', () => {
  it('loads while auth or claim is unresolved', () => {
    expect(resolveAdminGate('loading', null)).toBe('loading');
    expect(resolveAdminGate('loading', true)).toBe('loading');
    expect(resolveAdminGate('authenticated', null)).toBe('loading');
  });

  it('allows only an authenticated holder of the true claim', () => {
    expect(resolveAdminGate('authenticated', true)).toBe('allow');
    expect(resolveAdminGate('authenticated', false)).toBe('deny');
    expect(resolveAdminGate('unauthenticated', null)).toBe('deny');
    expect(resolveAdminGate('unauthenticated', true)).toBe('deny');
  });
});

describe('dashboard stats (windowed, honest)', () => {
  const req = (id: string, status: AdminRequest['status']): AdminRequest => ({
    id,
    customerId: 'c',
    problemText: 'x',
    status,
  });
  const requests = [
    req('1', 'requested'),
    req('2', 'accepted'),
    req('3', 'service'),
    req('4', 'completed'),
    req('5', 'cancelled'),
  ];
  const users: AdminUser[] = [
    { id: 'u1', role: 'customer' },
    { id: 'u2', role: 'mechanic' },
    { id: 'u3', role: 'admin' },
  ];
  const mechanics: AdminMechanic[] = [
    { id: 'm1', name: 'A', approved: false, verificationStatus: 'pending' },
    { id: 'm2', name: 'B', approved: true, verificationStatus: 'approved' },
    { id: 'm3', name: 'C', approved: false, verificationStatus: 'suspended' },
  ];

  it('counts by status with active/completed/cancelled rollups', () => {
    const s = computeStats(requests, users, mechanics);
    expect(s.windowSize).toBe(5);
    expect(s.active).toBe(3);
    expect(s.completed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.byStatus.requested).toBe(1);
  });

  it('splits the roster honestly, nulls when unloaded', () => {
    const s = computeStats(requests, users, mechanics);
    expect(s.totalUsers).toBe(3);
    expect(s.mechanicsTotal).toBe(3);
    expect(s.mechanicsPending).toBe(1);
    expect(s.mechanicsApproved).toBe(1);
    expect(s.mechanicsSuspended).toBe(1);
    const empty = computeStats([], null, null);
    expect(empty.totalUsers).toBeNull();
    expect(empty.mechanicsTotal).toBeNull();
    expect(empty.active).toBe(0);
  });
});
