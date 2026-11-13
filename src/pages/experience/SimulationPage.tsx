import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { SIM_SCENARIO, nextActor, stageViews } from '@/lib/simulation/scenario';
import { autoStep, getSimSnapshot, journeySnapshot, simDispatch, simTick, useSimulation, type JourneySnapshot } from '@/lib/simulation/store';
import type { SimAction, SimRole, SimSession } from '@/lib/simulation/types';
import { formatInr } from '@/lib/reference';
import { ETA_DISCLAIMER, formatKm } from '@/lib/tracking';

/** Leaflet touches `window` at import, so the map is lazy like every other map. */
const MapView = lazy(() => import('@/components/map/MapView').then((m) => ({ default: m.MapView })));

function MapFallback() {
  return (
    <div className="map-grid grid h-[15rem] w-full place-items-center rounded-xl border border-line-soft" role="status">
      <p className="text-sm text-steel-300">Loading map…</p>
    </div>
  );
}

/**
 * Mode B — the presentation console.
 *
 * Renders ONE synchronised session through three role views. Every action goes
 * through the pure simulation reducer (localStorage-backed, cross-tab via the
 * native storage event). Nothing here imports Firebase, so no simulated action
 * can write to Firestore.
 */

const ROLE_TABS: { role: SimRole; label: string; icon: IconName }[] = [
  { role: 'customer', label: 'Customer', icon: 'car-front' },
  { role: 'mechanic', label: 'Mechanic', icon: 'wrench' },
  { role: 'admin', label: 'Admin', icon: 'chart-bar' },
];

function clock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return `${new Date(ms).toLocaleTimeString('en-IN', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' })} UTC`;
}

function statusLabel(session: SimSession): string {
  if (!session.request) return 'Not started';
  if (session.payment.state === 'recorded') return 'Completed · payment recorded';
  switch (session.status) {
    case 'requested': return 'Requested — matching a mechanic';
    case 'accepted': return 'Offer accepted';
    case 'on-the-way': return 'Mechanic on the way';
    case 'arrived': return 'Mechanic arrived';
    case 'service': return session.estimate.state === 'pending' ? 'In service — estimate awaiting approval' : 'In service';
    case 'completed': return 'Repair completed — payment pending';
  }
}

function stageTone(state: 'done' | 'current' | 'waiting' | 'next'): { ring: string; text: string; label: string } {
  if (state === 'done') return { ring: 'border-success/50 bg-success/15 text-success', text: 'text-steel-300', label: 'Done' };
  if (state === 'current') return { ring: 'border-safety-400 bg-safety-500 text-white', text: 'text-cream', label: 'Current' };
  if (state === 'waiting') return { ring: 'border-warning/50 bg-warning/15 text-warning', text: 'text-warning', label: 'Waiting' };
  return { ring: 'border-line-strong bg-graphite-soft text-steel-500', text: 'text-steel-500', label: 'Next' };
}

/* ---------------- simulated live tracking ---------------- */

/**
 * The map is presentation data: a fixed fictional pickup, a fixed fictional
 * workshop and predefined simulated geometry. The badge says so on every frame.
 */
