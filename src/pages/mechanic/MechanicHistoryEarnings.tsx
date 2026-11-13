import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { RequireMechanic } from '@/components/RequireMechanic';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { summarizeEarnings, watchMyActiveJobs, watchMyJobHistory, type ServiceRequest } from '@/lib/mechanic';
import { estimatePaymentSummary, mechanicPerf, type RequestRow } from '@/lib/analytics';
import { watchMyOfferHistory, type OfferView } from '@/lib/dispatch';
import { getDemoMechanicHistory, getDemoOfferHistory } from '@/lib/fixtures';
import { formatInr, formatUtc, requestRef } from '@/lib/reference';

/** Compact financial metric. Numbers stay large; labels stay quiet. */
function StatTile({
  label,
  value,
  helper,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  helper: string;
  icon: IconName;
  tone?: 'neutral' | 'brand' | 'success';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">{label}</p>
          <p className="mt-1 break-words text-2xl font-bold tabular-nums leading-tight text-cream">{value}</p>
        </div>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
            tone === 'brand'
              ? 'border-safety-500/30 bg-safety-500/10 text-safety-300'
              : tone === 'success'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-line-soft bg-graphite-soft text-steel-300'
          }`}
        >
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-steel-500">{helper}</p>
    </Card>
  );
}

/**
 * One completed job, shared by Job history and Recent payouts.
 *
 * Money columns are right-aligned and tabular so amounts line up; the payment
 * state is always spelled out ("Cash recorded" / "not recorded") because a
 * recorded offline payment is not a verified transaction.
 */
function CompletedJobRow({ job }: { job: ServiceRequest }) {
  const requested = formatUtc(job.createdAt, { dateStyle: 'short' });
  const paymentLabel =
    job.paymentStatus === 'paid'
      ? job.paymentMethod === 'upi'
        ? 'UPI recorded'
        : job.paymentMethod === 'cash'
          ? 'Cash recorded'
          : 'Payment recorded'
      : 'Payment not recorded';

  return (
    <li className="border-t border-line-soft/60 first:border-t-0">
      <Link
        to={`/m/job/${job.id}`}
        className="grid gap-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-graphite-soft/40 sm:grid-cols-[minmax(0,1fr)_7rem_5.5rem] sm:items-center sm:gap-3"
      >
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium text-cream" title={job.problemText}>{job.problemText}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-steel-500">
            <span className="font-mono" title={job.id}>{requestRef(job.id)}</span>
            <span aria-hidden>·</span>
            <span className="capitalize">{(job.problemCategory ?? 'roadside assistance').replace(/-/g, ' ')}</span>
            <span aria-hidden>·</span>
            <span>{requested ? `${requested} UTC` : 'Time unavailable'}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="success">completed</Badge>
            {job.rating != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-safety-500/25 bg-safety-500/10 px-2 py-0.5 text-[11px] font-medium text-safety-300">
                <Icon name="star" size={11} />
                {job.rating}/5
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                job.paymentStatus === 'paid'
                  ? 'border-line-soft bg-graphite-soft text-steel-300'
                  : 'border-line-soft/60 bg-transparent text-steel-500'
              }`}
            >
              <Icon name="wallet" size={11} />
              {paymentLabel}
            </span>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
          <span className="text-[10px] uppercase tracking-wider text-steel-500 sm:hidden">Amount</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-cream">
            {job.amountCents != null ? formatInr(job.amountCents) : '—'}
          </span>
        </div>
        <div className="hidden text-right text-[11px] text-steel-500 sm:block">
          {job.durationMin != null ? `${job.durationMin} min on site` : '—'}
        </div>
      </Link>
    </li>
  );
}

const LIST_HEADER = 'hidden sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_5.5rem] sm:gap-3 sm:px-2 sm:pb-1 text-[10px] uppercase tracking-wider text-steel-500';

