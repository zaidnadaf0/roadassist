import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { Card, DemoNotice, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { useAuth } from '@/app/AuthProvider';
import {
  demand,
  downloadCsv,
  earnings,
  earningsByDay,
  inWindow,
  normalizeRequests,
  offerStats,
  statusCounts,
  toCsv,
  windowStartDaysAgo,
  type OfferRow,
  type RequestRow,
  type Window,
} from '@/lib/analytics';
import { listAllRequestsOnce, watchAllOffers, type AdminOfferRow, type AdminRequest } from '@/lib/admin';
import { getDemoAdminOffers, getDemoAdminRequests } from '@/lib/fixtures';

function fmtPct(v: number | null): string {
  return v == null ? 'Insufficient data' : `${(v * 100).toFixed(1)}%`;
}

function fmtMoney(cents: number | null): string {
  return cents == null ? 'Insufficient data' : `₹${(cents / 100).toFixed(0)}`;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-cream">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-steel-400">{sub}</p>}
    </Card>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-steel-300">{empty}</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-steel-500">
            {head.map((h) => (
              <th key={h} className="border-b border-line-soft px-2 py-1.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line-soft/50">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 text-steel-300 first:text-cream">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminAnalyticsPage() {
  const { demoMode } = useAuth();
  const [windowId, setWindowId] = useState<'today' | 'd7' | 'd30' | 'all'>('d30');
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [offers, setOffers] = useState<AdminOfferRow[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFeedError(false);
    if (demoMode) {
      setRequests(getDemoAdminRequests());
      setOffers(getDemoAdminOffers());
      return () => { cancelled = true; };
    }
    listAllRequestsOnce('all', 200)
      .then((r) => {
        if (!cancelled) setRequests(r);
      })
      .catch(() => {
        if (!cancelled) {
          setRequests([]);
          setFeedError(true);
        }
      });
    const unsub = watchAllOffers((o) => {
      if (!cancelled) setOffers(o);
    }, 200, () => setFeedError(true));
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [demoMode]);

  const window: Window = useMemo(() => {
    const days = windowId === 'all' ? null : windowId === 'today' ? 1 : windowId === 'd7' ? 7 : 30;
    return {
      fromMs: windowStartDaysAgo(days),
      toMs: null,
      label: windowId === 'all' ? 'All loaded (UTC)' : `Last ${days} day${days === 1 ? '' : 's'} (UTC)`,
    };
  }, [windowId]);

  const rows: RequestRow[] | null = useMemo(() => {
    if (!requests) return null;
    const { rows: all } = normalizeRequests(
      requests.map((r) => {
        const raw = r as unknown as {
          id: string;
          status?: unknown;
          problemCategory?: unknown;
          createdAt?: unknown;
          amountCents?: unknown;
          durationMin?: unknown;
          mechanicId?: unknown;
        };
        return { ...raw };
      }),
    );
    return all.filter((x) => windowId === 'all' || inWindow(x.createdAtMs, window));
  }, [requests, window, windowId]);

  const offerRows: OfferRow[] | null = useMemo(() => {
    if (!offers) return null;
    return offers.map((o) => ({ requestId: o.requestId, mechanicId: o.mechanicId, status: o.status as OfferRow['status'], round: o.round }));
  }, [offers]);

  const sc = rows ? statusCounts(rows) : null;
  const earn = rows ? earnings(rows) : null;
  const dem = rows ? demand(rows) : null;
  const ostate = offerRows ? offerStats(offerRows) : null;

  // Assignment/duration averages need per-transition timestamps the schema
  // does not store — honestly unavailable (see note below).
  const withDuration = (rows ?? []).filter((r) => r.status === 'completed' && r.durationMin != null);
  const avgDuration = withDuration.length > 0
    ? withDuration.reduce((a, r) => a + (r.durationMin as number), 0) / withDuration.length
    : null;

  function exportRequests() {
    if (!rows) return;
    downloadCsv(
      `roadassist-requests-${windowId}.csv`,
      toCsv(
        ['id', 'status', 'category', 'mechanic', 'created_utc'],
        rows.map((r) => [
          r.id,
          r.status,
          r.problemCategory ?? '',
          r.mechanicId ?? '',
          r.createdAtMs != null ? new Date(r.createdAtMs).toISOString() : '',
        ]),
      ),
    );
  }

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Analytics" description="Authoritative request, dispatch, and earnings aggregates. Bounded recent windows, UTC throughout." />
        {demoMode && <DemoNotice>Analytics are calculated from the same fictional requests and offers used by the admin dashboard.</DemoNotice>}
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Time window">
          {(['today', 'd7', 'd30', 'all'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowId(w)}
              aria-pressed={windowId === w}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs ${windowId === w ? 'bg-safety-500/15 font-semibold text-safety-300' : 'text-steel-300 hover:text-cream'}`}
            >
              {w === 'today' ? 'Today' : w === 'd7' ? '7 days' : w === 'd30' ? '30 days' : 'All loaded'}
            </button>
          ))}
          <span className="ml-1 font-mono text-[11px] text-steel-500">{window.label} · max 200 requests, 200 offers</span>
        </div>

        {feedError && !demoMode ? (
          <ErrorState title="Analytics unavailable" description="The analytics snapshots could not be loaded. Check your connection and try again." />
        ) : !rows || !offerRows ? (
          <LoadingState label="Computing analytics…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No requests in this window" description="Widen the window or wait for traffic. Nothing is estimated." />
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="requests" value={String(sc?.total ?? 0)} sub={window.label} />
              <Metric label="completion rate" value={fmtPct(sc?.completionRate ?? null)} sub="completed / total" />
              <Metric label="cancellation rate" value={fmtPct(sc?.cancellationRate ?? null)} sub="cancelled / total" />
              <Metric label="offer accept rate" value={fmtPct(ostate?.acceptRate ?? null)} sub="accepted / terminal offers" />
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="gross earnings" value={fmtMoney(earn?.totalCents ?? null)} sub={earn ? `${earn.completedWithAmount}/${earn.completedJobs} completed with amounts` : undefined} />
              <Metric label="avg per completed job" value={fmtMoney(earn?.avgCents ?? null)} sub="amount-carrying jobs only" />
              <Metric label="offer decline rate" value={fmtPct(ostate?.declineRate ?? null)} sub="declined / terminal offers" />
              <Metric label="offer expiry rate" value={fmtPct(ostate?.expireRate ?? null)} sub="expired / terminal offers" />
            </div>

            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Status mix</p>
              <Table
                head={['Status', 'Count']}
                rows={Object.entries(sc?.byStatus ?? {}).map(([s, n]) => [s, n])}
                empty="No rows."
              />
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Demand by category</p>
                <Table
                  head={['Category', 'Requests', 'Completed', 'Cancelled']}
                  rows={Object.entries(dem?.completedVsCancelledByCategory ?? {}).map(([c, v]) => [
                    c,
                    (dem?.byCategory[c] ?? 0),
                    v.completed,
                    v.cancelled,
                  ])}
                  empty="No demand in window."
                />
              </Card>
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Requests by day (UTC)</p>
                <Table
                  head={['Day', 'Requests']}
                  rows={Object.entries(dem?.byDay ?? {})
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .slice(-14)
                    .map(([d, n]) => [d, n])}
                  empty="No dated rows in window."
                />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Dispatch offers</p>
                <Table
                  head={['State', 'Count']}
                  rows={Object.entries(ostate?.byStatus ?? {}).map(([s, n]) => [s, n])}
                  empty="No offers observed."
                />
                <p className="mt-2 text-xs text-steel-400">
                  Rematch share: {ostate?.rematchShare == null ? 'Insufficient data' : `${(ostate.rematchShare * 100).toFixed(1)}%`} ·
                  Avg round: {ostate?.avgRound == null ? 'Insufficient data' : ostate.avgRound.toFixed(2)}
                </p>
              </Card>
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Earnings by day (UTC)</p>
                <Table
                  head={['Day', 'Total', 'Jobs']}
                  rows={Object.entries(earningsByDay(rows))
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .slice(-14)
                    .map(([d, v]) => [d, `₹${(v.totalCents / 100).toFixed(0)}`, v.jobs])}
                  empty="No amount-carrying completions in window."
                />
                <p className="mt-2 text-xs text-steel-400">
                  Application-level service earnings, not financial settlement — no payout system exists in this phase.
                  {' '}Service-duration average: {avgDuration == null ? 'insufficient data (no durationMin recorded).' : `${avgDuration.toFixed(0)} min on site.`}
                </p>
              </Card>
            </div>

            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Exports</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={exportRequests} className="rounded-lg border border-line-soft px-3.5 py-2 text-sm font-medium hover:border-line-strong">
                  Export requests CSV
                </button>
              </div>
              <p className="mt-2 text-xs text-steel-400">
                Assignment-time and per-stage duration averages: insufficient data — the schema stores no acceptedAt/transition timestamps, so they are shown as such rather than estimated.
              </p>
            </Card>
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
