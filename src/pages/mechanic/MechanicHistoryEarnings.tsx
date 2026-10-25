import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { RequireMechanic } from '@/components/RequireMechanic';
import { Badge, Card, DemoNotice, EmptyState, LoadingState, PageHeader } from '@/components/ui';
import { summarizeEarnings, watchMyJobHistory, type ServiceRequest } from '@/lib/mechanic';
import { mechanicPerf } from '@/lib/analytics';
import { watchMyOfferHistory, type OfferView } from '@/lib/dispatch';
import { getDemoMechanicHistory, getDemoOfferHistory } from '@/lib/fixtures';

export function MechanicHistoryPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [jobs, setJobs] = useState<ServiceRequest[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setJobs(getDemoMechanicHistory());
      return;
    }
    const unsub = watchMyJobHistory(uid, setJobs, 30);
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode]);

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Job history" description="Your completed jobs. Only your records, newest first." />
        {demoMode && <DemoNotice>Sample job history is derived from the same fictional mechanic workflow shown on the dashboard.</DemoNotice>}
        {jobs === null ? (
          <LoadingState label="Loading history…" />
        ) : jobs.length === 0 ? (
          <EmptyState title="No completed jobs yet" description="Finished work lands here with its receipt line." />
        ) : (
          <ul className="grid gap-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link to={`/m/job/${j.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft px-4 py-3 hover:border-line-strong">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-cream">{j.problemText}</span>
                    <span className="font-mono text-xs text-steel-400">
                      #{j.id.slice(-6).toUpperCase()}
                      {j.amountCents != null ? ` · ₹${(j.amountCents / 100).toFixed(0)}` : ''}
                      {j.rating != null ? ` · ★${j.rating}` : ''}
                    </span>
                  </span>
                  <Badge tone="success">{j.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RequireMechanic>
  );
}

export function MechanicEarningsPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [jobs, setJobs] = useState<ServiceRequest[] | null>(null);
  const [offers, setOffers] = useState<OfferView[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setJobs(getDemoMechanicHistory());
      return;
    }
    const unsub = watchMyJobHistory(uid, setJobs, 100);
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode]);

  useEffect(() => {
    if (!uid || demoMode) {
      if (demoMode) setOffers(getDemoOfferHistory());
      return;
    }
    const unsub = watchMyOfferHistory(uid, setOffers, 50);
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode]);

  const summary = summarizeEarnings(jobs ?? []);
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

  function pct(v: number | null): string {
    return v == null ? 'Insufficient data' : `${(v * 100).toFixed(1)}%`;
  }

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Earnings" description="Derived strictly from completed-job amounts. Read-only — you cannot edit payouts." />
        {demoMode && <DemoNotice>Amounts are illustrative sample earnings, not payouts or financial settlement.</DemoNotice>}
        {jobs === null || offers === null ? (
          <LoadingState label="Loading earnings…" />
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Total earned</p>
                <p className="mt-1 text-3xl font-extrabold text-cream">₹{(summary.totalCents / 100).toFixed(0)}</p>
              </Card>
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Jobs completed</p>
                <p className="mt-1 text-3xl font-extrabold text-cream">{summary.jobs}</p>
              </Card>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Offer acceptance</p>
                <p className="mt-1 text-xl font-bold text-cream">{pct(perf?.acceptanceRate ?? null)}</p>
                <p className="mt-0.5 text-xs text-steel-400">accepted / terminal offers (your last 50)</p>
              </Card>
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Job completion</p>
                <p className="mt-1 text-xl font-bold text-cream">{pct(perf?.completionRate ?? null)}</p>
                <p className="mt-0.5 text-xs text-steel-400">completed / assigned to you</p>
              </Card>
            </div>
            <Card>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Recent payouts</p>
              {jobs.length === 0 ? (
                <p className="mt-2 text-sm text-steel-300">No completed jobs yet.</p>
              ) : (
                <ul className="mt-2 grid gap-1.5">
                  {jobs.slice(0, 10).map((j) => (
                    <li key={j.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-steel-300">#{j.id.slice(-6).toUpperCase()} · {j.problemText.slice(0, 32)}</span>
                      <span className="font-mono text-cream">{j.amountCents != null ? `₹${(j.amountCents / 100).toFixed(0)}` : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {perf && Object.keys(perf.byCategory).length > 0 && (
              <Card>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Completed by category</p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {Object.entries(perf.byCategory).map(([c, n]) => (
                    <li key={c} className="flex justify-between">
                      <span className="text-steel-300">{c}</span>
                      <span className="font-mono text-cream">{n}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </RequireMechanic>
  );
}
