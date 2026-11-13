import type { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useMechanicAccess } from '@/components/RequireMechanic';
import { Button, ErrorState, LoadingState } from '@/components/ui';

/** Navigation gate for the customer workspace; backend rules remain authoritative. */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { status, isAdmin, profileRole, demoMode, signOut } = useAuth();
  const navigate = useNavigate();
  const { access, retry } = useMechanicAccess(false, demoMode);

  function handleSignOut() {
    void signOut().catch(() => undefined).finally(() => navigate('/login', { replace: true }));
  }

  if (status === 'loading') return <LoadingState label="Loading your portal…" />;
  if (isAdmin === true || profileRole === 'admin') return <Navigate to="/admin" replace />;
  if (profileRole === 'mechanic') return <Navigate to="/m" replace />;
  // Demo portal data is isolated from Firebase. Let an authenticated user
  // view the customer preview even when production Firestore reads are denied.
  if (demoMode) return <>{children}</>;
  if (access === 'loading') return <LoadingState label="Checking your portal…" />;
  if (access === 'error') {
    return (
      <ErrorState
        title="Could not verify your portal"
        description="RoadAssist could not check workshop access. Retry before continuing so an existing mechanic account is not sent to the wrong portal."
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={retry}>Retry status check</Button>
            <Button variant="secondary" onClick={handleSignOut}>Sign out</Button>
          </div>
        )}
      />
    );
  }
  if (access.kind === 'approved') return <Navigate to="/m" replace />;

  return <>{children}</>;
}
