import { describe, expect, it } from 'vitest';
import { ROUTE_DEFS } from '@/routes';
import { CUSTOMER_NAV, MECHANIC_NAV, ADMIN_NAV } from '@/lib/nav';
import { FIXTURE_MECHANICS, FIXTURE_SERVICES } from '@/lib/fixtures';

/**
 * M1 baseline: the IA skeleton is complete and every route resolves
 * to a portal layout. Real rendering tests arrive with real screens.
 */
describe('M1 foundation', () => {
  it('covers every legacy portal route', () => {
    const paths = ROUTE_DEFS.map((r) => r.path);
    for (const must of [
      '/',
      '/features',
      '/pricing',
      '/about',
      '/contact',
      '/onboarding',
      '/login',
      '/signup',
      '/forgot',
      '/verify',
      '/app',
      '/services',
      '/request/:id',
      '/mechanics',
      '/mechanic/:id',
      '/map',
      '/track',
      '/history',
      '/history/:id',
      '/vehicles',
      '/emergency',
      '/notifications',
      '/profile',
      '/settings',
      '/m',
      '/m/requests',
      '/m/job',
      '/m/earnings',
      '/m/profile',
      '/admin',
      '/admin/dispatch',
      '/admin/approvals',
      '/admin/mechanics',
      '/admin/analytics',
      '/admin/reports',
      '/admin/logs',
    ]) {
      expect(paths, `missing route ${must}`).toContain(must);
    }
  });

  it('portal navs expose the legacy IA groups', () => {
    expect(CUSTOMER_NAV.flatMap((g) => g.items).length).toBeGreaterThanOrEqual(11);
    expect(MECHANIC_NAV.flatMap((g) => g.items).length).toBeGreaterThanOrEqual(7);
    expect(ADMIN_NAV.flatMap((g) => g.items).length).toBeGreaterThanOrEqual(11);
  });

  it('fixtures stay labelled and dependency-free', () => {
    expect(FIXTURE_SERVICES).toHaveLength(6);
    expect(FIXTURE_MECHANICS.length).toBeGreaterThan(0);
    expect(JSON.stringify(FIXTURE_MECHANICS)).not.toMatch(/Math\.random|setInterval/);
  });
});
