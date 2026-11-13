import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequireAdmin } from '@/components/RequireAdmin';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SectionHeading } from '@/components/ui';
import { useAuth } from '@/app/AuthProvider';
import { computeStats, findExceptions, listAllRequestsOnce, watchAllMechanics, watchAllUsers, type AdminMechanic, type AdminRequest, type AdminUser } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS, DEMO_ADMIN_REVIEWS, DEMO_ADMIN_USERS, DEMO_AUDIT_EVENTS, getDemoAdminRequests } from '@/lib/fixtures';
import { requestRef } from '@/lib/reference';

const STATUS_ORDER = ['requested', 'accepted', 'on-the-way', 'arrived', 'service', 'completed', 'cancelled'] as const;

function timestampMs(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

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
  const [retry, setRetry] = useState(0);
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
  }, [demoMode, retry]);

  const feedsLoaded = requests !== null && users !== null && mechanics !== null;
  const usingDemo = demoMode;
  const displayRequests = usingDemo ? getDemoAdminRequests() : (requests ?? []);
  const displayUsers = usingDemo ? DEMO_ADMIN_USERS : (users ?? []);
  const displayMechanics = usingDemo ? DEMO_ADMIN_MECHANICS : (mechanics ?? []);
  const stats = feedsLoaded ? computeStats(displayRequests, displayUsers, displayMechanics) : null;
  const customerCount = displayUsers.filter((u) => u.role === 'customer').length;
  const ratedRequests = displayRequests.filter((r) => r.status === 'completed' && typeof r.rating === 'number');
  const avgRating = ratedRequests.length ? ratedRequests.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedRequests.length : null;
  const responseTimes = displayRequests.map((r) => r.demoResponseMinutes).filter((n): n is number => typeof n === 'number');
  const avgResponse = usingDemo && responseTimes.length ? responseTimes.reduce((sum, n) => sum + n, 0) / responseTimes.length : null;
  const trend = useMemo(() => {
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const dayMs = 24 * 60 * 60 * 1000;
    const dayBins = Array.from({ length: 7 }, (_, i) => ({ start: todayUtc - (6 - i) * dayMs, count: 0 }));
    const weekBins = Array.from({ length: 4 }, (_, i) => ({ start: todayUtc - (27 - i * 7) * dayMs, end: todayUtc - (21 - i * 7) * dayMs, count: 0 }));
    for (const request of displayRequests) {
      const at = timestampMs(request.createdAt);
      if (at == null) continue;
      const day = Math.floor(at / dayMs) * dayMs;
      const daily = dayBins.find((bin) => bin.start === day);
      if (daily) daily.count++;
      const weekly = weekBins.find((bin) => day >= bin.start && day <= bin.end);
      if (weekly) weekly.count++;
    }
    return { dayBins, weekBins };
  }, [displayRequests]);
  const trendCards: { title: string; bins: { start: number; count: number }[]; label: (x: { start: number; count: number }) => string }[] = [
    { title: 'Requests per day · last 7 UTC days', bins: trend.dayBins, label: (x) => new Date(x.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) },
    { title: 'Requests per week · last 4 UTC weeks', bins: trend.weekBins, label: (x) => new Date(x.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) },
  ];
  const pendingMechanics = displayMechanics.filter((m) => m.verificationStatus === 'pending' || m.verificationStatus === 'under_review');
  const activeRequests = displayRequests.filter((r) => !['completed', 'cancelled'].includes(r.status)).slice(0, 4);
  const readiness = useMemo(() => {
    if (!stats) return 0;
    const total = stats.mechanicsTotal ?? 0;
    return total === 0 ? 0 : Math.round(((stats.mechanicsApproved ?? 0) / total) * 100);
  }, [stats]);
  // Ticking clock for exception detection — pure render (no Date.now() inline).
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const exceptions = useMemo(
    () => findExceptions(displayRequests, displayMechanics, nowMs),
    [displayRequests, displayMechanics, nowMs],
  );

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Operations command centre" description="Monitor demand, dispatch health and mechanic readiness from one place. Counts are limited to the recent data window shown." />
        {!stats ? <LoadingState label="Loading operations dashboard…" /> : <div className="grid gap-6">
          {usingDemo && <DemoNotice>Fictional users, mechanics, requests and audit examples are linked to one demo dataset.</DemoNotice>}
          {!usingDemo && feedError ? (
            <ErrorState
              title="Operations feed unavailable"
              description="One or more live admin feeds failed to load. The counts below are NOT reliable zeros — they are unknown. Retry the feeds, or switch to Demo mode in Settings for the presentation dataset."
              action={<Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
            />
          ) : <>

          <section>
            <SectionHeading title="Network snapshot" description={`Recent window · ${stats.windowSize} request records · counts are bounded, not all-time`} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <MetricCard icon="route" label="Total requests" value={String(stats.windowSize)} helper="Records in the bounded window" tone="neutral" />
              <MetricCard icon="inbox" label="Waiting" value={String(stats.byStatus.requested ?? 0)} helper="Need dispatch attention" tone="warning" />
              <MetricCard icon="route" label="Active" value={String(stats.active)} helper="Requests in progress" tone="brand" />
              <MetricCard icon="check" label="Completed" value={String(stats.completed)} helper="Closed successfully" tone="success" />
              <MetricCard icon="x" label="Cancelled" value={String(stats.cancelled)} helper="Customer or network cancelled" tone="neutral" />
              <MetricCard icon="users" label="Registered mechanics" value={String(stats.mechanicsTotal ?? '—')} helper={`${stats.mechanicsApproved ?? 0} approved · ${stats.mechanicsPending ?? 0} awaiting review · max 200 loaded`} tone="success" />
              <MetricCard icon="person" label="Customer accounts" value={String(usingDemo ? customerCount : (users ?? []).filter((u) => u.role === 'customer').length)} helper="Customer profiles in the loaded roster" tone="neutral" />
              <MetricCard icon="route" label="Average response" value={avgResponse == null ? 'Not tracked' : `${avgResponse.toFixed(1)} min`} helper={usingDemo ? `${responseTimes.length} sample requests with response times` : 'Live schema has no first-response timestamp'} tone="brand" />
              <MetricCard icon="star" label="Average rating" value={avgRating == null ? 'No ratings' : `${avgRating.toFixed(1)} / 5`} helper={`${ratedRequests.length} rated completed requests`} tone="success" />
              <MetricCard icon="shield" label="Readiness" value={`${readiness}%`} helper="Approved share of roster" tone={readiness >= 70 ? 'success' : 'warning'} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {trendCards.map(({ title, bins, label }) => {
              const peak = Math.max(1, ...bins.map((x) => x.count));
              return <Card key={title}>
                <SectionHeading title={title} description={usingDemo ? 'Illustrative request volume from the demo dataset.' : 'Calculated from the loaded live request snapshot (max 200 records).'} />
                <div className="flex h-52 items-end gap-3" role="img" aria-label={`${title}: ${bins.map((x) => `${label(x)} ${x.count}`).join(', ')}`}>
                  {bins.map((x) => <div key={x.start} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                    <span className="mb-2 text-sm font-semibold tabular-nums text-cream">{x.count}</span>
                    <div className="mx-auto w-full max-w-12 rounded-t-lg bg-gradient-to-t from-safety-600 to-safety-400 shadow-glow" style={{ height: `${Math.max(x.count ? 12 : 3, Math.round((x.count / peak) * 144))}px` }} />
                    <span className="mt-2 truncate text-xs text-steel-400">{label(x)}</span>
                  </div>)}
                </div>
              </Card>;
            })}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeading title={usingDemo ? 'Demo activity' : 'Recent request updates'} description={usingDemo ? 'Illustrative operations events; these are not genuine security audit records.' : 'Recent request state from the live request feed.'} action={<Link to={usingDemo ? '/admin/logs' : '/admin/requests'} className="text-xs font-medium text-safety-400 hover:text-safety-300">View details →</Link>} />
              {usingDemo ? <ul className="divide-y divide-line-soft">{DEMO_AUDIT_EVENTS.slice(0, 4).map((event) => <li key={event.id} className="py-2 first:pt-0"><p className="text-sm font-medium text-cream">{event.action.replaceAll('.', ' ')}</p><p className="mt-1 text-xs text-steel-400">{event.targetType} · {event.targetId} · {timestampMs(event.createdAt) == null ? 'Sample event' : new Date(timestampMs(event.createdAt) as number).toLocaleString()}</p></li>)}</ul> : <ul className="divide-y divide-line-soft">{[...displayRequests].sort((a, b) => (timestampMs(b.updatedAt) ?? 0) - (timestampMs(a.updatedAt) ?? 0)).slice(0, 4).map((request) => <li key={request.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-cream">{request.problemText}</p><p className="mt-1 text-xs text-steel-400">Updated {timestampMs(request.updatedAt) == null ? 'time unavailable' : new Date(timestampMs(request.updatedAt) as number).toLocaleString()}</p></div><Badge tone={statusTone(request.status)}>{request.status.replace('-', ' ')}</Badge></li>)}</ul>}
            </Card>
            <Card>
              <SectionHeading title="Recent customer reviews" description={usingDemo ? 'Sample feedback attached to completed sample requests.' : 'The live schema stores ratings, but not review text or review dates.'} />
              {usingDemo ? <ul className="divide-y divide-line-soft">{DEMO_ADMIN_REVIEWS.map((review) => <li key={review.id} className="py-2 first:pt-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-cream">{review.customerName} · {review.rating}/5</p><span className="text-xs text-steel-500">{new Date(review.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-sm text-steel-300">{review.comment}</p><Link to={`/admin/requests/${review.requestId}`} className="mt-1 inline-block text-xs text-safety-400 hover:text-safety-300">Completed request {review.requestId} →</Link></li>)}</ul> : <p className="text-sm text-steel-300">{ratedRequests.length ? `${ratedRequests.length} rated request${ratedRequests.length === 1 ? '' : 's'} · average ${avgRating?.toFixed(1)} / 5. Review text is not stored in the live data model.` : 'No customer ratings in the loaded request window.'}</p>}
            </Card>
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
              {activeRequests.length === 0 ? <EmptyState title="No active requests" description="New customer requests will appear here when dispatch receives them." /> : <ul className="divide-y divide-line-soft">{activeRequests.map((request) => <li key={request.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{request.problemText}</p><p className="mt-1 text-xs text-steel-500">{request.problemCategory ?? 'Roadside assistance'} · {request.mechanicName ?? 'Unassigned'} · {requestRef(request.id)}</p></div><Link to={`/admin/requests/${request.id}`}><Badge tone={statusTone(request.status)}>{request.status.replace('-', ' ')}</Badge></Link></li>)}</ul>}
            </Card>
            <Card>
              <SectionHeading title="Operations shortcuts" description="Move directly to the next task." />
              <div className="grid gap-2"><Link to="/admin/analytics" className="rounded-xl border border-safety-500/30 bg-safety-500/10 px-4 py-3 text-sm font-semibold text-safety-300 hover:border-safety-500/60">Explore network analytics <span className="float-right">→</span></Link><Link to="/admin/dispatch" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-3 text-sm text-cream hover:border-safety-500/40">Open dispatch view <span className="float-right text-safety-400">→</span></Link><Link to="/admin/approvals" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-3 text-sm text-cream hover:border-safety-500/40">Review mechanic approvals <span className="float-right text-safety-400">→</span></Link><Link to="/admin/users" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-3 text-sm text-cream hover:border-safety-500/40">Manage user accounts <span className="float-right text-safety-400">→</span></Link><Link to="/admin/reports" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-3 text-sm text-cream hover:border-safety-500/40">Export operational report <span className="float-right text-safety-400">→</span></Link><Link to="/admin/logs" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-3 text-sm text-cream hover:border-safety-500/40">Open trusted audit logs <span className="float-right text-safety-400">→</span></Link></div>
            </Card>
          </section>

          <section>
            <SectionHeading title="Needs attention" description="Derived from the bounded window — capped lists, most urgent first." />
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Open past offer window</p>
                {exceptions.staleOpen.length === 0 ? (
                  <p className="mt-2 text-sm text-steel-300">Every open request still holds a live offer window, or the window has none.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line-soft">
                    {exceptions.staleOpen.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                        <Link to={`/admin/requests/${r.id}`} className="min-w-0 truncate text-sm text-cream hover:text-safety-300">{r.problemText}</Link>
                        <Badge tone="warning">open</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Active longer than 24h</p>
                {exceptions.longActive.length === 0 ? (
                  <p className="mt-2 text-sm text-steel-300">No assignment has overstayed the lifecycle.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line-soft">
                    {exceptions.longActive.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                        <Link to={`/admin/requests/${r.id}`} className="min-w-0 truncate text-sm text-cream hover:text-safety-300">{requestRef(r.id)} · {r.mechanicName ?? 'assigned'}</Link>
                        <Badge tone="danger">{r.status.replace('-', ' ')}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Blocked mechanics</p>
                {exceptions.blockedMechanics.length === 0 ? (
                  <p className="mt-2 text-sm text-steel-300">No suspended or rejected workshops in the roster window.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line-soft">
                    {exceptions.blockedMechanics.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                        <Link to="/admin/mechanics" className="min-w-0 truncate text-sm text-cream hover:text-safety-300">{m.name}</Link>
                        <Badge tone="danger">{m.verificationStatus}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </section>
          </>}
        </div>}
      </div>
    </RequireAdmin>
  );
}
