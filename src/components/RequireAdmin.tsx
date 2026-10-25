import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { EmptyState, LoadingState, PageHeader } from '@/components/ui';
import { Button } from '@/components/ui';

/**
 * M6 admin UX guard — navigation convenience ONLY. Real enforcement is the
 * M3 `isClaimAdmin()` rule evaluated per document server-side.
 *
 * Decision matrix (pure `resolveAdminGate`, unit-tested):
 * - auth resolving OR claim unknown → skeleton (never a flash of denial)
 * - claim true → render
 * - anything else (incl. users.role='admin' WITHOUT the claim) → blocked
 */
export type AdminGate = 'loading' | 'allow' | 'deny';

export function resolveAdminGate(authStatus: string, isAdmin: boolean | null): AdminGate {
  if (authStatus === 'loading' || (authStatus === 'authenticated' && isAdmin === null)) return 'loading';
  if (authStatus === 'authenticated' && isAdmin === true) return 'allow';
  return 'deny';
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin, refreshClaim } = useAuth();
  const gate = resolveAdminGate(status, isAdmin);

  if (gate === 'loading') {
    return (
      <div className="mx-auto max-w-3xl">
        <LoadingState label="Verifying admin access…" />
      </div>
    );
  }

  if (gate === 'deny') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Admin access required" description="This operations portal is restricted." />
        <EmptyState
          title="Not an admin"
          description="Admin authority comes from a server-minted access claim, not from your profile. If you were just granted access, refresh your session token and try again."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void refreshClaim();
            }}
          >
            Refresh session claim
          </Button>
          <Link to="/" className="inline-flex h-11 items-center rounded-xl border border-line-soft px-5 text-sm font-medium hover:border-line-strong">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
