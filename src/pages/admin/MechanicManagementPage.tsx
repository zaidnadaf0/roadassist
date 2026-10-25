import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { setMechanicApproval, watchAllMechanics, type AdminMechanic, type ApprovalAction } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS } from '@/lib/fixtures';

type Filter = 'pending' | 'approved' | 'suspended' | 'all';

function groupOf(m: AdminMechanic): Exclude<Filter, 'all'> {
  if (m.verificationStatus === 'suspended') return 'suspended';
  if (m.approved) return 'approved';
  return 'pending';
}

const ACTIONS: { status: ApprovalAction; label: string; variant: 'primary' | 'secondary' | 'danger' }[] = [
  { status: 'under_review', label: 'Start review', variant: 'secondary' },
  { status: 'approved', label: 'Approve', variant: 'primary' },
  { status: 'suspended', label: 'Suspend', variant: 'secondary' },
  { status: 'rejected', label: 'Reject', variant: 'danger' },
];

export function MechanicManagementPage() {
  const { demoMode } = useAuth();
  const [roster, setRoster] = useState<AdminMechanic[] | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (demoMode) {
      setRoster(DEMO_ADMIN_MECHANICS);
      setFeedError(false);
      return;
    }
    const unsub = watchAllMechanics(setRoster, 200, () => setFeedError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode]);

  const filtered = useMemo(() => {
    const list = roster ?? [];
    if (filter === 'all') return list;
    return list.filter((m) => groupOf(m) === filter);
  }, [roster, filter]);

  const counts = useMemo(() => {
    const list = roster ?? [];
    return {
      pending: list.filter((m) => groupOf(m) === 'pending').length,
      approved: list.filter((m) => groupOf(m) === 'approved').length,
      suspended: list.filter((m) => groupOf(m) === 'suspended').length,
    };
  }, [roster]);

  async function act(uid: string, status: ApprovalAction) {
    setBusy(`${uid}:${status}`);
    setNotice(null);
    if (demoMode) {
      setRoster((current) => (current ?? []).map((mechanic) => mechanic.id === uid ? {
        ...mechanic,
        approved: status === 'approved' ? true : status === 'suspended' || status === 'rejected' ? false : mechanic.approved,
        verificationStatus: status,
        isAvailable: status === 'approved' ? true : status === 'suspended' || status === 'rejected' ? false : mechanic.isAvailable,
      } : mechanic));
      setBusy(null);
      setNotice(`Demo mechanic → ${status}. This change is local only.`);
      return;
    }
    const res = await setMechanicApproval(uid, status);
    setBusy(null);
    setNotice(
      res === 'ok' ? `Mechanic → ${status}.`
      : res === 'forbidden' ? 'Not permitted — your session lacks the admin claim.'
      : res === 'not_found' ? 'Mechanic record no longer exists.'
      : res === 'rejected_by_server' ? 'Server refused the transition (e.g. rejected needs re-review first).'
      : 'Operation failed. Try again.',
    );
  }

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Mechanics" description="Applications, approvals, suspensions. Every change runs through the server-side approval callable — never a direct write." />
        {demoMode && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">Demo approval actions update the sample roster locally. No mechanic claim or Firestore document is changed.</p>}
        {notice && (
          <p role="status" className="mb-4 rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-cream">{notice}</p>
        )}
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          {(['pending', 'approved', 'suspended', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs capitalize ${filter === f ? 'bg-safety-500/15 font-semibold text-safety-300' : 'text-steel-300 hover:text-cream'}`}
            >
              {f}{f === 'pending' ? ` · ${counts.pending}` : f === 'approved' ? ` · ${counts.approved}` : f === 'suspended' ? ` · ${counts.suspended}` : ''}
            </button>
          ))}
        </div>
        {feedError && !demoMode ? (
          <ErrorState title="Mechanic roster unavailable" description="The mechanic roster could not be loaded. Check your connection and try again." />
        ) : roster === null ? (
          <LoadingState label="Loading mechanics…" />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nothing here" description={filter === 'pending' ? 'No applications awaiting review.' : 'No mechanics in this state.'} />
        ) : (
          <div className="grid gap-3">
            {filtered.map((m) => (
              <Card key={m.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-cream">{m.name} <span className="font-mono text-xs font-normal text-steel-500">{m.id.slice(0, 8)}</span></p>
                    <p className="text-sm text-steel-300">
                      {m.garageName ?? '—'} · {(m.specialties ?? []).join(', ') || 'general'}
                      {m.serviceRadiusKm != null ? ` · ~${m.serviceRadiusKm} km` : ''}
                      {typeof m.rating === 'number' ? ` · ★${m.rating.toFixed(1)}` : ''}
                    </p>
                  </div>
                  <Badge tone={m.approved ? 'success' : m.verificationStatus === 'suspended' ? 'danger' : 'warning'}>
                    {m.verificationStatus ?? (m.approved ? 'approved' : 'pending')}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ACTIONS.filter((a) => {
                    // Hide no-op transitions to keep the UI honest.
                    if (a.status === 'approved' && m.approved && m.verificationStatus !== 'suspended') return false;
                    if (a.status === 'under_review' && m.verificationStatus === 'under_review') return false;
                    if (a.status === 'suspended' && m.verificationStatus === 'suspended') return false;
                    return true;
                  }).map((a) => (
                    <Button key={a.status} size="sm" variant={a.variant} disabled={busy !== null} onClick={() => act(m.id, a.status)}>
                      {busy === `${m.id}:${a.status}` ? 'Saving…' : a.label}
                    </Button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
