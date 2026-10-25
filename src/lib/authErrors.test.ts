import { describe, expect, it } from 'vitest';
import { FALLBACK_AUTH_MESSAGE, mapAuthError, toAuthCode } from '@/lib/authErrors';

describe('auth error mapping', () => {
  it('maps known Firebase codes to safe user strings', () => {
    expect(mapAuthError({ code: 'auth/email-already-in-use' })).toMatch(/already exists/);
    expect(mapAuthError({ code: 'auth/invalid-email' })).toMatch(/valid email/);
    expect(mapAuthError({ code: 'auth/weak-password' })).toMatch(/6 characters/);
    expect(mapAuthError({ code: 'auth/invalid-credential' })).toMatch(/Incorrect email/);
    expect(mapAuthError({ code: 'auth/user-not-found' })).toMatch(/Incorrect email/);
    expect(mapAuthError({ code: 'auth/user-disabled' })).toMatch(/disabled/);
    expect(mapAuthError({ code: 'auth/too-many-requests' })).toMatch(/few minutes/);
    expect(mapAuthError({ code: 'auth/network-request-failed' })).toMatch(/Network/);
  });

  it('never leaks raw codes for unknown failures', () => {
    expect(mapAuthError({ code: 'auth/internal-error' })).toBe(FALLBACK_AUTH_MESSAGE);
    expect(mapAuthError(new Error('auth/internal-error'))).toBe(FALLBACK_AUTH_MESSAGE);
    expect(mapAuthError(null)).toBe(FALLBACK_AUTH_MESSAGE);
    expect(mapAuthError('auth/some-future-code')).toBe(FALLBACK_AUTH_MESSAGE);
  });

  it('extracts codes only from Firebase-shaped errors', () => {
    expect(toAuthCode({ code: 'auth/x' })).toBe('auth/x');
    expect(toAuthCode({ code: 42 })).toBe('unknown');
    expect(toAuthCode(null)).toBe('unknown');
  });
});
