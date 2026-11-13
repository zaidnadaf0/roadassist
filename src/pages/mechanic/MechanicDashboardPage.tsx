import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Icon } from '@/components/Icon';
import { RequireMechanic, useMechanicAccess } from '@/components/RequireMechanic';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SectionHeading } from '@/components/ui';
import { setAvailability, summarizeEarnings, watchIncoming, watchMyActiveJobs, watchMyJobHistory, type ServiceRequest } from '@/lib/mechanic';
import { DEMO_MECHANIC_PROFILE, getDemoMechanicActive, getDemoMechanicHistory, getDemoMechanicIncoming, getDemoOfferHistory } from '@/lib/fixtures';
import { requestRef } from '@/lib/reference';

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
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-safety-400">Active job · {requestRef(job.id)}</p>
          <h2 className="mt-2 text-xl font-bold text-cream">{job.problemText}</h2>
          <p className="mt-1 text-sm text-steel-300">{job.problemCategory ?? 'Roadside assistance'} · {typeof job.customerLat === 'number' ? job.customerLat.toFixed(3) : '—'}, {typeof job.customerLng === 'number' ? job.customerLng.toFixed(3) : '—'}</p>
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
  const { record } = useMechanicAccess(demoMode);
  const uid = user?.uid ?? '';
  const [active, setActive] = useState<ServiceRequest[] | null>(null);
  const [incoming, setIncoming] = useState<ServiceRequest[] | null>(null);
  const [done, setDone] = useState<ServiceRequest[] | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleNotice, setToggleNotice] = useState<string | null>(null);
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
  const displayOffers = usingDemo ? getDemoOfferHistory() : [];
  const earnings = summarizeEarnings(displayDone);
  const approval = displayRecord?.verificationStatus?.replace('_', ' ') ?? 'profile pending';
  const completedByCategory = displayDone.reduce<Record<string, number>>((counts, job) => {
    const category = job.problemCategory || 'other';
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
  const categoryPeak = Math.max(1, ...Object.values(completedByCategory));
  const durationJobs = displayDone.filter((job) => job.durationMin != null);
  const averageDuration = durationJobs.length ? Math.round(durationJobs.reduce((total, job) => total + (job.durationMin ?? 0), 0) / durationJobs.length) : 0;
  const demoOfferCounts = {
    accepted: displayOffers.filter((offer) => offer.status === 'accepted').length,
    declined: displayOffers.filter((offer) => offer.status === 'declined').length,
    pending: displayOffers.filter((offer) => offer.status === 'pending').length,
  };
  const terminalOfferCount = demoOfferCounts.accepted + demoOfferCounts.declined;
  const acceptanceRate = terminalOfferCount ? Math.round((demoOfferCounts.accepted / terminalOfferCount) * 100) : 0;

  async function toggle() {
    if (!uid || toggling || demoMode) return;
    setToggling(true);
    const ok = await setAvailability(uid, !available);
    setToggling(false);
    // The snapshot owns the toggle state; a failed write must say so.
    setToggleNotice(ok ? null : 'Could not change availability. Your online status is unchanged — check your connection and try again.');
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
            {toggleNotice && <p role="alert" className="mt-2 text-xs text-danger">{toggleNotice}</p>}
            {!displayRecord?.approved && <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">Your workshop must be approved before you can receive operational offers.</p>}
          </Card>

          {active === null && !feedError ? <LoadingState label="Loading workshop dashboard…" /> : !usingDemo && feedError ? <ErrorState title="Workshop dashboard unavailable" description="The live jobs feed failed. Switch to Demo mode in Settings for a safe presentation dataset." /> : <>
            {usingDemo && <DemoNotice>DEMO MODE — All profile, request, offer, history and earnings records below are fictional. Demo actions update this browser only and never write to Firebase.</DemoNotice>}
            <section>
              <SectionHeading title="Today at a glance" description="Operational numbers from your current account or the labelled preview." />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon="inbox" label="Incoming offers" value={String(displayIncoming.length)} helper="Review before they expire" tone={displayIncoming.length ? 'warning' : 'neutral'} />
                <MetricCard icon="route" label="Active jobs" value={String(displayActive.length)} helper={displayActive.length ? 'Keep the customer updated' : 'No assigned job right now'} tone={displayActive.length ? 'brand' : 'neutral'} />
                <MetricCard icon="check" label="Completed jobs" value={String(earnings.jobs)} helper="Completed records in this feed" tone="success" />
                <MetricCard icon="dollar" label="Recorded earnings" value={`₹${(earnings.totalCents / 100).toFixed(0)}`} helper="Derived from completed amounts" tone="neutral" />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
              <Card>
                <SectionHeading title="Workshop workload" description="Queue and job counts from the feeds currently loaded for this account." />
                <div className="mt-5 grid gap-5">
                  {[
                    { label: 'Incoming offers', value: displayIncoming.length, icon: 'inbox' as const, color: 'bg-warning' },
                    { label: 'Active jobs', value: displayActive.length, icon: 'route' as const, color: 'bg-safety-500' },
                    { label: 'Recent completed jobs', value: displayDone.length, icon: 'check' as const, color: 'bg-success' },
                  ].map((item) => {
                    const peak = Math.max(1, displayIncoming.length, displayActive.length, displayDone.length);
                    const share = item.value === 0 ? 0 : Math.max(6, Math.round((item.value / peak) * 100));
                    return <div key={item.label}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2.5 text-sm font-medium text-cream"><Icon name={item.icon} size={21} className="text-safety-400" />{item.label}</span>
                        <span className="font-mono text-lg font-bold tabular-nums text-cream">{item.value}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-graphite-soft" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={peak} aria-valuenow={item.value}>
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${share}%` }} />
                      </div>
                    </div>;
                  })}
                </div>
                <p className="mt-4 text-sm text-steel-400">Completed jobs reflect the recent history feed loaded below; they are not an all-time total.</p>
              </Card>
              <Card>
                <SectionHeading title="Workshop readiness" description="Your current operating profile." />
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-line-soft bg-graphite-soft/40 p-4">
                    <p className="text-sm text-steel-400">Service area</p>
                    <p className="mt-1 text-xl font-bold text-cream">{displayRecord?.serviceRadiusKm ? `${displayRecord.serviceRadiusKm} km radius` : 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl border border-line-soft bg-graphite-soft/40 p-4">
                    <p className="text-sm text-steel-400">Specialties</p>
                    <p className="mt-1 text-base font-semibold capitalize text-cream">{displayRecord?.specialties?.join(' · ') || 'Complete your workshop profile'}</p>
                  </div>
                  <Link to="/m/profile" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-safety-500/30 bg-safety-500/10 px-4 text-sm font-semibold text-safety-300 hover:border-safety-400/60">
                    <Icon name="settings" size={20} /> Manage workshop profile
                  </Link>
                </div>
              </Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <SectionHeading title="Service mix" description="Completed work grouped by roadside service type." />
                {Object.keys(completedByCategory).length === 0 ? <EmptyState title="No completed work to chart" description="Completed services will appear here when recorded." /> : (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {Object.entries(completedByCategory).sort((a, b) => b[1] - a[1]).map(([category, count]) => (
                      <div key={category}>
                        <div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-medium capitalize text-cream">{category.replace('-', ' ')}</span><span className="font-mono text-sm text-steel-300">{count} jobs</span></div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-graphite-soft"><div className="h-full rounded-full bg-safety-500" style={{ width: `${Math.max(8, Math.round((count / categoryPeak) * 100))}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
                {usingDemo && <p className="mt-4 text-xs text-steel-500">Illustrative distribution from {displayDone.length} sample completed jobs.</p>}
              </Card>
              <Card>
                <SectionHeading title="Performance snapshot" description={usingDemo ? 'Calculated from this isolated sample dataset.' : 'Calculated from loaded records.'} />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line-soft bg-graphite-soft/40 p-3"><p className="text-xs text-steel-400">Workshop rating</p><p className="mt-1 text-2xl font-bold text-cream">{displayRecord?.rating?.toFixed(1) ?? '—'} <span className="text-warning">★</span></p><p className="mt-1 text-xs text-steel-500">{displayRecord?.reviewCount ?? 0} reviews</p></div>
                  <div className="rounded-xl border border-line-soft bg-graphite-soft/40 p-3"><p className="text-xs text-steel-400">Avg. job duration</p><p className="mt-1 text-2xl font-bold text-cream">{averageDuration || '—'}<span className="ml-1 text-sm font-medium text-steel-400">min</span></p><p className="mt-1 text-xs text-steel-500">where recorded</p></div>
                  <div className="rounded-xl border border-line-soft bg-graphite-soft/40 p-3"><p className="text-xs text-steel-400">Avg. job value</p><p className="mt-1 text-2xl font-bold text-cream">₹{earnings.jobs ? Math.round(earnings.totalCents / earnings.jobs / 100) : 0}</p><p className="mt-1 text-xs text-steel-500">completed work sample</p></div>
                  <div className="rounded-xl border border-line-soft bg-graphite-soft/40 p-3"><p className="text-xs text-steel-400">Offer acceptance</p><p className="mt-1 text-2xl font-bold text-cream">{usingDemo ? `${acceptanceRate}%` : '—'}</p><p className="mt-1 text-xs text-steel-500">{usingDemo ? `${demoOfferCounts.accepted} accepted · ${demoOfferCounts.declined} declined` : 'Demo-only statistic'}</p></div>
                </div>
                {usingDemo && <p className="mt-4 text-xs text-steel-500">Sample offer queue: {demoOfferCounts.pending} pending responses. Figures are illustrative, not live performance.</p>}
              </Card>
            </section>

            <section>
              <SectionHeading title="Mechanic tools" description="Quick access to the main parts of your workshop workflow." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { to: '/m/requests', title: 'Request queue', detail: 'Review and respond to incoming offers.', icon: 'inbox' as const },
                  { to: '/m/job', title: 'Active work', detail: 'Update progress on an assigned job.', icon: 'route' as const },
                  { to: '/m/earnings', title: 'Earnings & performance', detail: 'Review recorded job amounts and offer outcomes.', icon: 'chart' as const },
                  { to: '/m/notifications', title: 'Notifications', detail: 'Check service and workshop updates.', icon: 'bell' as const },
                ].map((tool) => <Link key={tool.to} to={tool.to} className="group rounded-2xl border border-line-soft bg-graphite-card p-5 shadow-clay-sm transition hover:-translate-y-0.5 hover:border-safety-500/50">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-safety-500/25 bg-safety-500/10 text-safety-400"><Icon name={tool.icon} size={24} /></span>
                  <span className="mt-4 block text-lg font-semibold text-cream">{tool.title}</span>
                  <span className="mt-1 block text-sm text-steel-400">{tool.detail}</span>
                  <span className="mt-4 block text-sm font-semibold text-safety-400">Open section →</span>
                </Link>)}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="grid gap-4">
                {displayActive.length > 0 ? displayActive.map((job) => <ActiveJobCard key={job.id} job={job} preview={usingDemo} />) : <Card><EmptyState title="No active job" description="Accepted work appears here with status controls and customer-safe location details." /></Card>}
                <Card>
                  <SectionHeading title="Incoming queue" description="Offers waiting for your decision." action={<Link to="/m/requests" className="text-xs font-medium text-safety-400 hover:text-safety-300">Open queue →</Link>} />
                  {displayIncoming.length === 0 ? <EmptyState title="Queue is clear" description="New eligible offers will appear here when you are online." /> : <ul className="divide-y divide-line-soft">{displayIncoming.slice(0, 3).map((job) => <li key={job.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{job.problemText}</p><p className="mt-1 text-xs text-steel-500">{job.problemCategory ?? 'Roadside assistance'} · {requestRef(job.id)}</p></div><Badge tone="warning">Review</Badge></li>)}</ul>}
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
