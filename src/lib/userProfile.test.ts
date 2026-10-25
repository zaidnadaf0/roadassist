import { describe, expect, it } from 'vitest';
import {
  SIGNUP_ROLE,
  USER_COLLECTION,
  buildNewUserProfile,
  homeForHint,
  isProfileHint,
} from '@/lib/userProfile';

describe('signup profile contract (anti-escalation)', () => {
  it('the only self-assignable role is customer', () => {
    expect(SIGNUP_ROLE).toBe('customer');
    expect(SIGNUP_ROLE).not.toBe('admin');
    expect(SIGNUP_ROLE).not.toBe('mechanic');
  });

  it('builder always produces a customer profile with normalized email', () => {
    const p = buildNewUserProfile('uid-1', '  Asha@Example.COM ', '  Asha Kumar ');
    expect(p).toEqual({ uid: 'uid-1', email: 'asha@example.com', displayName: 'Asha Kumar', role: 'customer' });
  });

  it('builder exposes no privileged-role parameter', () => {
    // If a `role` argument is ever added, this test forces a review:
    // only 'customer' may be producible from the client.
    expect(buildNewUserProfile.length).toBe(3);
  });

  it('hint validation accepts only known roles', () => {
    expect(isProfileHint('customer')).toBe(true);
    expect(isProfileHint('mechanic')).toBe(true);
    expect(isProfileHint('admin')).toBe(true);
    expect(isProfileHint('superadmin')).toBe(false);
    expect(isProfileHint(null)).toBe(false);
    expect(isProfileHint('')).toBe(false);
  });

  it('hint homes route by convenience, defaulting to customer', () => {
    expect(homeForHint(null)).toBe('/app');
    expect(homeForHint('customer')).toBe('/app');
    expect(homeForHint('mechanic')).toBe('/m');
    expect(homeForHint('admin')).toBe('/admin');
  });

  it('profile collection name is stable for M3 rules', () => {
    expect(USER_COLLECTION).toBe('users');
  });
});
