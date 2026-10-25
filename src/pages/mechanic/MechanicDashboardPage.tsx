import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { RequireMechanic, useMechanicAccess } from '@/components/RequireMechanic';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SectionHeading } from '@/components/ui';
import { setAvailability, summarizeEarnings, watchIncoming, watchMyActiveJobs, watchMyJobHistory, type ServiceRequest } from '@/lib/mechanic';
import { DEMO_MECHANIC_PROFILE, getDemoMechanicActive, getDemoMechanicHistory, getDemoMechanicIncoming } from '@/lib/fixtures';

const STATUS_STEPS = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'on-the-way', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'service', label: 'Service' },
  { status: 'completed', label: 'Complete' },
] as const;

function statusTone(status: ServiceRequest['status']): 'neutral' | 'success' | 'warning' | 'danger' | 'brand' {
  if (status === 'completed') return 'success';
  if (status === 'requested') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'brand';
}

function ActiveJobCard({ job, preview = false }: { job: ServiceRequest; preview?: boolean }) {
  const activeIndex = Math.max(0, STATUS_STEPS.findIndex((step) => step.status === job.status));
  return (
    <Card className="border-safety-500/20 bg-gradient-to-br from-safety-500/10 via-graphite-card to-graphite-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-safety-400">Active job · #{job.id.slice(-6).toUpperCase()}</p>
          <h2 className="mt-2 text-xl font-bold text-cream">{job.problemText}</h2>
          <p className="mt-1 text-sm text-steel-300">{job.problemCategory ?? 'Roadside assistance'} · {job.customerLat.toFixed(3)}, {job.customerLng.toFixed(3)}</p>
        </div>
        <Badge tone={statusTone(job.status)}>{job.status.replace('-', ' ')}</Badge>
      </div>
      <div className="mt-6 grid grid-cols-5 gap-1">
        {STATUS_STEPS.map((step, index) => <div key={step.status}><div className={`h-1.5 rounded-full ${index <= activeIndex ? 'bg-safety-500' : 'bg-graphite-soft'}`} /><p className={`mt-2 text-[10px] ${index <= activeIndex ? 'text-cream' : 'text-steel-500'}`}>{step.label}</p></div>)}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-black/10 px-4 py-3">
        <div><p className="text-sm font-semibold text-cream">{job.etaMin != null ? `${job.etaMin} min to customer` : 'Continue the job from the next step'}</p><p className="mt-0.5 text-xs text-steel-400">Only the assigned mechanic can update this request.</p></div>
        <Link to={`/m/job/${job.id}`}><Button size="sm">{preview ? 'Open demo job' : 'Open job'}</Button></Link>
      </div>
    </Card>
  );
}

