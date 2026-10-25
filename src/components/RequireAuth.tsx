import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type AuthStatus } from '@/app/AuthProvider';
import { LoadingState } from '@/components/ui';

/**
 * Route guard for authentication; portal-specific guards enforce role/claim access.
 *
 * Returns the redirect target for a (status, configured, pathname) triple,
 * or null when the route may render. Pure — unit-tested.
 *
 * Deliberately role-blind: no client-side role check can ever be a security
 * boundary. Role-based enforcement arrives with M3 Firestore rules; until
 * then every authenticated user may reach every portal shell.
 */
export function resolveAuthRedirect(
  status: AuthStatus,
  configured: boolean,
  pathname: string,
): string | null {
  if (status === 'loading') return null;
  if (!configured || status === 'unauthenticated') {
    return `/login?next=${encodeURIComponent(pathname)}`;
  }
  return null;
}

/** Returns true only for same-origin in-app paths (open-redirect guard for `next`). */
export function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, configured } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <LoadingState label="Checking sign-in…" />
      </main>
    );
  }

  const to = resolveAuthRedirect(status, configured, location.pathname);
  if (to) return <Navigate to={to} replace />;
  return <>{children}</>;
}
