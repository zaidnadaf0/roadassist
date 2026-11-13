import { describe, expect, it } from 'vitest';
import { resolveAdminGate } from '@/components/RequireAdmin';
import { computeStats, findExceptions, mechanicStates, type AdminMechanic, type AdminRequest, type AdminUser } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS, DEMO_ADMIN_OFFERS, DEMO_ADMIN_REQUESTS, DEMO_ADMIN_REVIEWS, DEMO_ADMIN_USERS, DEMO_ADMIN_VEHICLES } from '@/lib/fixtures';

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

  it('counts waiting separately from active, completed, and cancelled rollups', () => {
    const s = computeStats(requests, users, mechanics);
    expect(s.windowSize).toBe(5);
    expect(s.active).toBe(2);
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

describe('mechanicStates (approval/availability breakdown)', () => {
  const roster: AdminMechanic[] = [
    { id: 'a', name: 'A', approved: true, verificationStatus: 'approved', isAvailable: true },
    { id: 'b', name: 'B', approved: true, verificationStatus: 'approved', isAvailable: false },
    { id: 'c', name: 'C', approved: false, verificationStatus: 'pending', isAvailable: true },
    { id: 'd', name: 'D', approved: false, verificationStatus: 'under_review' },
    { id: 'e', name: 'E', approved: false, verificationStatus: 'suspended' },
    { id: 'f', name: 'F', approved: false, verificationStatus: 'rejected' },
  ];

  it('counts each state and splits approved by availability', () => {
    const s = mechanicStates(roster);
    expect(s).toEqual({
      pending: 1, underReview: 1, approved: 2, suspended: 1, rejected: 1,
      approvedAvailable: 1, approvedUnavailable: 1,
    });
  });

  it('treats an empty roster as all zeros', () => {
    expect(mechanicStates([]).approved).toBe(0);
  });
});

describe('admin demonstration dataset integrity', () => {
  it('keeps request totals and lifecycle examples internally consistent', () => {
    const counts = DEMO_ADMIN_REQUESTS.reduce<Record<string, number>>((out, request) => {
      out[request.status] = (out[request.status] ?? 0) + 1;
      return out;
    }, {});
    expect(DEMO_ADMIN_REQUESTS).toHaveLength(10);
    expect(counts).toEqual({ 'on-the-way': 1, accepted: 1, requested: 1, arrived: 1, service: 1, completed: 4, cancelled: 1 });
    expect(DEMO_ADMIN_USERS.filter((user) => user.role === 'customer')).toHaveLength(5);
    expect(DEMO_ADMIN_MECHANICS.filter((mechanic) => mechanic.approved)).toHaveLength(3);
    expect(DEMO_ADMIN_MECHANICS.filter((mechanic) => mechanic.verificationStatus === 'under_review')).toHaveLength(1);
  });

  it('links sample requests, vehicles, mechanics, offers, and reviews to valid demo records', () => {
    const users = new Set(DEMO_ADMIN_USERS.filter((user) => user.role === 'customer').map((user) => user.id));
    const mechanics = new Set(DEMO_ADMIN_MECHANICS.map((mechanic) => mechanic.id));
    const vehicles = new Map(DEMO_ADMIN_VEHICLES.map((vehicle) => [vehicle.id, vehicle.ownerId]));
    const requests = new Map(DEMO_ADMIN_REQUESTS.map((request) => [request.id, request]));
    for (const request of DEMO_ADMIN_REQUESTS) {
      expect(users.has(request.customerId)).toBe(true);
      expect(vehicles.get(request.vehicleId ?? '')).toBe(request.customerId);
      if (request.mechanicId) expect(mechanics.has(request.mechanicId)).toBe(true);
    }
    for (const offer of DEMO_ADMIN_OFFERS) {
      expect(requests.has(offer.requestId)).toBe(true);
      expect(mechanics.has(offer.mechanicId)).toBe(true);
    }
    for (const review of DEMO_ADMIN_REVIEWS) {
      const request = requests.get(review.requestId);
      expect(request?.status).toBe('completed');
      expect(review.rating).toBe(request?.rating);
    }
  });
});

describe('findExceptions (operational attention list)', () => {
  const NOW = 1_000_000_000_000;
  const req = (over: Partial<AdminRequest> & { id: string }): AdminRequest => ({
    customerId: 'c', problemText: 'x', status: 'requested', ...over,
  });

  it('flags open requests whose offer window has expired', () => {
    const stale = req({ id: 's1', offerExpiresAt: NOW - 1000 });
    const fresh = req({ id: 's2', offerExpiresAt: NOW + 60_000 });
    const ex = findExceptions([stale, fresh], [], NOW);
    expect(ex.staleOpen.map((r) => r.id)).toEqual(['s1']);
    expect(ex.longActive).toEqual([]);
  });

  it('flags open requests with no recorded expiry that have sat too long', () => {
    const old = req({ id: 'o1', createdAt: NOW - 30 * 60_000 });
    const recent = req({ id: 'o2', createdAt: NOW - 60_000 });
    const ex = findExceptions([old, recent], [], NOW);
    expect(ex.staleOpen.map((r) => r.id)).toEqual(['o1']);
  });

  it('flags live jobs older than 24h but not fresh assignments', () => {
    const stuck = req({ id: 'l1', status: 'service', createdAt: NOW - 25 * 60 * 60_000, mechanicId: 'm' });
    const active = req({ id: 'l2', status: 'service', createdAt: NOW - 60_000, mechanicId: 'm' });
    const ex = findExceptions([stuck, active], [], NOW);
    expect(ex.longActive.map((r) => r.id)).toEqual(['l1']);
    expect(ex.staleOpen).toEqual([]);
  });

  it('lists blocked mechanics and caps every list', () => {
    const many = Array.from({ length: 9 }, (_, i) => req({ id: `r${i}`, offerExpiresAt: NOW - 1000 }));
    const blocked: AdminMechanic[] = [
      { id: 'e', name: 'E', approved: false, verificationStatus: 'suspended' },
      { id: 'f', name: 'F', approved: false, verificationStatus: 'rejected' },
    ];
    const ex = findExceptions(many, blocked, NOW, 5);
    expect(ex.staleOpen).toHaveLength(5);
    expect(ex.blockedMechanics).toHaveLength(2);
  });

  it('ignores cancelled and completed requests entirely', () => {
    const ex = findExceptions(
      [req({ id: 'c1', status: 'cancelled', offerExpiresAt: NOW - 999_999 }), req({ id: 'c2', status: 'completed' })],
      [],
      NOW,
    );
    expect(ex.staleOpen).toEqual([]);
    expect(ex.longActive).toEqual([]);
  });
});
