import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { Card, DemoNotice, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { useAuth } from '@/app/AuthProvider';
import {
  demand,
  downloadCsv,
  earnings,
  earningsByDay,
  estimatePaymentSummary,
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
import { listAllRequestsOnce, mechanicStates, watchAllMechanics, watchAllOffers, type AdminMechanic, type AdminOfferRow, type AdminRequest } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS, getDemoAdminOffers, getDemoAdminRequests } from '@/lib/fixtures';

function fmtPct(v: number | null): string {
  return v == null ? 'Insufficient data' : `${(v * 100).toFixed(1)}%`;
}

function fmtMoney(cents: number | null): string {
  return cents == null ? 'Insufficient data' : `₹${(cents / 100).toFixed(0)}`;
}

/** Long honest placeholders ("Insufficient data") must fit a narrow metric
 *  card on mobile: numbers stay large, word values step down a size. */
function metricValueClass(value: string): string {
  return value.length > 9 ? 'text-lg sm:text-xl' : 'text-2xl';
}

function Metric({ label, value, sub, nested = false }: { label: string; value: string; sub?: string; nested?: boolean }) {
  if (nested) {
    // Nested groups live inside a Card already: a second raised card reads as
    // clutter, so inner metrics use a flat well instead.
    return (
      <div className="rounded-xl border border-line-soft/60 bg-graphite-soft/25 px-4 py-3.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">{label}</p>
        <p className={`mt-1 break-words font-extrabold leading-tight text-cream ${metricValueClass(value)}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-steel-400">{sub}</p>}
      </div>
    );
  }
  return (
    <Card>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">{label}</p>
      <p className={`mt-1 break-words font-extrabold leading-tight text-cream ${metricValueClass(value)}`}>{value}</p>
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
  const [mechanics, setMechanics] = useState<AdminMechanic[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFeedError(false);
    if (demoMode) {
      setRequests(getDemoAdminRequests());
      setOffers(getDemoAdminOffers());
      setMechanics(DEMO_ADMIN_MECHANICS);
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
    const unsubMechanics = watchAllMechanics((m) => {
      if (!cancelled) setMechanics(m);
    }, 200, () => {
      if (!cancelled) setFeedError(true);
    });
    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (unsubMechanics) unsubMechanics();
    };
  }, [demoMode]);

  const timeWindow: Window = useMemo(() => {
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
    return all.filter((x) => windowId === 'all' || inWindow(x.createdAtMs, timeWindow));
  }, [requests, timeWindow, windowId]);

  const offerRows: OfferRow[] | null = useMemo(() => {
    if (!offers) return null;
    return offers.map((o) => ({ requestId: o.requestId, mechanicId: o.mechanicId, status: o.status as OfferRow['status'], round: o.round }));
  }, [offers]);

  const sc = rows ? statusCounts(rows) : null;
  const earn = rows ? earnings(rows) : null;
  const dem = rows ? demand(rows) : null;
  const ostate = offerRows ? offerStats(offerRows) : null;
  const epay = rows ? estimatePaymentSummary(rows) : null;
  const states = useMemo(() => mechanicStates(mechanics ?? []), [mechanics]);
  const dayRows = useMemo(
    () => Object.entries(dem?.byDay ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-14) as [string, number][],
    [dem],
  );
  const dayPeak = dayRows.reduce((m, [, n]) => Math.max(m, n), 1);

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
              className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${windowId === w ? 'border-safety-500/50 bg-safety-500/15 font-semibold text-safety-300' : 'border-line-soft text-steel-300 hover:border-line-strong hover:bg-graphite-soft/60 hover:text-cream'}`}
            >
              {w === 'today' ? 'Today' : w === 'd7' ? '7 days' : w === 'd30' ? '30 days' : 'All loaded'}
            </button>
          ))}
          <span className="ml-1 font-mono text-[11px] text-steel-500">{timeWindow.label} · max 200 requests, 200 offers</span>
        </div>

        {feedError && !demoMode ? (
          <ErrorState title="Analytics unavailable" description="The analytics snapshots could not be loaded. Figures are unknown, not zero. Check your connection and retry." />
        ) : !rows || !offerRows || !mechanics ? (
          <LoadingState label="Computing analytics…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No requests in this window" description="Widen the window or wait for traffic. Nothing is estimated." />
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="requests" value={String(sc?.total ?? 0)} sub={timeWindow.label} />
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

            {/* Repair estimate and offline payment analytics */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="repair estimates" value={String(epay?.totalEstimates ?? 0)} sub="submitted this window" />
              <Metric
                label="estimates approved"
                value={fmtPct(epay?.totalEstimates ? epay.estimatesByStatus.approved / epay.totalEstimates : null)}
                sub="approved / submitted"
              />
              <Metric label="cash payments" value={String(epay?.cashPayments ?? 0)} sub="offline, recorded" />
              <Metric label="upi payments" value={String(epay?.upiPayments ?? 0)} sub="offline, recorded" />
            </div>

            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Estimate decisions</p>
              <p className="mt-1 text-sm text-steel-400">Counts by decision state — an estimate a mechanic has not submitted is not counted.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Metric nested label="approved estimates" value={String(epay?.estimatesByStatus.approved ?? 0)} sub="customer-approved" />
                <Metric nested label="rejected estimates" value={String(epay?.estimatesByStatus.rejected ?? 0)} sub="awaiting mechanic revision" />
                <Metric nested label="pending estimates" value={String(epay?.estimatesByStatus.pending ?? 0)} sub="awaiting the customer" />
              </div>
            </Card>

            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Estimate and payment totals</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-4">
                <Metric
                  nested
                  label="total estimated amount"
                  value={fmtMoney(epay?.totalEstimatedAmountCents ?? null)}
                  sub="across all submitted estimates"
                />
                <Metric
                  nested
                  label="approved estimate amount"
                  value={fmtMoney(epay?.totalApprovedEstimateAmountCents ?? null)}
                  sub="customer-approved only"
                />
                <Metric nested label="pending payments" value={String(epay?.pendingPayments ?? 0)} sub="completed, no payment recorded" />
                <Metric nested label="paid payments" value={String(epay?.paidPayments ?? 0)} sub="recorded, not verified" />
              </div>
              <p className="mt-3 text-xs text-steel-400">
                Offline cash/UPI payments are recorded by an authorized actor — RoadAssist does not independently verify the transaction.
              </p>
            </Card>

            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Request distribution by status</p>
              <p className="mt-1 text-sm text-steel-400">Share of the selected {timeWindow.label.toLowerCase()} window.</p>
              <div className="mt-5 grid gap-4">
                {Object.entries(sc?.byStatus ?? {}).map(([status, count]) => {
                  const share = sc?.total ? Math.round((count / sc.total) * 100) : 0;
                  return <div key={status}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium capitalize text-cream">{status.replace('-', ' ')}</span>
                      <span className="font-mono tabular-nums text-steel-300">{count} <span className="text-steel-500">({share}%)</span></span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-graphite-soft" role="progressbar" aria-label={`${status} requests`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}>
                      <div className={`h-full rounded-full ${status === 'completed' ? 'bg-success' : status === 'cancelled' ? 'bg-danger' : status === 'requested' ? 'bg-warning' : 'bg-safety-500'}`} style={{ width: `${share}%` }} />
                    </div>
                  </div>;
                })}
              </div>
              <Table
                head={['Status', 'Count']}
                rows={Object.entries(sc?.byStatus ?? {}).map(([s, n]) => [s, n])}
                empty="No rows."
              />
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Demand by service category</p>
                <div className="mt-4 grid gap-3">
                  {Object.entries(dem?.byCategory ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([category, count]) => {
                    const peak = Math.max(1, ...Object.values(dem?.byCategory ?? {}));
                    const share = Math.round((count / peak) * 100);
                    return <div key={category}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="capitalize text-cream">{category}</span><span className="font-mono tabular-nums text-steel-300">{count} requests</span></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-graphite-soft"><div className="h-full rounded-full bg-gradient-to-r from-safety-600 to-safety-400" style={{ width: `${share}%` }} /></div>
                    </div>;
                  })}
                </div>
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
                {dayRows.length > 0 && (
                  <div
                    className="mt-5 flex h-48 items-end gap-2 border-b border-line-soft pb-px"
                    role="img"
                    aria-label={`Requests per UTC day, last ${dayRows.length} days, peak ${dayPeak} requests in a day. The table below lists the same values.`}
                  >
                    {dayRows.map(([d, n]) => (
                      <div key={d} className="group flex h-full flex-1 items-end justify-center" title={`${d}: ${n} request${n === 1 ? '' : 's'}`}>
                        <div
                          className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-safety-600 to-safety-400 opacity-85 transition-opacity group-hover:opacity-100"
                          style={{ height: `${Math.max(6, Math.round((n / dayPeak) * 150))}px` }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <Table
                  head={['Day', 'Requests']}
                  rows={dayRows.map(([d, n]) => [d, n])}
                  empty="No dated rows in window."
                />
              </Card>
            </div>

            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Mechanic network (bounded roster · max 200)</p>
              <Table
                head={['State', 'Count']}
                rows={([
                  ['pending review', states.pending],
                  ['under review', states.underReview],
                  ['approved · available now', states.approvedAvailable],
                  ['approved · offline', states.approvedUnavailable],
                  ['suspended', states.suspended],
                  ['rejected', states.rejected],
                ] as [string, number][]).filter(([, n]) => n > 0)}
                empty="No mechanics in the roster window."
              />
              <p className="mt-2 text-xs text-steel-400">
                Availability is each mechanic's own live toggle; approval is operations-controlled. Zero rows are hidden — an absent row means no mechanics hold that state in this roster window.
              </p>
            </Card>

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
