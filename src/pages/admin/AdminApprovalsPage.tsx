import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { setMechanicApproval, watchAllMechanics, type AdminMechanic, type ApprovalAction } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS } from '@/lib/fixtures';
import type { RoutePageProps } from '@/routes';

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

/**
 * Shared mechanic roster for two routes: /admin/approvals opens filtered to
 * pending applications (its nav intent), /admin/mechanics opens the full
 * roster. Both run the same callable-backed actions.
 */
export function MechanicManagementPage({ routePath }: Partial<RoutePageProps> = {}) {
  const { demoMode } = useAuth();
  const [roster, setRoster] = useState<AdminMechanic[] | null>(null);
  const [filter, setFilter] = useState<Filter>(routePath === '/admin/approvals' ? 'pending' : 'all');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [search, setSearch] = useState('');

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
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (filter !== 'all' && groupOf(m) !== filter) return false;
      if (!q) return true;
      const demo = DEMO_ADMIN_MECHANICS.find((x) => x.id === m.id);
      return [m.name, m.garageName, m.specialties?.join(' '), demo?.serviceArea, demo?.vehicleTypes.join(' ')]
        .some((part) => String(part ?? '').toLowerCase().includes(q));
    });
  }, [roster, filter, search]);

  const counts = useMemo(() => {
    const list = roster ?? [];
    return {
      pending: list.filter((m) => groupOf(m) === 'pending').length,
      approved: list.filter((m) => groupOf(m) === 'approved').length,
      suspended: list.filter((m) => groupOf(m) === 'suspended').length,
    };
  }, [roster]);

  async function act(uid: string, status: ApprovalAction) {
    if (demoMode) return;
    setBusy(`${uid}:${status}`);
    setNotice(null);
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
        {demoMode && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">DEMO MODE — Sample mechanics only. Approval controls are disabled here; no sample approval is recorded and no Firestore document is changed.</p>}
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
              className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors capitalize ${filter === f ? 'border-safety-500/50 bg-safety-500/15 font-semibold text-safety-300' : 'border-line-soft text-steel-300 hover:border-line-strong hover:bg-graphite-soft/60 hover:text-cream'}`}
            >
              {f}{f === 'pending' ? ` · ${counts.pending}` : f === 'approved' ? ` · ${counts.approved}` : f === 'suspended' ? ` · ${counts.suspended}` : ''}
            </button>
          ))}
        </div>
        <label className="mb-4 block">
          <span className="text-xs font-medium text-steel-400">Search mechanics by workshop, specialty, vehicle, or service area</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. battery or Koramangala" className="mt-1.5 h-10 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-sm text-cream" />
        </label>
        {feedError && !demoMode ? (
          <ErrorState title="Mechanic roster unavailable" description="The mechanic roster could not be loaded. Check your connection and try again." />
        ) : roster === null ? (
          <LoadingState label="Loading mechanics…" />
        ) : filtered.length === 0 ? (
          <EmptyState title={search ? 'No matching mechanics' : 'Nothing here'} description={search ? 'Change the search text or select another approval state.' : filter === 'pending' ? 'No applications awaiting review.' : 'No mechanics in this state.'} />
        ) : (
          <div className="grid gap-3">
            {filtered.map((m) => (
              <Card key={m.id}>
                {(() => {
                  const demo = demoMode ? DEMO_ADMIN_MECHANICS.find((x) => x.id === m.id) : undefined;
                  return <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-cream">{m.name} <span className="font-mono text-xs font-normal text-steel-500">{m.id.slice(0, 8)}</span></p>
                    <p className="text-sm text-steel-300">
                      {m.garageName ?? '—'} · {(m.specialties ?? []).join(', ') || 'general'}
                      {m.serviceRadiusKm != null ? ` · ~${m.serviceRadiusKm} km` : ''}
                      {typeof m.rating === 'number' ? ` · ★${m.rating.toFixed(1)}` : ''}
                      {demo ? ` · ${demo.completedJobs} completed jobs` : ''}
                    </p>
                    {demo && <p className="mt-1 text-xs text-steel-400">Area: {demo.serviceArea} · Vehicles: {demo.vehicleTypes.join(', ')} · {m.isAvailable ? 'Available' : 'Unavailable'}</p>}
                  </div>
                  <Badge tone={m.approved ? 'success' : m.verificationStatus === 'suspended' ? 'danger' : 'warning'}>
                    {m.verificationStatus ?? (m.approved ? 'approved' : 'pending')}
                  </Badge>
                </div>
                {!demoMode && <div className="mt-3 flex flex-wrap gap-2">
                  {ACTIONS.filter((a) => {
                    // Mirror the server transition guard: hide no-ops AND
                    // actions the callable will refuse (rejected needs
                    // re-review before anything else).
                    if (m.verificationStatus === 'rejected' && a.status !== 'under_review') return false;
                    if (a.status === 'approved' && m.approved && m.verificationStatus !== 'suspended') return false;
                    if (a.status === 'under_review' && m.verificationStatus === 'under_review') return false;
                    if (a.status === 'suspended' && m.verificationStatus === 'suspended') return false;
                    return true;
                  }).map((a) => (
                    <Button key={a.status} size="sm" variant={a.variant} disabled={busy !== null} onClick={() => act(m.id, a.status)}>
                      {busy === `${m.id}:${a.status}` ? 'Saving…' : a.label}
                    </Button>
                  ))}
                </div>}
                  </>;
                })()}
              </Card>
            ))}
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
