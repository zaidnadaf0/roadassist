import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { watchRequestOffers } from '@/lib/dispatch';

// Leaflet touches `window` at import: lazy-load so node/unit contexts that
// import this page (route table tests) never evaluate the map stack.
const MapView = lazy(() =>
  import('@/components/map/MapView').then((m) => ({ default: m.MapView })),
);

function MapFallback() {
  return (
    <div className="map-grid grid aspect-[16/9] w-full place-items-center rounded-xl border border-line-soft" role="status">
      <p className="text-sm text-steel-300">Loading map…</p>
    </div>
  );
}

import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import {
  approveRejectEstimate,
  cancelRequest,
  getVehicle,
  rateRequest,
  watchMyRequests,
  watchRequest,
  type RequestStatus,
  type ServiceRequest,
  type Vehicle,
} from '@/lib/customer';
import { parsePaymentInput, recordPayment } from '@/lib/mechanic';
import { etaMinutes, formatKm, isStale, kmBetween, travelState, ETA_DISCLAIMER, ROUTE_DISCLAIMER } from '@/lib/tracking';
import { getDemoCustomerRequests } from '@/lib/fixtures';
import { isValidLatLng } from '@/lib/mapProvider';
import { formatInr, formatUtc, requestRef, toMillis } from '@/lib/reference';

/** The six customer-visible stages, in order, with a semantic icon each. */
const STEPS: { status: RequestStatus; label: string; icon: IconName }[] = [
  { status: 'requested', label: 'Requested', icon: 'inbox' },
  { status: 'accepted', label: 'Accepted', icon: 'check' },
  { status: 'on-the-way', label: 'On the way', icon: 'navigation' },
  { status: 'arrived', label: 'Arrived', icon: 'map-pin' },
  { status: 'service', label: 'Service', icon: 'wrench' },
  { status: 'completed', label: 'Completed', icon: 'check-circle' },
];

function stepIndex(status: RequestStatus): number {
  return STEPS.findIndex((s) => s.status === status);
}

function statusTone(status: RequestStatus): 'brand' | 'success' | 'warning' | 'danger' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'requested') return 'warning';
  return 'brand';
}

function statusLabel(status: RequestStatus): string {
  if (status === 'requested') return 'Finding a mechanic';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'completed') return 'Completed';
  return status.replace(/-/g, ' ');
}

