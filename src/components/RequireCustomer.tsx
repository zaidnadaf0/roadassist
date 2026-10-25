import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useMechanicAccess } from '@/components/RequireMechanic';
import { LoadingState } from '@/components/ui';

/** Navigation gate for the customer workspace; backend rules remain authoritative. */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { status, isAdmin, profileRole } = useAuth();
  const { access } = useMechanicAccess();

  if (status === 'loading') return <LoadingState label="Loading your portal…" />;
  if (isAdmin === true || profileRole === 'admin') return <Navigate to="/admin" replace />;
  if (profileRole === 'mechanic') return <Navigate to="/m" replace />;
  if (access === 'loading') return <LoadingState label="Checking your portal…" />;
  if (access.kind === 'approved') return <Navigate to="/m" replace />;

  return <>{children}</>;
}