function SimTrackingMap({ journey, className }: { journey: JourneySnapshot; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line-soft ${className ?? ''}`}>
      <div className="absolute left-2 top-2 z-10 rounded-md border border-warning/40 bg-grease/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning backdrop-blur">
        Simulated location — presentation data
      </div>
      <Suspense fallback={<MapFallback />}>
        <MapView
          center={[SIM_SCENARIO.location.lat, SIM_SCENARIO.location.lng]}
          zoom={13}
          className="h-[15rem] w-full"
          userPosition={[SIM_SCENARIO.location.lat, SIM_SCENARIO.location.lng]}
          userLabel="Pickup"
          mechanicMarkers={[{ id: 'sim-mech', position: journey.position, label: 'Mechanic', tone: 'aqua' }]}
          line={SIM_SCENARIO.route}
        />
      </Suspense>
    </div>
  );
}

/** ETA / distance / progress, derived from the journey clock only. */
function JourneySummary({ journey, status }: { journey: JourneySnapshot; status: SimSession['status'] }) {
  const travelling = status === 'on-the-way';
  const showEta = travelling && !journey.arrived && journey.etaMin != null && journey.etaMin > 0;
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-steel-500">ETA</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-cream">
            {showEta ? `${journey.etaMin} min` : status === 'arrived' || status === 'service' || status === 'completed' ? 'Arrived' : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-steel-500">Remaining</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-cream">{formatKm(journey.remainingKm) ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-steel-500">Progress</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-cream">{Math.round(journey.progress * 100)}%</p>
        </div>
      </div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-graphite-soft">
          <div className="h-full rounded-full bg-safety-500 transition-[width] duration-300" style={{ width: `${Math.round(journey.progress * 100)}%` }} />
        </div>
        <p className="mt-1 text-[10px] leading-4 text-steel-500">
          {journey.paused
            ? 'Journey paused — marker and ETA are frozen.'
            : journey.arrived
              ? 'Mechanic has arrived; the travel ETA no longer applies.'
              : 'Simulated ETA from remaining distance · marker movement is time-compressed for the demonstration.'}
        </p>
      </div>
    </div>
  );
}

/* ---------------- shared pieces ---------------- */

function StageRail({ session }: { session: SimSession }) {
  const stages = stageViews(session);
  return (
    <Card className="p-3">
      <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Workflow progress">
        {stages.map((stage) => {
          const tone = stageTone(stage.state);
          return (
            <li key={stage.key} className="min-w-0 text-center" aria-current={stage.state === 'current' ? 'step' : undefined}>
              <span className={`mx-auto grid h-8 w-8 place-items-center rounded-full border ${tone.ring}`}>
                <Icon name={stage.icon} size={14} />
              </span>
              <p className={`mt-1.5 truncate text-[10px] font-medium leading-tight ${tone.text}`} title={stage.label}>{stage.short}</p>
              <p className="text-[9px] uppercase tracking-wider text-steel-500">{tone.label}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function RequestSummary({ session }: { session: SimSession }) {
  const request = session.request;
  if (!request) {
    return (
      <Card>
        <p className="text-sm font-semibold text-cream">Shared request</p>
        <p className="mt-1 text-xs leading-5 text-steel-400">
          No request yet. Press <span className="font-semibold text-cream">Start scenario</span> — the customer’s request
          is created once and shared by all three role views.
        </p>
      </Card>
    );
  }
  const rows: { label: string; value: string }[] = [
    { label: 'Reference', value: request.ref },
    { label: 'Customer', value: request.customerName },
    { label: 'Vehicle', value: `${request.vehicle.year} ${request.vehicle.make} ${request.vehicle.model} · ${request.vehicle.plate}` },
    { label: 'Location', value: request.locationLabel },
    { label: 'Category', value: request.category },
    { label: 'Mechanic', value: session.mechanic ? `${session.mechanic.name} · ${session.mechanic.shop}` : 'Not assigned yet' },
    { label: 'Estimate', value: session.estimate.state === 'none' ? 'Not submitted' : `${session.estimate.state} · ${formatInr(session.estimate.amountCents)}` },
    { label: 'Payment', value: session.payment.state === 'recorded' ? `${session.payment.method?.toUpperCase()} recorded` : 'Not recorded' },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cream">Shared request</p>
        <Badge tone={session.phase === 'complete' ? 'success' : 'brand'}>{session.request ? statusLabel(session) : 'Idle'}</Badge>
      </div>
      <dl className="mt-2 divide-y divide-line-soft/60 border-t border-line-soft/60">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="shrink-0 text-[11px] uppercase tracking-wider text-steel-500">{row.label}</dt>
            <dd className={`text-right text-xs ${row.label === 'Reference' ? 'font-mono' : ''} text-steel-300`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[10px] leading-4 text-steel-500">
        Fictional scenario · {SIM_SCENARIO.location.note}
      </p>
    </Card>
  );
}

function ActivityFeed({ session }: { session: SimSession }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <p className="text-sm font-semibold text-cream">Activity timeline</p>
        <span className="font-mono text-[11px] tabular-nums text-steel-500">{session.activity.length} {session.activity.length === 1 ? 'event' : 'events'}</span>
      </div>
      <div className="max-h-80 overflow-y-auto px-3 py-2 pr-2">
        {session.activity.length === 0 ? (
          <p className="px-1 py-4 text-xs text-steel-500">No activity yet — start the scenario.</p>
        ) : (
          <ol className="grid gap-2.5">
            {[...session.activity].reverse().map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.tone === 'success' ? 'bg-success' : entry.tone === 'warning' ? 'bg-warning' : entry.tone === 'danger' ? 'bg-danger' : entry.tone === 'brand' ? 'bg-safety-400' : 'bg-steel-500'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-xs leading-5 text-steel-300">{entry.label}</p>
                  <p className="text-[10px] uppercase tracking-wider text-steel-500">{entry.actor} · {clock(entry.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

/* ---------------- role panels ---------------- */

function PanelFrame({
  title,
  subtitle,
  children,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-safety-500/25 bg-safety-500/10 text-safety-300">
          <Icon name={icon} size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cream">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-steel-400">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function StartPrompt({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-graphite-soft/25 px-4 py-5 text-center">
      <Icon name="navigation" size={20} className="mx-auto text-safety-300" />
      <p className="mt-2 text-sm font-semibold text-cream">Start the scenario</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-steel-400">
        Creates one fictional request in this browser session. Nothing is sent to Firebase.
      </p>
      <div className="mt-3">
        <Button size="sm" onClick={onStart}>Start scenario</Button>
      </div>
    </div>
  );
}

function CustomerPanel({
  session,
  journey,
  act,
  onStart,
}: {
  session: SimSession;
  journey: JourneySnapshot;
  act: (action: SimAction) => boolean;
  onStart: () => void;
}) {
  if (!session.request) {
    return (
      <PanelFrame title="Customer view" subtitle="Ananya Rao · fictional profile · demo vehicle and demo plate." icon="car-front">
        <StartPrompt onStart={onStart} />
      </PanelFrame>
    );
  }

  const isComplete = session.status === 'completed';
  const estimate = session.estimate;

  return (
    <div className="grid min-w-0 gap-3">
      <PanelFrame
        title="Customer view"
        subtitle="You raised this request and you own the estimate decision."
        icon="car-front"
      >
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-steel-500">Vehicle</dt>
            <dd className="mt-0.5 text-cream">{session.request.vehicle.year} {session.request.vehicle.make} {session.request.vehicle.model}</dd>
            <dd className="font-mono text-[10px] text-steel-500">{session.request.vehicle.plate}</dd>
          </div>
          <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-steel-500">Breakdown</dt>
            <dd className="mt-0.5 capitalize text-cream">{session.request.category}</dd>
            <dd className="text-[10px] text-steel-500">{session.request.locationLabel}</dd>
          </div>
        </dl>

        {session.status === 'requested' && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
            Offer sent to nearby mechanics. The dispatch service owns assignment — you cannot pick the mechanic manually.
          </p>
        )}
        {session.mechanic && session.status !== 'completed' && (
          <p className="mt-3 rounded-lg border border-safety-500/25 bg-safety-500/10 px-3 py-2 text-xs leading-5 text-steel-300">
            <span className="font-semibold text-cream">{session.mechanic.name}</span> · {session.mechanic.shop} is handling your rescue.
            Track the stages above.
          </p>
        )}
      </PanelFrame>

      {session.mechanic && session.status !== 'requested' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Live tracking</p>
            <Badge tone={journey.arrived ? 'success' : journey.paused ? 'warning' : 'brand'}>
              {journey.arrived
                ? 'Arrived at pickup'
                : journey.paused
                  ? 'Journey paused'
                  : session.status === 'on-the-way'
                    ? 'Mechanic travelling'
                    : 'Mechanic assigned'}
            </Badge>
          </div>
          <div className="mt-2"><SimTrackingMap journey={journey} /></div>
          <div className="mt-2"><JourneySummary journey={journey} status={session.status} /></div>
          <p className="mt-2 text-[10px] leading-4 text-steel-500">{ETA_DISCLAIMER}</p>
        </Card>
      )}

      {estimate.state === 'pending' && (
        <Card className="border-safety-500/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Repair estimate — awaiting your decision</p>
            <Badge tone="warning">Waiting on you</Badge>
          </div>
          {estimate.diagnosis && (
            <p className="mt-2 rounded-lg border border-line-soft bg-grease-soft/60 px-3 py-2 text-xs leading-5 text-steel-300">{estimate.diagnosis}</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-steel-500">Estimate</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-cream">{formatInr(estimate.amountCents)}</p>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-steel-500">Duration</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-cream">{estimate.durationMin} min</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" data-testid="sim-approve" onClick={() => act({ type: 'decide-estimate', decision: 'approve' })}>Approve estimate</Button>
            <Button size="sm" variant="secondary" onClick={() => act({ type: 'decide-estimate', decision: 'reject' })}>Reject</Button>
          </div>
          <p className="mt-1.5 text-[11px] text-steel-500">
            Approving unlocks completion. Rejecting sends the estimate back to the mechanic.
          </p>
        </Card>
      )}

      {estimate.state === 'approved' && !isComplete && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs leading-5 text-success">
          Estimate approved. The mechanic can now complete the repair and record the final bill.
        </p>
      )}
      {estimate.state === 'rejected' && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">
          Estimate rejected. The mechanic can submit a revised estimate.
        </p>
      )}

      {isComplete && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Receipt</p>
            <Badge tone={session.payment.state === 'recorded' ? 'success' : 'warning'}>
              {session.payment.state === 'recorded' ? 'Payment recorded' : 'Payment not recorded'}
            </Badge>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-steel-500">Final repair amount</p>
              <p className="text-2xl font-bold tabular-nums text-cream">{formatInr(session.billing.amountCents)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-steel-500">Approved estimate</p>
              <p className="text-sm font-semibold tabular-nums text-steel-300">{formatInr(session.estimate.amountCents)}</p>
            </div>
          </div>
          <dl className="mt-2 divide-y divide-line-soft/60 border-t border-line-soft/60">
            {[
              ['Payment method', session.payment.method ? session.payment.method.toUpperCase() : '—'],
              ['Recorded at', clock(session.payment.recordedAt)],
              ['Completed at', clock(session.billing.completedAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-[11px] text-steel-500">{label}</dt>
                <dd className="text-xs font-medium text-cream">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2 text-[10px] leading-4 text-steel-400">
            Simulated receipt. A recorded payment is what an authorised actor reported — not a verified transaction.
          </p>
        </Card>
      )}

      {isComplete && (
        <Card className="p-0">
          <div className="border-b border-line-soft px-4 py-2.5">
            <p className="text-sm font-semibold text-cream">Service history (simulated)</p>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-cream">{session.request.problemText}</p>
              <p className="font-mono text-[10px] text-steel-500">{session.request.ref} · {clock(session.billing.completedAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold tabular-nums text-cream">{formatInr(session.billing.amountCents)}</p>
              <p className="text-[10px] text-steel-500">{session.rating ? `★ ${session.rating}/5` : '—'}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function MechanicPanel({
  session,
  journey,
  act,
  onNotice,
}: {
  session: SimSession;
  journey: JourneySnapshot;
  act: (action: SimAction) => boolean;
  onNotice: (text: string) => void;
}) {
  const [diagnosis, setDiagnosis] = useState<string>(SIM_SCENARIO.estimate.diagnosis);
  const [estimateAmount, setEstimateAmount] = useState('499');
  const [estimateMinutes, setEstimateMinutes] = useState('45');
  const [billAmount, setBillAmount] = useState('499');
  const [billMinutes, setBillMinutes] = useState('38');
  const [method, setMethod] = useState<'cash' | 'upi'>('cash');

  if (!session.request) {
    return (
      <PanelFrame title="Mechanic view" subtitle="Ravi Kulkarni · Cubbon Auto Works (fictional workshop)." icon="wrench">
        <p className="rounded-xl border border-dashed border-line-strong bg-graphite-soft/25 px-4 py-5 text-center text-xs leading-5 text-steel-400">
          Waiting for a request. Start the scenario as the customer first.
        </p>
      </PanelFrame>
    );
  }

  const parseCents = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  };
  const parseMinutes = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  };

  function submitEstimate() {
    const amount = parseCents(estimateAmount);
    const minutes = parseMinutes(estimateMinutes);
    if (amount == null || minutes == null) {
      onNotice('Enter a valid amount and duration.');
      return;
    }
    act({ type: 'submit-estimate', diagnosis, amountCents: amount, durationMin: minutes });
  }

  function completeJob() {
    const amount = parseCents(billAmount);
    const minutes = parseMinutes(billMinutes);
    if (amount == null || minutes == null) {
      onNotice('Enter a valid final bill and duration.');
      return;
    }
    act({ type: 'complete-job', amountCents: amount, durationMin: minutes });
  }

  function recordPayment() {
    const amount = parseCents(billAmount);
    if (amount == null) {
      onNotice('Enter a valid payment amount.');
      return;
    }
    act({ type: 'record-payment', method, amountCents: amount });
  }

  return (
    <div className="grid min-w-0 gap-3">
      <PanelFrame title="Mechanic view" subtitle="You only see jobs assigned to you by the dispatch service." icon="wrench">
        <p className="mb-2 rounded-lg border border-line-soft bg-grease-soft/50 px-3 py-2 text-xs leading-5 text-steel-300">
          <span className="font-medium text-cream">Reported fault:</span> {session.request.problemText}
          <span className="text-steel-500"> · {session.request.category}</span>
        </p>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-steel-500">Customer</dt>
            <dd className="mt-0.5 text-cream">{session.request.customerName}</dd>
            <dd className="text-[10px] text-steel-500">{session.request.locationLabel}</dd>
          </div>
          <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-steel-500">Vehicle</dt>
            <dd className="mt-0.5 text-cream">{session.request.vehicle.year} {session.request.vehicle.make} {session.request.vehicle.model}</dd>
            <dd className="font-mono text-[10px] text-steel-500">{session.request.vehicle.plate}</dd>
          </div>
        </dl>

        {session.status === 'requested' && (
          <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-cream">Incoming offer</p>
              <Badge tone="warning">Offer window 120 s (simulated)</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-steel-300">
              {session.request.problemText} · <span className="capitalize">{session.request.category}</span> · {session.request.locationLabel}
            </p>
            <div className="mt-2">
              <Button size="sm" data-testid="sim-accept" onClick={() => act({ type: 'accept-offer' })}>Accept job</Button>
            </div>
          </div>
        )}

        {session.status === 'accepted' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-2.5">
            <p className="text-xs text-steel-300">Accepted. Start the journey when you are ready.</p>
            <Button size="sm" data-testid="sim-start-journey" onClick={() => act({ type: 'start-journey' })}>Start journey</Button>
          </div>
        )}

        {session.status === 'on-the-way' && (
          <div className="mt-3 grid gap-2 rounded-xl border border-line-soft bg-graphite-soft/40 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-steel-300">
                Travelling to the pickup {journey.paused ? '— paused' : '— live simulated movement'}
              </p>
              <div className="flex flex-wrap gap-2">
                {journey.paused ? (
                  <Button size="sm" data-testid="sim-resume-journey" onClick={() => act({ type: 'resume-journey' })}>Resume journey</Button>
                ) : (
                  <Button size="sm" variant="secondary" data-testid="sim-pause-journey" onClick={() => act({ type: 'pause-journey' })}>Pause journey</Button>
                )}
                <Button size="sm" data-testid="sim-arrive" onClick={() => act({ type: 'arrive' })}>Mark arrived</Button>
              </div>
            </div>
            <JourneySummary journey={journey} status={session.status} />
          </div>
        )}

        {session.status === 'arrived' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
            <p className="text-xs text-success">Arrived and stopped. Inspect the vehicle, then start service.</p>
            <Button size="sm" data-testid="sim-advance" onClick={() => act({ type: 'advance', to: 'service' })}>Start service</Button>
          </div>
        )}
      </PanelFrame>

      {session.status === 'accepted' && (
        <Card>
          <p className="text-sm font-semibold text-cream">Journey preview</p>
          <p className="mt-0.5 text-xs text-steel-400">This is where you are starting from. Location updates begin when the journey starts.</p>
          <div className="mt-2"><SimTrackingMap journey={journey} /></div>
        </Card>
      )}

      {session.status === 'service' && (session.estimate.state === 'none' || session.estimate.state === 'rejected') && (
        <Card>
          <p className="text-sm font-semibold text-cream">Diagnosis and repair estimate</p>
          <p className="mt-0.5 text-xs text-steel-400">
            {session.estimate.state === 'rejected' ? 'Your estimate was rejected — submit a revision.' : 'Price the repair before completing the job.'}
          </p>
          <div className="mt-2 grid gap-2">
            <Field label="Diagnosis">
              <textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={2}
                maxLength={2000}
                className="w-full rounded-xl border border-line-soft bg-grease-soft px-3 py-2 text-sm text-cream placeholder:text-steel-500 focus:border-safety-400 focus:outline-none focus:ring-2 focus:ring-safety-500/25"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Amount (₹)">
                <Input value={estimateAmount} onChange={(e) => setEstimateAmount(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Duration (min)">
                <Input value={estimateMinutes} onChange={(e) => setEstimateMinutes(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
          </div>
          <div className="mt-2">
            <Button size="sm" data-testid="sim-estimate-submit" onClick={submitEstimate}>Submit estimate</Button>
          </div>
        </Card>
      )}

      {session.estimate.state === 'pending' && (
        <Card className="border-warning/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Waiting for customer approval</p>
            <Badge tone="warning">Blocked</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-steel-300">
            Estimate {formatInr(session.estimate.amountCents)} · {session.estimate.durationMin} min submitted.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled title="Completion is blocked until the customer approves the estimate">
              Complete repair
            </Button>
            <span className="text-[11px] text-steel-500">Disabled — completion requires customer approval.</span>
          </div>
        </Card>
      )}

      {session.status === 'service' && session.estimate.state === 'approved' && (
        <Card className="border-success/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Repair authorised</p>
            <Badge tone="success">Approved {formatInr(session.estimate.amountCents)}</Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Final bill (₹)">
              <Input value={billAmount} onChange={(e) => setBillAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="On-site minutes">
              <Input value={billMinutes} onChange={(e) => setBillMinutes(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <div className="mt-2">
            <Button size="sm" data-testid="sim-complete" onClick={completeJob}>Complete repair and record bill</Button>
          </div>
        </Card>
      )}

      {session.status === 'completed' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Final bill and payment</p>
            <Badge tone={session.payment.state === 'recorded' ? 'success' : 'warning'}>
              {session.payment.state === 'recorded' ? 'Payment recorded' : 'Awaiting payment record'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-steel-400">Final bill {formatInr(session.billing.amountCents)} · {session.billing.durationMin} min on site.</p>

          {session.payment.state !== 'recorded' ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Method">
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as 'cash' | 'upi')}
                    className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream focus:border-safety-400 focus:outline-none focus:ring-2 focus:ring-safety-500/25"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                  </select>
                </Field>
                <Field label="Amount (₹)">
                  <Input value={billAmount} onChange={(e) => setBillAmount(e.target.value)} inputMode="decimal" />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" data-testid="sim-pay" onClick={recordPayment}>Record payment</Button>
                <span className="text-[11px] text-steel-500">Must match the final bill. Recorded, not verified.</span>
              </div>
            </>
          ) : (
            <p className="mt-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs leading-5 text-success">
              {session.payment.method?.toUpperCase()} {formatInr(session.payment.amountCents)} recorded at {clock(session.payment.recordedAt)}.
              Simulated earnings for this job: {formatInr(session.billing.amountCents)}.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function AdminPanel({ session, journey }: { session: SimSession; journey: JourneySnapshot }) {
  if (!session.request) {
    return (
      <PanelFrame title="Admin view" subtitle="Read-only operations monitoring for this simulated session." icon="chart-bar">
        <p className="rounded-xl border border-dashed border-line-strong bg-graphite-soft/25 px-4 py-5 text-center text-xs leading-5 text-steel-400">
          Nothing to monitor yet. Start the scenario to see the request appear here.
        </p>
      </PanelFrame>
    );
  }

  const openOffers = session.status === 'requested' && session.offer === 'pending' ? 1 : 0;
  const active = session.status !== 'requested' && session.status !== 'completed' ? 1 : 0;
  const completed = session.status === 'completed' ? 1 : 0;

  const tiles = [
    { label: 'Open offers', value: openOffers, tone: 'warning' as const },
    { label: 'Active assignments', value: active, tone: 'brand' as const },
    { label: 'Completed jobs', value: completed, tone: 'success' as const },
    { label: 'Payments recorded', value: session.payment.state === 'recorded' ? 1 : 0, tone: 'neutral' as const },
  ];

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-line-soft bg-graphite-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-steel-500">{tile.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${tile.tone === 'warning' ? 'text-warning' : tile.tone === 'brand' ? 'text-safety-300' : tile.tone === 'success' ? 'text-success' : 'text-cream'}`}>
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {session.mechanic && session.status !== 'requested' && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cream">Mechanic tracking</p>
            <Badge tone={journey.arrived ? 'success' : journey.paused ? 'warning' : 'brand'}>
              {journey.arrived ? 'Arrived' : journey.paused ? 'Paused' : session.status === 'on-the-way' ? 'Travelling' : 'Assigned'}
            </Badge>
          </div>
          <div className="mt-2"><SimTrackingMap journey={journey} /></div>
          <div className="mt-2"><JourneySummary journey={journey} status={session.status} /></div>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
          <p className="text-sm font-semibold text-cream">Request monitor</p>
          <Badge tone="neutral">Simulated</Badge>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-cream">{session.request.problemText}</p>
              <p className="font-mono text-[10px] text-steel-500">{session.request.ref} · {session.request.customerName} · {session.request.vehicle.plate}</p>
            </div>
            <span className="shrink-0 text-[11px] text-steel-400">{statusLabel(session)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-1.5">
              <dt className="text-steel-500">Assignment</dt>
              <dd className="mt-0.5 text-cream">{session.mechanic ? session.mechanic.shop : 'Unassigned'}</dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-1.5">
              <dt className="text-steel-500">Estimate</dt>
              <dd className="mt-0.5 capitalize text-cream">{session.estimate.state === 'none' ? 'not submitted' : `${session.estimate.state} · ${formatInr(session.estimate.amountCents)}`}</dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-1.5">
              <dt className="text-steel-500">Final bill</dt>
              <dd className="mt-0.5 text-cream">{session.billing.amountCents == null ? 'not recorded' : formatInr(session.billing.amountCents)}</dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-1.5">
              <dt className="text-steel-500">Payment</dt>
              <dd className="mt-0.5 text-cream">{session.payment.state === 'recorded' ? `${session.payment.method?.toUpperCase()} recorded` : 'not recorded'}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="rounded-xl border border-line-soft bg-graphite-soft/30 px-3 py-2">
        <p className="text-[11px] leading-4 text-steel-500">
          Read-only monitoring, exactly like the real admin portal. Dispatch, rematching and assignment remain
          server-authoritative — the simulation never fabricates an assignment outside the offer/accept flow.
        </p>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export function SimulationPage() {
  const session = useSimulation();
  const [role, setRole] = useState<SimRole>('customer');
  const [notice, setNotice] = useState<string | null>(null);

  const next = useMemo(() => nextActor(session), [session]);

  // Animation clock: the marker position is derived from the journey clock, so
  // this only re-renders (and records the occasional milestone) — it never
  // writes a coordinate stream into storage.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (session.status !== 'on-the-way') return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNowMs(at);
      simTick(at);
    }, 250);
    return () => window.clearInterval(timer);
  }, [session.status]);

  const journey = useMemo(() => journeySnapshot(session, nowMs), [session, nowMs]);

  // Guided controller: advances only the steps a human would take, and never
  // performs the customer's approval on their behalf. While the vehicle is
  // moving it keeps running and lets the animation finish.
  useEffect(() => {
    if (!session.autoPlay) return;
    const timer = window.setInterval(() => {
      const snapshot = getSimSnapshot();
      const step = autoStep(snapshot, Date.now());
      if (!step) {
        if (snapshot.status === 'on-the-way') return; // wait for the vehicle
        simDispatch({ type: 'set-autoplay', playing: false });
        return;
      }
      const result = simDispatch(step);
      if (!result.ok) {
        simDispatch({ type: 'set-autoplay', playing: false });
        return;
      }
      setRole(step.type === 'decide-estimate' ? 'customer' : 'mechanic');
    }, 1400);
    return () => window.clearInterval(timer);
  }, [session.autoPlay]);

  function act(action: SimAction): boolean {
    const result = simDispatch(action);
    setNotice(result.ok ? null : result.reason ?? 'That action is not available right now.');
    return result.ok;
  }

  function start(): void {
    if (act({ type: 'start' })) setRole('customer');
  }

  function reset(): void {
    simDispatch({ type: 'reset' });
    setNotice(null);
    setRole('customer');
  }

  const started = session.request != null;

  return (
    <div className="sim-console mx-auto max-w-[92rem] px-4">
      {/* Mode + scenario header */}
      <div className="border-b border-line-soft py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="sim-mode" className="inline-flex"><Badge tone="warning">
                <span className="inline-flex items-center gap-1"><Icon name="triangle-alert" size={11} />DEMONSTRATION DATA</span>
              </Badge></span>
              <span className="text-[11px] text-steel-500">Isolated simulation · no Firebase writes · resettable</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-cream">Live Experience — presentation console</h1>
            <p className="mt-1 text-sm text-steel-400">
              {SIM_SCENARIO.title} · fictional customer, vehicle and workshop · fixed simulated location.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!started ? (
              <Button size="sm" data-testid="sim-start" onClick={start}>Start scenario</Button>
            ) : (
              <Button
                size="sm"
                variant={session.autoPlay ? 'secondary' : 'primary'}
                onClick={() => simDispatch({ type: 'set-autoplay', playing: !session.autoPlay })}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name={session.autoPlay ? 'clock' : 'navigation'} size={14} />
                  {session.autoPlay ? 'Pause guide' : 'Play guide'}
                </span>
              </Button>
            )}
            <Button size="sm" variant="secondary" data-testid="sim-reset" onClick={reset}>Reset</Button>
            <Link to="/experience">
              <Button size="sm" variant="ghost">Exit</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <StageRail session={session} />
      </div>

      {notice && (
        <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{notice}</p>
      )}

      {next && started && next.role !== role && (
        <p className="mt-3 rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-2.5 text-xs text-steel-300">
          <span className="font-semibold text-cream">Next action:</span> {next.label}
          <span className="ml-2 text-steel-500">— switch to the {next.role} view</span>
        </p>
      )}

      <div className="mt-4 grid gap-4 pb-14 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* Role console */}
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-line-soft bg-graphite-soft/40 p-1" role="tablist" aria-label="Role view">
            {ROLE_TABS.map((tab) => {
              const active = role === tab.role;
              const isNext = next?.role === tab.role;
              return (
                <button
                  key={tab.role}
                  type="button"
                  role="tab" data-testid={`sim-tab-${tab.role}`}
                  aria-selected={active}
                  onClick={() => setRole(tab.role)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    active ? 'bg-graphite-card text-cream shadow-card' : 'text-steel-400 hover:text-cream'
                  }`}
                >
                  <Icon name={tab.icon} size={14} />
                  {tab.label}
                  {isNext && <span className="h-1.5 w-1.5 rounded-full bg-safety-400" aria-label="has the next action" />}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] uppercase tracking-wider text-steel-500">Viewing as {role}</p>

          {role === 'customer' && <CustomerPanel session={session} journey={journey} act={act} onStart={start} />}
          {role === 'mechanic' && <MechanicPanel session={session} journey={journey} act={act} onNotice={setNotice} />}
          {role === 'admin' && <AdminPanel session={session} journey={journey} />}

          {session.phase === 'complete' && (
            <div data-testid="sim-complete-summary"><Card className="border-success/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon name="check-circle" size={18} className="text-success" />
                  <p className="text-sm font-semibold text-cream">Workflow complete</p>
                </div>
                <Badge tone="success">End-to-end</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-steel-400">
                Request → offer accepted → on the way → arrived → service → estimate approved → repair completed →
                payment recorded. {session.activity.length} events are recorded in the timeline.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Approved estimate', value: formatInr(session.estimate.amountCents) },
                  { label: 'Final bill', value: formatInr(session.billing.amountCents) },
                  { label: 'Payment', value: session.payment.method ? session.payment.method.toUpperCase() : '—' },
                  { label: 'Rating', value: session.rating ? `${session.rating}/5` : '—' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-steel-500">{item.label}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-cream">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={reset}>Reset and run again</Button>
                <Link to="/experience/real">
                  <Button size="sm" variant="ghost">See the real workflow</Button>
                </Link>
              </div>
            </Card></div>
          )}
        </div>

        {/* Shared context */}
        <aside className="grid min-w-0 gap-3">
          <RequestSummary session={session} />
          <ActivityFeed session={session} />
          <p className="rounded-xl border border-line-soft bg-graphite-soft/30 px-3 py-2 text-[10px] leading-4 text-steel-500">
            Simulation state lives in this browser only (<span className="font-mono">roadassist.simulation.v1</span>) and
            synchronises across tabs. Reset clears it — real Firebase records are never touched.
          </p>
        </aside>
      </div>
    </div>
  );
}
