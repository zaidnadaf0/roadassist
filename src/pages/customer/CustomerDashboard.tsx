import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, SectionHeading } from '@/components/ui';
import { listVehicles, watchMyRequests, watchPublicMechanics, type PublicMechanic, type ServiceRequest, type Vehicle } from '@/lib/customer';
import { DEMO_CUSTOMER_PROFILE, DEMO_CUSTOMER_VEHICLES, FIXTURE_SERVICES, getDemoCustomerRequests } from '@/lib/fixtures';

const LIVE = ['requested', 'accepted', 'on-the-way', 'arrived', 'service'];
const STATUS_STEPS = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'on-the-way', label: 'On the way' },
  { status: 'arrived', label: 'Arrived' },
  { status: 'service', label: 'Service' },
  { status: 'completed', label: 'Complete' },
] as const;

function dateLabel(value: unknown): string {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? 'Recent activity' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusTone(status: ServiceRequest['status']): 'neutral' | 'success' | 'warning' | 'danger' | 'brand' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'requested') return 'warning';
  return 'brand';
}

export function CustomerDashboard() {
  const { demoMode, setDemoMode, user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [mechanics, setMechanics] = useState<PublicMechanic[]>([]);
  const [feedError, setFeedError] = useState(false);
  const [retry, setRetry] = useState(0);
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setRequests(getDemoCustomerRequests());
      setFeedError(false);
      return;
    }
    setFeedError(false);
    const unsub = watchMyRequests(uid, setRequests, () => {
      setRequests([]);
      setFeedError(true);
    });
    return () => { if (unsub) unsub(); };
  }, [uid, retry, demoMode]);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setVehicles(DEMO_CUSTOMER_VEHICLES.filter((item) => item.ownerId === 'demo-customer'));
      return;
    }
    let cancelled = false;
    setVehicles(null);
    listVehicles(uid).then((items) => {
      if (!cancelled) setVehicles(items);
    }).catch(() => {
      if (!cancelled) setVehicles([]);
    });
    return () => { cancelled = true; };
  }, [uid, retry, demoMode]);

  useEffect(() => {
    const unsub = watchPublicMechanics(setMechanics, () => setMechanics([]), 100);
    return () => { if (unsub) unsub(); };
  }, []);

  const usingDemo = demoMode;
  const displayRequests = usingDemo ? getDemoCustomerRequests() : (requests ?? []);
  const active = displayRequests.find((r) => LIVE.includes(r.status)) ?? null;
  const recent = displayRequests.filter((r) => !LIVE.includes(r.status)).slice(0, 4);
  const completed = displayRequests.filter((r) => r.status === 'completed');
  const availableMechanics = usingDemo ? 3 : mechanics.filter((m) => m.isAvailable && m.approved).length;
  const vehicleCount = usingDemo ? 2 : (vehicles?.length ?? 0);
  const amountSpent = completed.reduce((total, item) => total + (item.amountCents ?? 0), 0);
  const greetingName = demoMode ? DEMO_CUSTOMER_PROFILE.displayName : user?.displayName;
  const activeStep = active ? Math.max(0, STATUS_STEPS.findIndex((step) => step.status === active.status)) : -1;
  const vehicle = active && vehicles ? vehicles.find((item) => item.id === active.vehicleId) : null;

  const quickActions = useMemo(() => [
    { to: '/services', label: 'Request roadside help', detail: 'Start a new rescue', icon: 'wrench' },
    { to: '/track', label: 'Track active request', detail: active ? 'View current status' : 'No active request', icon: 'route' },
    { to: '/vehicles', label: 'Manage vehicles', detail: `${vehicleCount} registered`, icon: 'car' },
    { to: '/guide', label: 'Open mechanic guide', detail: 'Get safe first steps', icon: 'info' },
  ], [active, vehicleCount]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Namaste${greetingName ? `, ${greetingName.split(' ')[0]}` : ''}`} description="Your roadside command centre — request help, follow a rescue, and keep your vehicle history organized." />

      {requests === null ? (
        <LoadingState label="Loading your dashboard…" />
      ) : (
        <div className="grid gap-6">
          {usingDemo && (
            <DemoNotice>
              <span>Fictional customer profile, vehicles and requests are linked across this presentation.</span>
              <Button variant="secondary" size="sm" onClick={() => { setDemoMode(false); setRequests(null); setRetry((value) => value + 1); }}>Switch to live data</Button>
            </DemoNotice>
          )}
          {!usingDemo && feedError && <ErrorState title="Dashboard unavailable" description="Your live requests could not be loaded. Retry or switch to Demo mode in Settings." action={<Button variant="secondary" size="sm" onClick={() => { setRequests(null); setRetry((value) => value + 1); }}>Retry live data</Button>} />}

          <section>
            <SectionHeading title="At a glance" description="Your most important roadside information, updated from your account." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon="route" label="Current rescue" value={active ? active.status.replace('-', ' ') : 'None'} helper={active ? `${active.mechanicName ?? 'Matching a mechanic'} · #${active.id.slice(-6).toUpperCase()}` : 'You are ready to request help'} tone={active ? 'brand' : 'neutral'} />
              <MetricCard icon="users" label="Nearby mechanics" value={String(availableMechanics)} helper="Approved and currently available" tone="success" />
              <MetricCard icon="car" label="Your vehicles" value={String(vehicleCount)} helper={vehicleCount ? 'Ready for a roadside request' : 'Add a vehicle to get started'} tone={vehicleCount ? 'brand' : 'warning'} />
              <MetricCard icon="history" label="Completed services" value={String(completed.length)} helper={amountSpent ? `₹${(amountSpent / 100).toFixed(0)} recorded total` : 'Your completed services appear here'} tone="neutral" />
            </div>
          </section>

          <section>
            <SectionHeading title="What would you like to do?" description="Common actions are one tap away." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Link key={action.to} to={action.to} className="group rounded-2xl border border-line-soft bg-graphite-card p-4 shadow-card transition hover:-translate-y-0.5 hover:border-safety-500/50">
                  <div className="flex items-start justify-between gap-3">
                    <span className="clay-inset grid h-10 w-10 place-items-center rounded-2xl border border-safety-500/20 bg-safety-500/10 text-safety-300"><Icon name={action.icon as IconName} size={19} /></span>
                    <span className="text-lg text-steel-500 transition group-hover:translate-x-1 group-hover:text-safety-400">→</span>
                  </div>
                  <p className="mt-4 font-semibold text-cream">{action.label}</p>
                  <p className="mt-1 text-xs text-steel-400">{action.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="overflow-hidden border-safety-500/20 bg-gradient-to-br from-safety-500/10 via-graphite-card to-graphite-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-safety-400">{active ? 'Live rescue' : 'Roadside support'}</p>
                  <h2 className="mt-2 text-xl font-bold text-cream">{active ? active.problemText : 'Need help getting back on the road?'}</h2>
                  <p className="mt-1 text-sm text-steel-300">{active ? `${active.mechanicName ?? 'Your mechanic is being matched'}${vehicle ? ` · ${vehicle.year} ${vehicle.make} ${vehicle.model}` : ''}` : 'Choose a service and we will guide you through the next safe step.'}</p>
                </div>
                {active && <Badge tone={statusTone(active.status)}>{active.status.replace('-', ' ')}</Badge>}
              </div>
              {active ? (
                <>
                  <div className="mt-6 grid grid-cols-5 gap-1">
                    {STATUS_STEPS.map((step, index) => (
                      <div key={step.status}>
                        <div className={`h-1.5 rounded-full ${index <= activeStep ? 'bg-safety-500' : 'bg-graphite-soft'}`} />
                        <p className={`mt-2 text-[10px] ${index <= activeStep ? 'text-cream' : 'text-steel-500'}`}>{step.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-black/10 px-4 py-3">
                    <div><p className="text-sm font-semibold text-cream">{active.etaMin != null ? `${active.etaMin} min estimated arrival` : 'Status updates are live'}</p><p className="mt-0.5 text-xs text-steel-400">{active.mechanicLat != null ? 'Location signal received' : 'Waiting for the next mechanic update'}</p></div>
                    <Link to={usingDemo ? '/track' : `/track/${active.id}`}><Button size="sm">Open tracking</Button></Link>
                  </div>
                </>
              ) : (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-black/10 px-4 py-3"><p className="text-sm text-steel-300">Available mechanics: <span className="font-semibold text-cream">{availableMechanics}</span></p><Link to="/services"><Button size="sm">Request help</Button></Link></div>
              )}
            </Card>

            <Card>
              <SectionHeading title="Service readiness" description="A quick view of what is ready." />
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-xl bg-graphite-soft/60 px-3 py-3"><span className="text-sm text-steel-300">Vehicle profile</span><Badge tone={vehicleCount ? 'success' : 'warning'}>{vehicleCount ? 'Ready' : 'Add vehicle'}</Badge></div>
                <div className="flex items-center justify-between rounded-xl bg-graphite-soft/60 px-3 py-3"><span className="text-sm text-steel-300">Location access</span><Badge tone="neutral">On request</Badge></div>
                <div className="flex items-center justify-between rounded-xl bg-graphite-soft/60 px-3 py-3"><span className="text-sm text-steel-300">Mechanic network</span><Badge tone={availableMechanics ? 'success' : 'warning'}>{availableMechanics ? 'Online' : 'Limited'}</Badge></div>
              </div>
              <Link to="/profile" className="mt-4 inline-block text-sm font-medium text-safety-400 hover:text-safety-300">Complete your profile →</Link>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeading title="Recent activity" description="Your latest service records." action={<Link to="/history" className="text-xs font-medium text-safety-400 hover:text-safety-300">View history →</Link>} />
              {recent.length === 0 ? <EmptyState title="No past services yet" description="Completed rescues and receipts will appear here after your first service." /> : <ul className="divide-y divide-line-soft">{recent.map((request) => <li key={request.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{request.problemText}</p><p className="mt-1 text-xs text-steel-500">{dateLabel(request.updatedAt ?? request.createdAt)} · #{request.id.slice(-6).toUpperCase()}</p></div><Link to={`/history/${request.id}`}><Badge tone={statusTone(request.status)}>{request.status}</Badge></Link></li>)}</ul>}
            </Card>
            <Card>
              <SectionHeading title="Popular services" description="Catalogue guidance only; final charges come from the completed record." action={<Link to="/services" className="text-xs font-medium text-safety-400 hover:text-safety-300">See all →</Link>} />
              <div className="grid gap-2 sm:grid-cols-2">{FIXTURE_SERVICES.slice(0, 4).map((service) => <Link key={service.id} to={`/request?service=${service.id}`} className="rounded-xl border border-line-soft bg-graphite-soft/40 p-3 transition hover:border-safety-500/40"><p className="text-sm font-semibold text-cream">{service.name}</p><p className="mt-1 text-xs text-steel-400">From ₹{service.base} · {service.eta}</p></Link>)}</div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