export function MechanicHistoryPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [jobs, setJobs] = useState<ServiceRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setJobs(getDemoMechanicHistory());
      setFeedError(false);
      return;
    }
    setFeedError(false);
    const unsub = watchMyJobHistory(uid, setJobs, 30, () => setFeedError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode, retry]);

  const summary = jobs ? summarizeEarnings(jobs) : null;

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Job history" description="Your completed jobs, newest first (most recent 30). Only your records." />
        {demoMode && <DemoNotice>Sample job history comes from the same fictional workflow shown on your dashboard.</DemoNotice>}

        {jobs === null && !feedError ? (
          <LoadingState label="Loading history…" />
        ) : feedError ? (
          <ErrorState
            title="History unavailable"
            description="Your completed jobs could not be loaded. Nothing is missing or lost — the feed failed. Check your connection and retry."
            action={<Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
          />
        ) : (jobs ?? []).length === 0 ? (
          <EmptyState title="No completed jobs yet" description="Finished work lands here with its receipt line and recorded payment state." />
        ) : (
          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-cream">Completed jobs</p>
                <p className="mt-0.5 text-[11px] text-steel-500">
                  {(jobs ?? []).length} record{(jobs ?? []).length === 1 ? '' : 's'} · {summary ? formatInr(summary.totalCents) : '—'} recorded total
                </p>
              </div>
              <Link to="/m/earnings" className="inline-flex items-center gap-1 text-xs font-semibold text-safety-300 hover:text-safety-200">
                Earnings
                <Icon name="arrowRight" size={13} />
              </Link>
            </div>
            <div className="px-2 py-1">
              <div className={LIST_HEADER}>
                <span>Job</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Duration</span>
              </div>
              <ul>{(jobs ?? []).map((j) => <CompletedJobRow key={j.id} job={j} />)}</ul>
            </div>
          </Card>
        )}
      </div>
    </RequireMechanic>
  );
}