function VehicleLine({ vehicle }: { vehicle: Vehicle | null }) {
  if (!vehicle) return <>Vehicle on file</>;
  return <>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</>;
}

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onPick?.(n)}
          disabled={!onPick}
          className={`rounded p-0.5 text-xl leading-none transition-colors ${
            n <= value ? 'text-safety-400' : 'text-steel-500'
          } ${onPick ? 'hover:text-safety-300' : 'cursor-default'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ---------------- progress timeline ---------------- */

function ProgressTimeline({ req }: { req: ServiceRequest }) {
  const idx = stepIndex(req.status);
  const progress = idx <= 0 ? 0 : (idx / (STEPS.length - 1)) * 100;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cream">Progress</p>
        <p className="text-xs text-steel-400">
          {req.status === 'cancelled' ? 'This request was cancelled.' : `Stage ${Math.max(idx, 0) + 1} of ${STEPS.length}`}
        </p>
      </div>

      {/* Desktop: horizontal stepper */}
      <div className="relative mt-6 hidden sm:block">
        <div aria-hidden className="absolute left-4 right-4 top-4 h-px bg-line-strong" />
        <div
          aria-hidden
          className="absolute left-4 top-4 h-px bg-safety-500"
          style={{ width: `calc((100% - 2rem) * ${progress / 100})` }}
        />
        <ol className="relative grid grid-cols-6 gap-1">
          {STEPS.map((step, i) => {
            const done = idx >= 0 && i < idx;
            const current = i === idx;
            return (
              <li key={step.status} className="flex min-w-0 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full border transition-colors ${
                    done
                      ? 'border-safety-500/50 bg-safety-500/15 text-safety-300'
                      : current
                        ? 'border-safety-400 bg-safety-500 text-white'
                        : 'border-line-strong bg-graphite-soft text-steel-500'
                  }`}
                >
                  <Icon name={step.icon} size={15} />
                </span>
                <span className={`mt-2 text-[11px] font-medium leading-tight ${current ? 'text-cream' : done ? 'text-steel-300' : 'text-steel-500'}`}>
                  {step.label}
                </span>
                <span className="mt-0.5 text-[10px] uppercase tracking-wider text-steel-500">
                  {done ? 'Done' : current ? 'Current' : 'Next'}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Mobile: vertical timeline (same data, compact at 390px) */}
      <ol className="mt-4 grid sm:hidden">
        {STEPS.map((step, i) => {
          const done = idx >= 0 && i < idx;
          const current = i === idx;
          return (
            <li key={step.status} className="relative flex gap-2.5 pb-3.5 last:pb-0" aria-current={current ? 'step' : undefined}>
              {i < STEPS.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-line-strong" />}
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                  done
                    ? 'border-safety-500/50 bg-safety-500/15 text-safety-300'
                    : current
                      ? 'border-safety-400 bg-safety-500 text-white'
                      : 'border-line-strong bg-graphite-soft text-steel-500'
                }`}
              >
                <Icon name={step.icon} size={13} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`text-[13px] font-medium leading-5 ${current ? 'text-cream' : done ? 'text-steel-300' : 'text-steel-500'}`}>{step.label}</p>
                <p className="text-[10px] leading-4 text-steel-500">{done ? 'Complete' : current ? 'Current step' : 'Upcoming'}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ---------------- request overview ---------------- */

function OverviewCard({ req, vehicle }: { req: ServiceRequest; vehicle: Vehicle | null }) {
  const created = formatUtc(req.createdAt);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500" title={req.id}>
            {requestRef(req.id)}
          </p>
          <h2 className="mt-1 text-lg font-bold leading-snug text-cream">{req.problemText}</h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-steel-400">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="triangle-alert" size={14} className="text-safety-400" />
              <span className="capitalize">{req.problemCategory?.replace(/-/g, ' ') ?? 'Roadside assistance'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="car-front" size={14} className="text-steel-500" />
              <VehicleLine vehicle={vehicle} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" size={14} className="text-steel-500" />
              {created ? `${created} UTC` : 'Request time unavailable'}
            </span>
          </div>
        </div>
        <Badge tone={statusTone(req.status)}>{statusLabel(req.status)}</Badge>
      </div>
    </Card>
  );
}

/* ---------------- mechanic ---------------- */

function MechanicPanel({
  req,
  offersPending,
  offersError,
}: {
  req: ServiceRequest;
  offersPending: number | null;
  offersError: boolean;
}) {
  if (req.mechanicName) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-soft bg-graphite-soft text-sm font-bold text-cream">
              {req.mechanicName
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('')}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cream">{req.mechanicName}</p>
              <p className="text-xs text-steel-400">
                Assigned mechanic
                {req.etaMin != null ? ` · committed ETA ${req.etaMin} min` : ''}
              </p>
            </div>
          </div>
          {req.mechanicPhone ? (
            <a
              href={`tel:${req.mechanicPhone}`}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-line-soft bg-graphite-soft px-3.5 text-sm font-semibold text-cream transition-colors hover:border-line-strong hover:bg-graphite-hover"
            >
              <Icon name="phone" size={15} />
              Call
            </a>
          ) : (
            <span className="text-xs text-steel-500">Contact unlocks once a number is shared</span>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-safety-500/30 bg-safety-500/10 text-safety-300">
          <Icon name="wrench" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cream">
            {req.status === 'cancelled' ? 'No mechanic assigned' : 'Matching you with a mechanic'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-steel-400">
            {req.status === 'cancelled'
              ? 'This request was cancelled before a mechanic was assigned.'
              : offersError
                ? 'Offer status is temporarily unavailable — it is not a zero. This panel updates automatically when the feed recovers.'
                : offersPending === null
                  ? 'Checking who is available near you…'
                  : offersPending > 0
                    ? `${offersPending} nearby mechanic${offersPending > 1 ? 's have' : ' has'} received your request. First valid accept wins.`
                    : 'No offer is out right now. Stay on this screen — the next eligible mechanic is offered your request.'}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- map ---------------- */

function LocationPanel({ req, nowMs }: { req: ServiceRequest; nowMs: number }) {
  const hasCustomer = isValidLatLng(req.customerLat, req.customerLng);
  const hasFix = isValidLatLng(req.mechanicLat, req.mechanicLng);
  const state = travelState({ status: req.status, hasMechanic: Boolean(req.mechanicId), hasFix });
  const updatedMs = toMillis(req.mechanicLocationUpdatedAt);
  const stale = hasFix ? isStale(updatedMs, nowMs) : true;
  const km = hasFix && hasCustomer
    ? kmBetween({ lat: req.customerLat, lng: req.customerLng }, { lat: req.mechanicLat as number, lng: req.mechanicLng as number })
    : null;
  const travelling = state === 'travelling';
  const eta = travelling && !stale ? etaMinutes(km) : null;
  const updated = formatUtc(req.mechanicLocationUpdatedAt);
  const showMap = hasCustomer && hasFix && state !== 'unassigned' && state !== 'assigned' && state !== 'cancelled';

  const stateBadge = travelling
    ? { tone: 'brand' as const, label: stale ? 'Last known position' : 'Mechanic travelling' }
    : state === 'arrived'
      ? { tone: 'success' as const, label: 'Mechanic arrived' }
      : state === 'in-service'
        ? { tone: 'success' as const, label: 'Service in progress' }
        : state === 'done'
          ? { tone: 'neutral' as const, label: 'Tracking ended' }
          : { tone: 'warning' as const, label: 'Waiting for assignment' };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cream">Live location</p>
        <Badge tone={stateBadge.tone}>{stateBadge.label}</Badge>
      </div>

      {showMap ? (
        <>
          <div className="overflow-hidden rounded-xl border border-line-soft">
            <Suspense fallback={<MapFallback />}>
              <MapView
                center={[req.customerLat, req.customerLng]}
                zoom={13}
                userPosition={[req.customerLat, req.customerLng]}
                userLabel="You"
                mechanicMarkers={[{ id: 'mech', position: [req.mechanicLat as number, req.mechanicLng as number], label: req.mechanicName ?? 'Mechanic', tone: 'aqua' }]}
                line={[[req.mechanicLat as number, req.mechanicLng as number], [req.customerLat, req.customerLng]]}
              />
            </Suspense>
          </div>

          <dl className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-steel-500">ETA</dt>
              <dd className="mt-0.5 text-base font-bold tabular-nums text-cream" data-testid="track-eta">
                {travelling ? (eta == null ? '—' : eta <= 0 ? 'Arriving' : `≈ ${eta} min`) : 'Arrived'}
              </dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-steel-500">Distance</dt>
              <dd className="mt-0.5 text-base font-bold tabular-nums text-cream" data-testid="track-distance">{formatKm(km) ?? '—'}</dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-steel-500">Last fix</dt>
              <dd className="mt-0.5 text-xs font-semibold text-cream">{updated ? `${updated} UTC` : '—'}</dd>
            </div>
          </dl>

          {travelling && !stale && <p className="mt-2 text-[10px] leading-4 text-steel-500">{ETA_DISCLAIMER}</p>}
          {travelling && stale && (
            <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-4 text-warning">
              The mechanic&apos;s last position is stale, so no ETA is shown. Waiting for a fresh fix.
            </p>
          )}
          {!travelling && (
            <p className="mt-2 text-[10px] leading-4 text-steel-500">Travel ETA no longer applies — the mechanic is on site.</p>
          )}
          <p className="mt-1 text-[10px] leading-4 text-steel-500">{ROUTE_DISCLAIMER}</p>
        </>
      ) : (
        <div className="map-grid grid h-40 place-items-center rounded-xl border border-dashed border-line-strong px-4 text-center">
          <div>
            <Icon name="map-pin" size={20} className="mx-auto text-steel-500" />
            <p className="mt-2 text-sm font-medium text-steel-300">
              {state === 'done'
                ? 'Tracking has ended for this request'
                : state === 'cancelled'
                  ? 'This request was cancelled'
                  : req.mechanicId
                    ? stale && travelling
                      ? 'Waiting for a fresh mechanic location'
                      : 'Waiting for the mechanic to share their location'
                    : 'A live map appears once a mechanic is assigned'}
            </p>
            <p className="mt-1 text-xs text-steel-500">
              {hasCustomer ? 'Your pickup point is recorded on this request.' : 'No pickup coordinates were recorded.'}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------------- estimate / receipt / payment ---------------- */

function EstimatePanel({
  req,
  estimating,
  onDecide,
}: {
  req: ServiceRequest;
  estimating: boolean;
  onDecide: (decision: 'approve' | 'reject') => void;
}) {
  if (req.status === 'completed' || req.status === 'cancelled') return null;

  if (req.estimateStatus == null) {
    if (req.status !== 'arrived' && req.status !== 'service') return null;
    return (
      <Card>
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-graphite-soft text-steel-400">
            <Icon name="receipt" size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-cream">Estimate not submitted yet</p>
            <p className="mt-0.5 text-xs text-steel-400">Your mechanic submits a diagnosis and price before completing the job.</p>
          </div>
        </div>
      </Card>
    );
  }

  const pending = req.estimateStatus === 'pending';
  return (
    <Card className={pending ? 'border-safety-500/40' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-cream">Repair estimate</p>
          <p className="mt-0.5 text-xs text-steel-400">
            {pending ? 'Review the diagnosis and cost, then approve or reject.' : req.estimateStatus === 'approved' ? 'You approved this estimate.' : 'You rejected this estimate — the mechanic can revise it.'}
          </p>
        </div>
        <Badge tone={req.estimateStatus === 'approved' ? 'success' : req.estimateStatus === 'rejected' ? 'danger' : 'warning'}>
          {req.estimateStatus === 'pending' ? 'Awaiting your decision' : req.estimateStatus === 'approved' ? 'Approved' : 'Rejected'}
        </Badge>
      </div>

      {req.estimateDiagnosis && (
        <p className="mt-3 rounded-lg border border-line-soft bg-grease-soft/60 px-3 py-2 text-sm text-steel-300">{req.estimateDiagnosis}</p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-steel-500">Estimate</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-cream">
            {req.estimatedAmountCents != null ? formatInr(req.estimatedAmountCents) : '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-steel-500">Duration</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-cream">
            {req.estimatedDurationMin != null ? `${req.estimatedDurationMin} min` : '—'}
          </dd>
        </div>
      </dl>

      {pending && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button data-testid="estimate-approve" disabled={estimating} onClick={() => onDecide('approve')}>
              {estimating ? 'Deciding…' : 'Approve estimate'}
            </Button>
            <Button variant="secondary" data-testid="estimate-reject" disabled={estimating} onClick={() => onDecide('reject')}>
              Reject
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-steel-400">
            Approving lets the mechanic mark the job complete. Rejecting returns it for revision.
          </p>
        </>
      )}
      {req.estimateStatus === 'approved' && (
        <p className="mt-2 text-xs text-steel-400">The final bill is recorded separately when the job is completed.</p>
      )}
    </Card>
  );
}

function ReceiptPanel({ req }: { req: ServiceRequest }) {
  const rows: { label: string; value: string; testId?: string }[] = [
    { label: 'Estimate status', value: req.estimateStatus === 'approved' ? 'Approved by you' : req.estimateStatus === 'rejected' ? 'Rejected' : req.estimateStatus === 'pending' ? 'Awaiting decision' : 'No estimate submitted', testId: 'receipt-estimate-status' },
    { label: 'Approved estimate', value: req.estimateStatus === 'approved' ? formatInr(req.estimatedAmountCents ?? null) : '—' },
    { label: 'Final repair amount', value: req.amountCents != null ? formatInr(req.amountCents) : 'Not recorded', testId: 'receipt-amount' },
    { label: 'Payment method', value: req.paymentMethod === 'cash' ? 'Cash' : req.paymentMethod === 'upi' ? 'UPI' : '—', testId: 'receipt-method' },
    { label: 'Payment recording', value: req.paymentStatus === 'paid' ? 'Recorded' : 'Not recorded', testId: 'receipt-payment-status' },
    { label: 'Recorded at (UTC)', value: formatUtc(req.paidAt) ?? '—', testId: 'receipt-paid-at' },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-cream">Receipt</p>
          <p className="mt-0.5 text-xs text-steel-400">{requestRef(req.id)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-steel-500">Final amount</p>
          <p className="text-xl font-bold tabular-nums text-cream">{req.amountCents != null ? formatInr(req.amountCents) : '—'}</p>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-line-soft/70 border-t border-line-soft/70">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-xs text-steel-400">{row.label}</dt>
            <dd className="text-right text-sm font-medium text-cream" data-testid={row.testId}>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 flex items-start gap-2 rounded-lg border border-line-soft bg-graphite-soft/40 px-3 py-2">
        <Icon name="info" size={14} className="mt-0.5 shrink-0 text-steel-400" />
        <p className="text-[11px] leading-4 text-steel-400">
          A recorded payment is a record of what an authorized actor reported — not a verified transaction.
          RoadAssist does not confirm offline cash or UPI payments independently.
        </p>
      </div>
    </Card>
  );
}

function PaymentPanel({
  payingMethod,
  payingAmount,
  paying,
  onMethod,
  onAmount,
  onRecord,
}: {
  payingMethod: 'cash' | 'upi' | null;
  payingAmount: string;
  paying: boolean;
  onMethod: (m: 'cash' | 'upi') => void;
  onAmount: (v: string) => void;
  onRecord: () => void;
}) {
  return (
    <Card>
      <p className="text-sm font-semibold text-cream">Record offline payment</p>
      <p className="mt-0.5 text-xs text-steel-400">
        Record how you paid. Cash and UPI payments are recorded by an authorized actor — RoadAssist does not verify the transaction.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Method">
          <select
            data-testid="payment-method"
            value={payingMethod ?? ''}
            onChange={(e) => onMethod(e.target.value as 'cash' | 'upi')}
            className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream transition-colors hover:border-line-strong focus:border-safety-400 focus:outline-none focus:ring-2 focus:ring-safety-500/25"
          >
            <option value="">Select method</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
          </select>
        </Field>
        <Field label="Amount (₹)">
          <Input data-testid="payment-amount" value={payingAmount} onChange={(e) => onAmount(e.target.value)} placeholder="e.g. 499" inputMode="decimal" />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xs text-[11px] leading-4 text-steel-500">
          The amount must match the final repair amount. Recording a payment is not proof of transaction verification.
        </p>
        <Button data-testid="payment-record" disabled={paying || !payingMethod || !payingAmount.trim()} onClick={onRecord}>
          {paying ? 'Recording…' : 'Record payment'}
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- details rail ---------------- */

function DetailsRail({
  req,
  vehicle,
  sample,
  cancellable,
  cancelBusy,
  onCancel,
}: {
  req: ServiceRequest;
  vehicle: Vehicle | null;
  sample: boolean;
  cancellable: boolean;
  cancelBusy: boolean;
  onCancel: () => void;
}) {
  const created = formatUtc(req.createdAt);
  const rows: { label: string; value: string }[] = [
    { label: 'Request ID', value: req.id },
    { label: 'Category', value: (req.problemCategory ?? 'Roadside assistance').replace(/-/g, ' ') },
    { label: 'Vehicle', value: vehicle ? `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}${vehicle.plate ? ` · ${vehicle.plate}` : ''}` : 'Vehicle on file' },
    { label: 'Requested', value: created ? `${created} UTC` : 'Unavailable' },
    { label: 'Assigned', value: req.mechanicName ?? 'Not assigned yet' },
  ];

  return (
    <Card>
      <p className="text-sm font-semibold text-cream">Request details</p>
      <dl className="mt-2 grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-steel-500">{row.label}</dt>
            <dd className={`text-sm text-steel-300 ${row.label === 'Request ID' ? 'break-all font-mono text-xs' : ''}`}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {sample && (
        <p className="mt-3 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-[11px] leading-4 text-warning">
          Sample record — this request belongs to demo data, so status actions are read-only.
        </p>
      )}

      {cancellable && !sample && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <Button variant="secondary" className="w-full" disabled={cancelBusy} onClick={onCancel}>
            {cancelBusy ? 'Cancelling…' : 'Cancel request'}
          </Button>
          <p className="mt-1.5 text-[11px] text-steel-500">Cancelling releases the mechanic immediately.</p>
        </div>
      )}
    </Card>
  );
}

/* ---------------- view ---------------- */

function TrackingView({ req, sample = false }: { req: ServiceRequest; sample?: boolean }) {
  const { user, demoRevision } = useAuth();
  const [cancelBusy, setCancelBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [rated, setRated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [offersPending, setOffersPending] = useState<number | null>(null);
  const [offersError, setOffersError] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [payingMethod, setPayingMethod] = useState<'cash' | 'upi' | null>(null);
  const [payingAmount, setPayingAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (sample || req.status !== 'requested' || !user) {
      setOffersPending(null);
      setOffersError(false);
      return;
    }
    setOffersError(false);
    const unsub = watchRequestOffers(req.id, user.uid, (list) => setOffersPending(list.length), () => setOffersError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [req.id, req.status, user, demoRevision, sample]);

  // Vehicle details are read from the customer's own record; when unavailable
  // the UI says "Vehicle on file" rather than inventing a model.
  useEffect(() => {
    let active = true;
    if (sample || !req.vehicleId) {
      setVehicle(null);
      return;
    }
    void getVehicle(req.vehicleId).then((v) => {
      if (active) setVehicle(v);
    });
    return () => {
      active = false;
    };
  }, [req.vehicleId, sample]);

  const cancellable = ['requested', 'accepted', 'on-the-way', 'arrived'].includes(req.status);

  // Slow clock so "last fix" can be judged stale without re-rendering per second.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function onCancel() {
    if (sample) return;
    if (!window.confirm('Cancel this request? The mechanic is released immediately.')) return;
    setCancelBusy(true);
    const res = await cancelRequest(req.id);
    setCancelBusy(false);
    setNotice(res === 'cancelled' ? 'Request cancelled.' : res === 'too_late' ? 'Too late to cancel — it already finished.' : 'Could not cancel. Try again.');
  }

  async function onRate() {
    if (sample) return;
    const ok = await rateRequest(req.id, rating, comment);
    setNotice(ok ? 'Thanks for the feedback.' : 'Could not save your rating.');
    if (ok) setRated(true);
  }

  async function onDecideEstimate(decision: 'approve' | 'reject') {
    if (sample) return;
    if (!req.mechanicId) return;
    setEstimating(true);
    setNotice(null);
    const res = await approveRejectEstimate(req.id, user?.uid ?? '', decision);
    setEstimating(false);
    setNotice(
      res === 'approved'
        ? 'Estimate approved. You can record payment once the job is completed.'
        : res === 'rejected'
          ? 'Estimate rejected.'
          : res === 'not_found'
            ? 'Estimate not found.'
            : res === 'not_assigned'
              ? 'You do not own this request.'
              : res === 'invalid_state'
                ? 'No estimate to approve/reject, or it has already been decided.'
                : res === 'forbidden'
                  ? 'Not permitted.'
                  : 'Could not update estimate. Try again.',
    );
  }

  async function onRecordPayment() {
    if (sample) return;
    if (!req.mechanicId) return;
    // Validate locally first: the write path collapses bad input into a generic
    // 'error', which would tell the customer to "try again" with the same value.
    const parsed = parsePaymentInput(payingMethod, payingAmount.trim() || null);
    if (!parsed.ok) {
      setNotice(parsed.error);
      return;
    }
    setPaying(true);
    setNotice(null);
    const res = await recordPayment(req.id, user?.uid ?? '', payingMethod ?? 'cash', payingAmount.trim() || null);
    setPaying(false);
    setNotice(
      res === 'recorded'
        ? 'Payment recorded (cash/UPI). RoadAssist does not independently verify the transaction.'
        : res === 'not_assigned'
          ? 'You do not own this request.'
          : res === 'invalid_state'
            ? 'Payment can only be recorded for a completed job.'
            : res === 'amount_mismatch'
              ? 'The amount must match the final repair amount recorded for this job.'
              : res === 'forbidden'
                ? 'Not permitted.'
                : 'Could not record payment. Try again.',
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <OverviewCard req={req} vehicle={vehicle} />

        {notice && (
          <p role="status" className="rounded-xl border border-line-soft bg-graphite-soft px-4 py-2.5 text-sm text-cream">
            {notice}
          </p>
        )}

        <ProgressTimeline req={req} />
        <MechanicPanel req={req} offersPending={offersPending} offersError={offersError} />
        <LocationPanel req={req} nowMs={nowMs} />

        <EstimatePanel req={req} estimating={estimating} onDecide={(d) => void onDecideEstimate(d)} />

        {req.status === 'completed' && <ReceiptPanel req={req} />}

        {req.status === 'completed' && !sample && req.mechanicId && req.paymentStatus !== 'paid' && (
          <PaymentPanel
            payingMethod={payingMethod}
            payingAmount={payingAmount}
            paying={paying}
            onMethod={setPayingMethod}
            onAmount={setPayingAmount}
            onRecord={() => void onRecordPayment()}
          />
        )}

        {req.status === 'completed' && !sample && !rated && req.rating == null && (
          <Card>
            <p className="text-sm font-semibold text-cream">Rate this service</p>
            <div className="mt-2"><Stars value={rating} onPick={setRating} /></div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Optional comment…"
              rows={2}
              className="mt-2 w-full rounded-xl border border-line-soft bg-grease-soft px-3 py-2 text-sm text-cream placeholder:text-steel-500 focus:border-safety-400 focus:outline-none focus:ring-2 focus:ring-safety-500/25"
            />
            <p className="mt-1 text-right text-[10px] text-steel-500">{comment.length}/500</p>
            <div className="mt-2"><Button size="sm" onClick={() => void onRate()}>Submit rating</Button></div>
          </Card>
        )}

        {req.rating != null && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-cream">Your rating</p>
              <Stars value={req.rating} />
            </div>
            {req.comment && <p className="mt-2 text-sm text-steel-300">{req.comment}</p>}
          </Card>
        )}
      </div>

      <aside className="grid min-w-0 gap-4">
        <DetailsRail
          req={req}
          vehicle={vehicle}
          sample={sample}
          cancellable={cancellable}
          cancelBusy={cancelBusy}
          onCancel={() => void onCancel()}
        />
        <Card>
          <div className="flex items-start gap-2.5">
            <Icon name="shield-check" size={17} className="mt-0.5 shrink-0 text-safety-400" />
            <div>
              <p className="text-sm font-semibold text-cream">Safety first</p>
              <p className="mt-0.5 text-xs leading-5 text-steel-400">
                If anyone is injured, call emergency services before roadside help. Wait in a safe place, away from traffic.
              </p>
              <Link to="/emergency" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-safety-300 hover:text-safety-200">
                Emergency guidance
                <Icon name="arrowRight" size={13} />
              </Link>
            </div>
          </div>
        </Card>
      </aside>
    </div>
  );
}

export function TrackingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { demoMode, demoRevision, user } = useAuth();
  const [req, setReq] = useState<ServiceRequest | null | 'loading' | 'missing' | 'error'>('loading');
  const [mine, setMine] = useState<ServiceRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (!id) return;
    const demo = demoMode ? getDemoCustomerRequests().find((item) => item.id === id) : null;
    if (demo) {
      setReq(demo);
      return;
    }
    setReq('loading');
    const unsub = watchRequest(id, (r) => setReq(r ?? 'missing'), () => setReq('error'));
    return () => {
      if (unsub) unsub();
    };
  }, [id, demoMode, demoRevision]);

  useEffect(() => {
    if (id || !user || demoMode) {
      if (!id && demoMode) setMine(getDemoCustomerRequests());
      return;
    }
    const unsub = watchMyRequests(user.uid, setMine, () => {
      setFeedError(true);
      setMine([]);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [id, user, demoMode]);

  // /track without id: jump to the live request, else list the customer's own
  // records (sample records are listed too when demo mode is active).
  const usingDemo = !id && demoMode;
  const displayMine = useMemo(
    () => (usingDemo ? getDemoCustomerRequests() : (mine ?? [])),
    [usingDemo, mine],
  );
  const live = useMemo(
    () => displayMine.find((r) => ['requested', 'accepted', 'on-the-way', 'arrived', 'service'].includes(r.status)) ?? null,
    [displayMine],
  );

  useEffect(() => {
    if (!id && live) navigate(`/track/${live.id}`, { replace: true });
  }, [id, live, navigate]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Track request" description="Live status, your mechanic, and the receipt for this rescue." />
      {id ? (
        req === 'loading' ? (
          <LoadingState label="Loading request…" />
        ) : req === 'error' ? (
          <ErrorState title="Tracking unavailable" description="This request could not be loaded. Check your connection and try again." />
        ) : req === 'missing' || req === null ? (
          <ErrorState title="Request not found" description="It may belong to another account, or it was removed." />
        ) : (
          <TrackingView req={req} sample={req.id.startsWith('demo-')} />
        )
      ) : mine === null ? (
        <LoadingState label="Finding your requests…" />
      ) : displayMine.length === 0 ? (
        <EmptyState title="No requests yet" description="Place your first request and it will appear here for live tracking." />
      ) : (
        <div className="grid gap-3">
          {feedError && (
            <ErrorState title="Tracking unavailable" description="Your live request list could not be loaded. Check your connection and retry." />
          )}
          {displayMine.map((r) => (
            <Link
              key={r.id}
              to={`/track/${r.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-graphite-card px-4 py-3 transition-colors hover:border-line-strong"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-cream">{r.problemText}</span>
                <span className="font-mono text-[11px] text-steel-500">{requestRef(r.id)}</span>
              </span>
              <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