export function MechanicDashboardPage() {
  const { demoMode, user } = useAuth();
  const { record } = useMechanicAccess();
  const uid = user?.uid ?? '';
  const [active, setActive] = useState<ServiceRequest[] | null>(null);
  const [incoming, setIncoming] = useState<ServiceRequest[] | null>(null);
  const [done, setDone] = useState<ServiceRequest[] | null>(null);
  const [toggling, setToggling] = useState(false);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setActive(getDemoMechanicActive());
      setIncoming(getDemoMechanicIncoming());
      setDone(getDemoMechanicHistory());
      setFeedError(false);
      return;
    }
    setFeedError(false);
    const onFeedError = () => setFeedError(true);
    const a = watchMyActiveJobs(uid, setActive, onFeedError);
    const b = watchIncoming((jobs) => setIncoming(jobs.filter((j) => !(j.declinedBy ?? []).includes(uid))), uid, onFeedError);
    const c = watchMyJobHistory(uid, setDone, 5, onFeedError);
    return () => { if (a) a(); if (b) b(); if (c) c(); };
  }, [uid, demoMode]);

  const displayRecord = demoMode ? DEMO_MECHANIC_PROFILE : record;
  const available = displayRecord?.isAvailable ?? false;
  const usingDemo = demoMode;
  const displayActive = usingDemo ? getDemoMechanicActive() : (active ?? []);
  const displayIncoming = usingDemo ? getDemoMechanicIncoming() : (incoming ?? []);
  const displayDone = usingDemo ? getDemoMechanicHistory() : (done ?? []);
  const earnings = summarizeEarnings(displayDone);
  const approval = displayRecord?.verificationStatus?.replace('_', ' ') ?? 'profile pending';

  async function toggle() {
    if (!uid || toggling || demoMode) return;
    setToggling(true);
    await setAvailability(uid, !available);
    setToggling(false);
  }

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-6xl">
        <PageHeader title={`Salaam, ${displayRecord?.name?.split(' ')[0] ?? 'Mechanic'}`} description="Your workshop command centre — stay available, respond to offers, and keep every job moving." />
        <div className="grid gap-6">
          <Card className="border-line-strong bg-gradient-to-r from-graphite-card to-graphite-soft/40">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-steel-500">Workshop status</p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={available ? 'success' : 'neutral'}>{available ? 'Available · receiving offers' : 'Offline · no new offers'}</Badge><Badge tone={displayRecord?.approved ? 'success' : 'warning'}>{approval}</Badge>{displayRecord?.rating != null && <span className="text-sm text-steel-300">★ {displayRecord.rating.toFixed(1)}{displayRecord.reviewCount != null ? ` · ${displayRecord.reviewCount} reviews` : ''}</span>}</div>
                <p className="mt-2 text-xs text-steel-400">Availability controls new offers. It does not perform matching itself.</p>
              </div>
              <Button size="sm" variant={available ? 'secondary' : 'primary'} disabled={toggling || !displayRecord?.approved || demoMode} onClick={toggle}>{demoMode ? 'Demo availability' : toggling ? 'Saving…' : available ? 'Go offline' : 'Go online'}</Button>
            </div>
            {!displayRecord?.approved && <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">Your workshop must be approved before you can receive operational offers.</p>}
          </Card>

          {active === null && !feedError ? <LoadingState label="Loading workshop dashboard…" /> : !usingDemo && feedError ? <ErrorState title="Workshop dashboard unavailable" description="The live jobs feed failed. Switch to Demo mode in Settings for a safe presentation dataset." /> : <>
            {usingDemo && <DemoNotice>Live jobs are not available in this preview account. These cards show the professional workflow; accept, decline and status actions remain connected to live records only.</DemoNotice>}
            <section>
              <SectionHeading title="Today at a glance" description="Operational numbers from your current account or the labelled preview." />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon="inbox" label="Incoming offers" value={String(displayIncoming.length)} helper="Review before they expire" tone={displayIncoming.length ? 'warning' : 'neutral'} />
                <MetricCard icon="route" label="Active jobs" value={String(displayActive.length)} helper={displayActive.length ? 'Keep the customer updated' : 'No assigned job right now'} tone={displayActive.length ? 'brand' : 'neutral'} />
                <MetricCard icon="check" label="Completed jobs" value={String(earnings.jobs)} helper="Completed records in this feed" tone="success" />
                <MetricCard icon="dollar" label="Recorded earnings" value={`₹${(earnings.totalCents / 100).toFixed(0)}`} helper="Derived from completed amounts" tone="neutral" />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="grid gap-4">
                {displayActive.length > 0 ? displayActive.map((job) => <ActiveJobCard key={job.id} job={job} preview={usingDemo} />) : <Card><EmptyState title="No active job" description="Accepted work appears here with status controls and customer-safe location details." /></Card>}
                <Card>
                  <SectionHeading title="Incoming queue" description="Offers waiting for your decision." action={<Link to="/m/requests" className="text-xs font-medium text-safety-400 hover:text-safety-300">Open queue →</Link>} />
                  {displayIncoming.length === 0 ? <EmptyState title="Queue is clear" description="New eligible offers will appear here when you are online." /> : <ul className="divide-y divide-line-soft">{displayIncoming.slice(0, 3).map((job) => <li key={job.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{job.problemText}</p><p className="mt-1 text-xs text-steel-500">{job.problemCategory ?? 'Roadside assistance'} · #{job.id.slice(-6).toUpperCase()}</p></div><Badge tone="warning">Review</Badge></li>)}</ul>}
                </Card>
              </div>
              <div className="grid content-start gap-4">
                <Card>
                  <SectionHeading title="Workshop profile" description="What customers and operations can see." />
                  <div className="grid gap-3 text-sm"><div className="flex justify-between gap-3"><span className="text-steel-400">Garage</span><span className="text-right font-medium text-cream">{displayRecord?.garageName ?? 'Complete profile'}</span></div><div className="flex justify-between gap-3"><span className="text-steel-400">Coverage</span><span className="text-right font-medium text-cream">{displayRecord?.serviceRadiusKm ? `${displayRecord.serviceRadiusKm} km radius` : 'Not set'}</span></div><div className="flex justify-between gap-3"><span className="text-steel-400">Specialties</span><span className="text-right font-medium text-cream">{displayRecord?.specialties?.slice(0, 2).join(' · ') || 'Add specialties'}</span></div></div>
                  <Link to="/m/profile" className="mt-4 inline-block text-sm font-medium text-safety-400 hover:text-safety-300">Manage workshop profile →</Link>
                </Card>
                <Card>
                  <SectionHeading title="Recent completion" action={<Link to="/m/history" className="text-xs font-medium text-safety-400 hover:text-safety-300">View history →</Link>} />
                  {displayDone[0] ? <div><p className="font-semibold text-cream">{displayDone[0].problemText}</p><p className="mt-1 text-xs text-steel-400">{displayDone[0].durationMin ? `${displayDone[0].durationMin} min` : 'Duration recorded'}{displayDone[0].amountCents != null ? ` · ₹${(displayDone[0].amountCents / 100).toFixed(0)}` : ''}{displayDone[0].rating != null ? ` · ★ ${displayDone[0].rating.toFixed(1)}` : ''}</p></div> : <EmptyState title="No completed jobs yet" description="Your first completed service will appear here." />}
                </Card>
                <Card><SectionHeading title="Shortcuts" /><div className="grid gap-2"><Link to="/m/requests" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-2 text-sm text-cream hover:border-safety-500/40">Review incoming requests →</Link><Link to="/m/notifications" className="rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-2 text-sm text-cream hover:border-safety-500/40">Open notifications →</Link></div></Card>
              </div>
            </section>
          </>}
        </div>
      </div>
    </RequireMechanic>
  );
}
