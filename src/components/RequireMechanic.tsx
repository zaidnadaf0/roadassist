import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { accessForRecord, watchMyMechanicRecord, type MechanicAccess, type MechanicRecord } from '@/lib/mechanic';
import { EmptyState, LoadingState, PageHeader } from '@/components/ui';

/**
 * M5 mechanic UX guard — navigation convenience ONLY, never a security
 * boundary (M3 Firestore rules enforce everything). Reads the trusted
 * `mechanics/{uid}` record and renders honest approval-state screens.
 */
export function useMechanicAccess(): { access: MechanicAccess | 'loading'; record: MechanicRecord | null } {
  const { user, status } = useAuth();
  const [record, setRecord] = useState<MechanicRecord | null | 'loading'>('loading');

  useEffect(() => {
    if (status === 'loading') return;
    if (!user) {
      setRecord(null);
      return;
    }
    setRecord('loading');
    const unsub = watchMyMechanicRecord(user.uid, (r) => setRecord(r));
    return () => {
      if (unsub) unsub();
    };
  }, [user, status]);

  if (record === 'loading') return { access: 'loading', record: null };
  return { access: accessForRecord(record), record };
}

function StatusShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={title} description="Your workshop standing with RoadAssist operations." />
      {children}
    </div>
  );
}

/**
 * Wraps approved-only mechanic screens. Non-approved identities get an
 * honest status screen with next steps — never a fake approval button.
 */
export function RequireMechanic({ children }: { children: ReactNode }) {
  const { isAdmin, profileRole } = useAuth();
  const { access } = useMechanicAccess();

  // Keep portal entry role-aware. Approved mechanics are allowed through
  // even when their historical users/{uid}.role hint is still customer;
  // the approved mechanic record is the authoritative operational gate.
  if (isAdmin === true) return <Navigate to="/admin" replace />;
  if (profileRole === 'customer' && access !== 'loading' && access.kind === 'none') {
    return <Navigate to="/app" replace />;
  }

  if (access === 'loading') {
    return (
      <div className="mx-auto max-w-2xl">
        <LoadingState label="Checking workshop status…" />
      </div>
    );
  }

  if (access.kind === 'approved') return <>{children}</>;

  if (access.kind === 'none') {
    return (
      <StatusShell title="Become a mechanic">
        <EmptyState
          title="No workshop application yet"
          description="Apply with your garage details. Operations reviews every application before the first job — approval cannot be granted from this screen."
        />
        <p className="mt-4">
          <Link to="/m/apply" className="inline-flex h-11 items-center rounded-xl bg-safety-500 px-5 text-sm font-semibold text-white hover:bg-safety-600">
            Apply as a mechanic
          </Link>
        </p>
      </StatusShell>
    );
  }

  if (access.kind === 'pending' || access.kind === 'under_review') {
    return (
      <StatusShell title="Application under review">
        <EmptyState
          title={access.kind === 'pending' ? 'Application received' : 'Review in progress'}
          description="Operations is verifying your garage, documents, and coverage. You will see the job queue the moment you are approved — nothing else is needed from you right now."
        />
      </StatusShell>
    );
  }

  if (access.kind === 'suspended') {
    return (
      <StatusShell title="Account suspended">
        <EmptyState
          title="Temporarily suspended"
          description="Your workshop is paused while operations reviews an issue. Active jobs already assigned to you remain visible to support, but new work and status changes are blocked."
        />
      </StatusShell>
    );
  }

  return (
    <StatusShell title="Application not approved">
      <EmptyState
        title="Application rejected"
        description="This workshop application was not approved. Contact RoadAssist support if you believe this is a mistake, or submit a fresh application with corrected details."
      />
      <p className="mt-4">
        <Link to="/m/apply" className="inline-flex h-11 items-center rounded-xl border border-line-soft px-5 text-sm font-medium hover:border-line-strong">
          Submit a fresh application
        </Link>
      </p>
    </StatusShell>
  );
}
