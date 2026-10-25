import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequireAdmin } from '@/components/RequireAdmin';
import { Badge, Card, DemoNotice, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SectionHeading } from '@/components/ui';
import { useAuth } from '@/app/AuthProvider';
import { computeStats, listAllRequestsOnce, watchAllMechanics, watchAllUsers, type AdminMechanic, type AdminRequest, type AdminUser } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS, DEMO_ADMIN_USERS, getDemoAdminRequests } from '@/lib/fixtures';

const STATUS_ORDER = ['requested', 'accepted', 'on-the-way', 'arrived', 'service', 'completed', 'cancelled'] as const;

function statusTone(status: AdminRequest['status']): 'neutral' | 'success' | 'warning' | 'danger' | 'brand' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'requested') return 'warning';
  return 'brand';
}

export function AdminDashboardPage() {
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [mechanics, setMechanics] = useState<AdminMechanic[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const { demoMode } = useAuth();

  useEffect(() => {
    let cancelled = false;
    if (demoMode) {
      setRequests(getDemoAdminRequests());
      setUsers(DEMO_ADMIN_USERS);
      setMechanics(DEMO_ADMIN_MECHANICS);
      setFeedError(false);
      return () => { cancelled = true; };
    }
    setFeedError(false);
    listAllRequestsOnce('all', 200).then((r) => { if (!cancelled) setRequests(r); }).catch(() => { if (!cancelled) { setRequests([]); setFeedError(true); } });
    const a = watchAllUsers((u) => { if (!cancelled) setUsers(u); }, 100, () => { if (!cancelled) { setUsers([]); setFeedError(true); } });
    const b = watchAllMechanics((m) => { if (!cancelled) setMechanics(m); }, 200, () => { if (!cancelled) { setMechanics([]); setFeedError(true); } });
    return () => { cancelled = true; if (a) a(); if (b) b(); };
  }, [demoMode]);

  const feedsLoaded = requests !== null && users !== null && mechanics !== null;
  const usingDemo = demoMode;
  const displayRequests = usingDemo ? getDemoAdminRequests() : (requests ?? []);
  const displayUsers = usingDemo ? DEMO_ADMIN_USERS : (users ?? []);
  const displayMechanics = usingDemo ? DEMO_ADMIN_MECHANICS : (mechanics ?? []);
  const stats = feedsLoaded ? computeStats(displayRequests, displayUsers, displayMechanics) : null;
  const pendingMechanics = displayMechanics.filter((m) => m.verificationStatus === 'pending' || m.verificationStatus === 'under_review');
  const activeRequests = displayRequests.filter((r) => !['completed', 'cancelled'].includes(r.status)).slice(0, 4);
  const readiness = useMemo(() => {
    if (!stats) return 0;
    const total = stats.mechanicsTotal ?? 0;
    return total === 0 ? 0 : Math.round(((stats.mechanicsApproved ?? 0) / total) * 100);
  }, [stats]);

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Operations command centre" description="Monitor demand, dispatch health and mechanic readiness from one place. Counts are limited to the recent data window shown." />
        {!stats ? <LoadingState label="Loading operations dashboard…" /> : <div className="grid gap-6">
          {usingDemo && <DemoNotice>Fictional users, mechanics, requests and audit examples are linked to one demo dataset.</DemoNotice>}
          {!usingDemo && feedError && <ErrorState title="Operations feed unavailable" description="Live admin data could not be loaded. Switch to Demo mode in Settings for the presentation dataset." />}

          <section>
            <SectionHeading title="Network snapshot" description={`Recent window · ${stats.windowSize} request records`} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <MetricCard icon="route" label="Active" value={String(stats.active)} helper="Requests in progress" tone="brand" />
              <MetricCard icon="inbox" label="Waiting" value={String(stats.byStatus.requested ?? 0)} helper="Need dispatch attention" tone="warning" />
              <MetricCard icon="check" label="Completed" value={String(stats.completed)} helper="Closed successfully" tone="success" />
              <MetricCard icon="users" label="Mechanics" value={String(stats.mechanicsApproved ?? '—')} helper={`${stats.mechanicsPending ?? 0} pending review`} tone="success" />
              <MetricCard icon="person" label="Users" value={String(stats.totalUsers ?? '—')} helper="Recent roster window" tone="neutral" />
              <MetricCard icon="shield" label="Readiness" value={`${readiness}%`} helper="Approved mechanics" tone={readiness >= 70 ? 'success' : 'warning'} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <SectionHeading title="Dispatch pulse" description="Request distribution across the lifecycle." action={<Link to="/admin/dispatch" className="text-xs font-medium text-safety-400 hover:text-safety-300">Open dispatch →</Link>} />
              <div className="grid gap-3">{STATUS_ORDER.map((status) => { const count = stats.byStatus[status] ?? 0; const width = stats.windowSize ? Math.max(count ? 4 : 0, Math.round((count / stats.windowSize) * 100)) : 0; return <div key={status} className="grid grid-cols-[92px_1fr_28px] items-center gap-3 text-xs"><span className="capitalize text-steel-400">{status.replace('-', ' ')}</span><div className="h-2 overflow-hidden rounded-full bg-graphite-soft"><div className={`h-full rounded-full ${status === 'cancelled' ? 'bg-danger' : status === 'completed' ? 'bg-success' : 'bg-safety-500'}`} style={{ width: `${width}%` }} /></div><span className="text-right font-mono text-cream">{count}</span></div>; })}</div>
              <p className="mt-4 text-xs text-steel-500">Bars show the relative share of the bounded request window, not all-time network volume.</p>
            </Card>
            <Card>
              <SectionHeading title="Approval queue" description="Mechanics that may need an operations decision." action={<Link to="/admin/approvals" className="text-xs font-medium text-safety-400 hover:text-safety-300">Review all →</Link>} />
              {pendingMechanics.length === 0 ? <EmptyState title="No pending applications" description="The mechanic approval queue is clear." /> : <ul className="divide-y divide-line-soft">{pendingMechanics.slice(0, 4).map((mechanic) => <li key={mechanic.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{mechanic.name}</p><p className="mt-1 text-xs text-steel-500">{mechanic.garageName ?? 'Workshop profile'} · {mechanic.specialties?.slice(0, 2).join(' · ') || 'Specialties not set'}</p></div><Badge tone="warning">{mechanic.verificationStatus?.replace('_', ' ') ?? 'Review'}</Badge></li>)}</ul>}
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <SectionHeading title="Live request watchlist" description="The latest active work needing visibility." action={<Link to="/admin/requests" className="text-xs font-medium text-safety-400 hover:text-safety-300">View requests →</Link>} />
              {activeRequests.length === 0 ? <EmptyState title="No active requests" description="New customer requests will appear here when dispatch receives them." /> : <ul className="divide-y divide-line-soft">{activeRequests.map((request) => <li key={request.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{request.problemText}</p><p className="mt-1 text-xs text-steel-500">{request.problemCategory ?? 'Roadside assistance'} · {request.mechanicName ?? 'Unassigned'} · #{request.id.slice(-6).toUpperCase()}</p></div><Link to={`/admin/requests/${request.id}`}><Badge tone={statusTone(request.status)}>{request.status.replace('-', ' ')}</Badge></Link></li>)}</ul>}
            </Card>
            <Card>
              <SectionHeading title="Operations shortcuts" description="Move directly to the next task." />
              <div className="grid gap-2"><Link to="/admin/approvals" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-3 text-sm text-cream hover:border-safety-500/40">Review mechanic approvals <span className="float-right text-safety-400">→</span></Link><Link to="/admin/users" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-3 text-sm text-cream hover:border-safety-500/40">Manage user accounts <span className="float-right text-safety-400">→</span></Link><Link to="/admin/reports" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-3 text-sm text-cream hover:border-safety-500/40">Export operational report <span className="float-right text-safety-400">→</span></Link><Link to="/admin/logs" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-3 text-sm text-cream hover:border-safety-500/40">Open trusted audit logs <span className="float-right text-safety-400">→</span></Link></div>
            </Card>
          </section>
        </div>}
      </div>
    </RequireAdmin>
  );
}