export function MechanicEarningsPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [jobs, setJobs] = useState<ServiceRequest[] | null>(null);
  const [active, setActive] = useState<ServiceRequest[] | null>(null);
  const [offers, setOffers] = useState<OfferView[] | null>(null);
  const [jobsError, setJobsError] = useState(false);
  const [offersError, setOffersError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setJobs(getDemoMechanicHistory());
      setJobsError(false);
      return;
    }
    setJobsError(false);
    const unsub = watchMyJobHistory(uid, setJobs, 100, () => setJobsError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode, retry]);

  // Active (unfinished) assignments carry the estimates a mechanic has
  // submitted but not yet completed. History alone would undercount them.
  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setActive([]);
      return;
    }
    const unsub = watchMyActiveJobs(uid, setActive, () => setActive([]));
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode, retry]);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setOffers(getDemoOfferHistory());
      setOffersError(false);
      return;
    }
    setOffersError(false);
    const unsub = watchMyOfferHistory(uid, setOffers, 50, () => setOffersError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode, retry]);

  const feedFailed = jobsError || offersError;
  const summary = summarizeEarnings(jobs ?? []);
  // Estimate and payment summary covers BOTH completed history and active
  // assignments (a submitted estimate lives on a live job until it completes).
  // Dedupe by id so a job transitioning mid-render can never be counted twice.
  const epay = useMemo(() => {
    const byId = new Map<string, RequestRow>();
    for (const j of [...(jobs ?? []), ...(active ?? [])]) {
      if (byId.has(j.id)) continue;
      byId.set(j.id, {
        id: j.id,
        status: j.status,
        createdAtMs: null,
        estimatedAmountCents: j.estimatedAmountCents ?? null,
        estimateStatus: j.estimateStatus ?? null,
        paymentMethod: j.paymentMethod ?? null,
        paymentStatus: j.paymentStatus ?? null,
      });
    }
    return estimatePaymentSummary([...byId.values()]);
  }, [jobs, active]);

  const perf = useMemo(() => {
    if (!jobs || !offers) return null;
    return mechanicPerf(
      jobs.map((j) => ({
        id: j.id,
        status: j.status,
        problemCategory: j.problemCategory,
        createdAtMs: null,
        amountCents: j.amountCents ?? null,
      })),
      offers.map((o) => ({ requestId: o.requestId, mechanicId: uid, status: o.status, round: o.round ?? null })),
    );
  }, [jobs, offers, uid]);

  const avgJob = summary.jobs > 0 ? Math.round(summary.totalCents / summary.jobs) : null;
  const categoryPeak = perf ? Math.max(1, ...Object.values(perf.byCategory)) : 1;

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Earnings"
          description="Recorded from your completed jobs (most recent 100 jobs, 50 offers). Read-only — RoadAssist does not settle payouts."
        />
        {demoMode && <DemoNotice>Amounts are illustrative sample earnings, not payouts or financial settlement.</DemoNotice>}

        {feedFailed ? (
          <ErrorState
            title="Earnings feed unavailable"
            description="Your job or offer feed failed to load. Figures are NOT zeros — they are simply unknown right now. Check your connection and retry."
            action={<Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
          />
        ) : jobs === null || offers === null ? (
          <LoadingState label="Loading earnings…" />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Total earned" value={formatInr(summary.totalCents)} helper="Completed-job amounts on record" icon="wallet" tone="success" />
              <StatTile label="Jobs completed" value={String(summary.jobs)} helper="Last 100 completed records" icon="check-circle" />
              <StatTile label="Average job" value={avgJob == null ? '—' : formatInr(avgJob)} helper="Mean of recorded amounts" icon="chart-bar" />
              <StatTile
                label="Offer acceptance"
                value={perf?.acceptanceRate == null ? '—' : `${(perf.acceptanceRate * 100).toFixed(0)}%`}
                helper="Accepted / terminal offers"
                icon="inbox"
                tone="brand"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
              <Card className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-cream">Recent payouts</p>
                    <p className="mt-0.5 text-[11px] text-steel-500">Recorded amount per completed job — not a settled payout.</p>
                  </div>
                  <Link to="/m/history" className="inline-flex items-center gap-1 text-xs font-semibold text-safety-300 hover:text-safety-200">
                    All jobs
                    <Icon name="arrowRight" size={13} />
                  </Link>
                </div>
                {jobs.length === 0 ? (
                  <div className="px-4 py-6">
                    <p className="text-sm text-steel-300">No completed jobs yet.</p>
                    <p className="mt-1 text-[11px] text-steel-500">Completed work appears here with its recorded amount and payment state.</p>
                  </div>
                ) : (
                  <div className="px-2 py-1">
                    <div className={LIST_HEADER}>
                      <span>Job</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Duration</span>
                    </div>
                    <ul>{jobs.slice(0, 6).map((j) => <CompletedJobRow key={j.id} job={j} />)}</ul>
                  </div>
                )}
              </Card>

              <div className="grid gap-4">
                <Card>
                  <p className="text-sm font-semibold text-cream">Estimates and payments</p>
                  <dl className="mt-2 divide-y divide-line-soft/70 border-t border-line-soft/70">
                    <div className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs text-steel-400">Estimates submitted</dt>
                      <dd className="text-sm font-semibold tabular-nums text-cream">{epay.totalEstimates}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs text-steel-400">Approved / pending / rejected</dt>
                      <dd className="text-right text-xs tabular-nums text-steel-300">
                        {epay.estimatesByStatus.approved} · {epay.estimatesByStatus.pending} · {epay.estimatesByStatus.rejected}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs text-steel-400">Cash recorded</dt>
                      <dd className="text-sm font-semibold tabular-nums text-cream">{epay.cashPayments}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs text-steel-400">UPI recorded</dt>
                      <dd className="text-sm font-semibold tabular-nums text-cream">{epay.upiPayments}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs text-steel-400">Awaiting a record</dt>
                      <dd className="text-sm font-semibold tabular-nums text-cream">{epay.pendingPayments}</dd>
                    </div>
                  </dl>
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
                    <Icon name="info" size={13} className="mt-0.5 shrink-0 text-steel-400" />
                    <p className="text-[11px] leading-4 text-steel-400">
                      Recorded cash/UPI entries are reported by an authorized actor and are not independently verified transactions.
                    </p>
                  </div>
                </Card>

                {perf && Object.keys(perf.byCategory).length > 0 && (
                  <Card>
                    <p className="text-sm font-semibold text-cream">Completed by category</p>
                    <ul className="mt-2.5 grid gap-2">
                      {Object.entries(perf.byCategory)
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, count]) => (
                          <li key={category} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs capitalize text-steel-300">{category.replace(/-/g, ' ')}</p>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-graphite-soft">
                                <div className="h-full rounded-full bg-safety-500/80" style={{ width: `${Math.round((count / categoryPeak) * 100)}%` }} />
                              </div>
                            </div>
                            <span className="text-right font-mono text-xs tabular-nums text-cream">{count}</span>
                          </li>
                        ))}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireMechanic>
  );
}
