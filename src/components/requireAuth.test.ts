import { describe, expect, it } from 'vitest';
import { resolveAuthRedirect, safeNextPath } from '@/components/RequireAuth';

describe('RequireAuth redirect decisions', () => {
  it('renders (no redirect) while auth resolves', () => {
    expect(resolveAuthRedirect('loading', true, '/app')).toBeNull();
    expect(resolveAuthRedirect('loading', false, '/app')).toBeNull();
  });

  it('sends unauthenticated users to login with a next param', () => {
    expect(resolveAuthRedirect('unauthenticated', true, '/app')).toBe('/login?next=%2Fapp');
    expect(resolveAuthRedirect('unauthenticated', true, '/admin/logs')).toBe('/login?next=%2Fadmin%2Flogs');
  });

  it('treats unconfigured backend as unauthenticated', () => {
    expect(resolveAuthRedirect('authenticated', false, '/app')).toBe('/login?next=%2Fapp');
  });

  it('lets authenticated users through when configured', () => {
    expect(resolveAuthRedirect('authenticated', true, '/app')).toBeNull();
  });

  it('rejects open-redirect and non-app next targets', () => {
    expect(safeNextPath('/app')).toBe('/app');
    expect(safeNextPath('/track/abc')).toBe('/track/abc');
    expect(safeNextPath('https://evil.test/')).toBeNull();
    expect(safeNextPath('//evil.test/')).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
