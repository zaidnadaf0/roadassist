import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { watchActiveRequests, watchAllRequests, type AdminRequest } from '@/lib/admin';
import { getVehicle, watchRequest, type RequestStatus, type ServiceRequest, type Vehicle } from '@/lib/customer';
import { DEMO_ADMIN_VEHICLES, getDemoAdminRequests } from '@/lib/fixtures';
import { formatUtc, requestRef, toMillis } from '@/lib/reference';
import { ETA_DISCLAIMER, etaMinutes, formatKm, isStale, kmBetween, travelState } from '@/lib/tracking';
import { isValidLatLng } from '@/lib/mapProvider';
const FILTERS: (RequestStatus | 'all')[] = ['all', 'requested', 'accepted', 'on-the-way', 'arrived', 'service', 'completed', 'cancelled'];
function requestTime(value: unknown): string {
  const at = typeof value === 'string' ? Date.parse(value)
    : typeof value === 'number' ? value
    : value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate().getTime() : NaN;
  return Number.isFinite(at) ? new Date(at).toLocaleString() : 'Time unavailable';}
function toneFor(s: RequestStatus): 'success' | 'danger' | 'warning' | 'brand' | 'neutral' {
  if (s === 'completed') return 'success';
  if (s === 'cancelled') return 'danger';
  if (s === 'requested') return 'warning';
  return 'brand';}
/** Leaflet touches `window` at import: the admin map is lazy-loaded. */
const AdminMapView = lazy(() => import('@/components/map/MapView').then((m) => ({ default: m.MapView })));

/**
 * Read-only tracking for one request. The admin sees exactly what the assigned
 * mechanic published on this request document — no other mechanic's history.
 */
function AdminTrackingCard({ request }: { request: ServiceRequest }) {
  // A clock value is impure, so it lives in state and is refreshed by an effect
  // rather than being read during render. This keeps the component pure while
  // still letting the stale-fix label update as the position ages.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const hasPickup = isValidLatLng(request.customerLat, request.customerLng);
  const hasFix = isValidLatLng(request.mechanicLat, request.mechanicLng);
  const state = travelState({ status: request.status, hasMechanic: Boolean(request.mechanicId), hasFix });
  const travelling = state === 'travelling';
  const km = hasFix && hasPickup && travelling
    ? kmBetween({ lat: request.customerLat, lng: request.customerLng }, { lat: request.mechanicLat as number, lng: request.mechanicLng as number })
    : null;
  const updatedMs = toMillis(request.mechanicLocationUpdatedAt);
  const updated = formatUtc(request.mechanicLocationUpdatedAt);
  const stale = hasFix ? isStale(updatedMs, now) : true;

  const tone = travelling ? 'brand' as const : state === 'cancelled' ? 'danger' as const : state === 'unassigned' || state === 'assigned' ? 'warning' as const : 'success' as const;
  const label = travelling ? (stale ? 'Last known position' : 'Mechanic travelling') : state === 'arrived' ? 'Mechanic arrived' : state === 'in-service' ? 'Service in progress' : state === 'done' ? 'Tracking ended' : 'Awaiting assignment';

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cream">Mechanic tracking</p>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {hasPickup && hasFix && state !== 'cancelled' ? (
        <>
          <div className="mt-2 overflow-hidden rounded-xl border border-line-soft">
            <Suspense fallback={<div className="map-grid grid h-[13rem] place-items-center"><span className="text-sm text-steel-300">Loading map…</span></div>}>
              <AdminMapView
                center={[request.customerLat, request.customerLng]}
                zoom={13}
                className="h-[13rem] w-full"
                userPosition={[request.customerLat, request.customerLng]}
                userLabel="Pickup"
                mechanicMarkers={[{ id: 'mech', position: [request.mechanicLat as number, request.mechanicLng as number], label: request.mechanicName ?? 'Mechanic', tone: 'aqua' }]}
                line={[[request.mechanicLat as number, request.mechanicLng as number], [request.customerLat, request.customerLng]]}
              />
            </Suspense>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-steel-500">ETA</dt>
              <dd className="mt-0.5 text-base font-bold tabular-nums text-cream">
                {travelling ? (stale ? 'Stale fix' : etaMinutes(km) == null ? '—' : `≈ ${etaMinutes(km)} min`) : 'Arrived'}
              </dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-steel-500">Distance</dt>
              <dd className="mt-0.5 text-base font-bold tabular-nums text-cream">{formatKm(km) ?? '—'}</dd>
            </div>
            <div className="rounded-lg border border-line-soft bg-graphite-soft/40 px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-steel-500">Last fix</dt>
              <dd className="mt-0.5 text-xs font-semibold text-cream">{updated ? `${updated} UTC` : '—'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] leading-4 text-steel-500">
            {travelling ? ETA_DISCLAIMER : 'Travel ETA no longer applies — the mechanic is on site.'}
          </p>
        </>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-line-strong bg-graphite-soft/30 px-3 py-4 text-center text-xs text-steel-400">
          {state === 'cancelled'
            ? 'This request was cancelled; tracking has ended.'
            : hasFix
              ? 'The mechanic has not published a location fix for this request yet.'
              : 'No location fix has been published for this request yet.'}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-4 text-steel-500">
        Read-only monitor. Coordinates are published only by the assigned mechanic through the authorised request fields.
      </p>
    </Card>
  );
}

export function RequestsPage() {
  const { demoMode } = useAuth();
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [items, setItems] = useState<AdminRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    setItems(null);
    setFeedError(false);
    if (demoMode) {
      setItems(getDemoAdminRequests().filter((item) => filter === 'all' || item.status === filter));
      return;
    }
    const unsub = watchAllRequests(setItems, filter, 50, () => setFeedError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [filter, demoMode]);
  const displayItems = demoMode ? getDemoAdminRequests().filter((item) => filter === 'all' || item.status === filter) : (items ?? []);
  const visibleItems = displayItems.filter((item) => {
    const q = search.trim().toLowerCase();
    return !q || [item.id, item.problemText, item.problemCategory, item.mechanicName, ...(demoMode ? [item.demoCustomerName, item.demoLocation] : [])]
      .some((part) => String(part ?? '').toLowerCase().includes(q));
  });
  return (
    <RequireAdmin>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Requests" description={demoMode ? 'Sample request queue with status, customer, vehicle, location, timing, and assignment details.' : 'Live service requests across the network (most recent 50). Viewing only — assignment and dispatch arrive in a later phase.'} />
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${filter === f ? 'border-safety-500/50 bg-safety-500/15 font-semibold text-safety-300' : 'border-line-soft text-steel-300 hover:border-line-strong hover:bg-graphite-soft/60 hover:text-cream'}`}
            >
              {f}
            </button>
          ))}
        </div>
        {feedError && !demoMode ? (
          <ErrorState title="Requests unavailable" description="The request feed could not be loaded. Check your connection and try again." />
        ) : items === null ? (
          <LoadingState label="Loading requests…" />
        ) : displayItems.length === 0 ? (
          <EmptyState title="No requests in this state" description="New customer requests appear here live." />
        ) : (
          <div className="grid gap-3">
            <label className="block">
              <span className="text-xs font-medium text-steel-400">Search requests {demoMode ? '· demo examples' : '· recent 50 live records'}</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Request ID, issue, customer, mechanic, or location" className="mt-1.5 h-10 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-sm text-cream" />
            </label>
            {visibleItems.length === 0 ? <EmptyState title="No matching requests" description="Change the search text or select another status." /> : visibleItems.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-cream">{r.problemText}</p>
                    <p className="mt-1 font-mono text-xs text-steel-500">{requestRef(r.id)} · {r.problemCategory ?? 'general'} · {requestTime(r.createdAt)}</p>
                  </div>
                  <Badge tone={toneFor(r.status)}>{r.status}</Badge>
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-steel-500">Customer</dt><dd className="text-steel-200">{demoMode ? r.demoCustomerName ?? 'Sample customer' : 'Customer details not included in this request feed'}</dd></div>
                  <div><dt className="text-steel-500">Vehicle</dt><dd className="text-steel-200">{demoMode ? r.demoVehicleType ?? '—' : 'Vehicle details available in request detail when permitted'}</dd></div>
                  <div><dt className="text-steel-500">Pickup</dt><dd className="text-steel-200">{demoMode ? r.demoLocation ?? '—' : 'Location omitted from list'}</dd></div>
                  <div><dt className="text-steel-500">Assigned mechanic</dt><dd className="text-steel-200">{r.mechanicName ?? 'Unassigned'}</dd></div>
                  {r.amountCents != null && <div><dt className="text-steel-500">Dispatch / completion value</dt><dd className="text-steel-200">₹{(r.amountCents / 100).toFixed(0)}{r.durationMin != null ? ` · ${r.durationMin} min` : ''}</dd></div>}
                </dl>
                <Link to={`/admin/requests/${r.id}`} className="mt-2 inline-block text-sm font-medium text-safety-400 hover:text-safety-300">Open request details →</Link>
              </Card>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm">
          <Link to="/admin/dispatch" className="font-medium text-safety-400 hover:text-safety-300">Open dispatch view →</Link>
        </p>
      </div>
    </RequireAdmin>
  );}
export function AdminRequestDetailPage() {
  const { id = '' } = useParams();
  const { demoMode } = useAuth();
  const [request, setRequest] = useState<ServiceRequest | null | 'loading' | 'missing'>('loading');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [feedError, setFeedError] = useState(false);
  useEffect(() => {
    if (demoMode && id.startsWith('demo-')) {
      const item = getDemoAdminRequests().find((request) => request.id === id);
      const customerRecord = DEMO_ADMIN_VEHICLES.find((vehicle) => vehicle.id === item?.vehicleId);
      setRequest(item ? { ...item, customerLat: 12.9719, customerLng: 77.6412, vehicleId: item.vehicleId ?? 'demo-vehicle-sedan' } as ServiceRequest : 'missing');
      setVehicle(customerRecord ?? null);
      return;
    }
    const unsub = watchRequest(id, (item) => setRequest(item ?? 'missing'), () => {
      setRequest('missing');
      setFeedError(true);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [id, demoMode]);
  useEffect(() => {
    if (demoMode || request === 'loading' || request === 'missing' || request === null) return;
    let cancelled = false;
    getVehicle(request.vehicleId).then((item) => {
      if (!cancelled) setVehicle(item);
    }).catch(() => {
      if (!cancelled) setVehicle(null);
    });
    return () => {
      cancelled = true;
    };
    // Depend on the vehicleId primitive, not the request object: live
    // snapshots (e.g. mechanic location ticks) must not re-fetch the vehicle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, (typeof request === 'object' && request !== null ? request.vehicleId : null)]);
  const demoDetails = demoMode && request !== 'loading' && request !== 'missing' && request !== null
    ? request as ServiceRequest & Pick<AdminRequest, 'demoCustomerName' | 'demoVehicleType' | 'demoLocation'>
    : null;
  return (
    <RequireAdmin>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Request details" description="Authoritative request, vehicle, assignment, and lifecycle information." />
        <Link to="/admin/requests" className="mb-4 inline-block text-sm font-medium text-safety-400 hover:text-safety-300">← Back to requests</Link>
        {feedError && !demoMode ? (
          <ErrorState title="Request unavailable" description="This request could not be loaded or is no longer available." />
        ) : request === 'loading' ? (
          <LoadingState label="Loading request…" />
        ) : request === 'missing' || request === null ? (
          <EmptyState title="Request not found" description="The request may have been removed or the identifier is invalid." />
        ) : (
          <div className="grid gap-4">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-steel-400">{requestRef(request.id)}</p>
                <Badge tone={toneFor(request.status)}>{request.status}</Badge>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Customer</dt><dd className="text-right font-medium text-cream">{demoMode ? demoDetails?.demoCustomerName ?? 'Sample customer' : 'Customer profile is not loaded on this detail view'}</dd></div>
                {demoMode && <div className="flex justify-between gap-4"><dt className="text-steel-400">Vehicle type</dt><dd className="text-right font-medium text-cream">{demoDetails?.demoVehicleType ?? '—'}</dd></div>}
                {demoMode && <div className="flex justify-between gap-4"><dt className="text-steel-400">Pickup area</dt><dd className="text-right font-medium text-cream">{demoDetails?.demoLocation ?? '—'}</dd></div>}
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Problem</dt><dd className="text-right font-medium text-cream">{request.problemText}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Vehicle</dt><dd className="text-right font-medium text-cream">{vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : 'Unavailable'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Mechanic</dt><dd className="font-medium text-cream">{request.mechanicName ?? request.mechanicId ?? 'Unassigned'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Coordinates</dt><dd className="font-mono text-xs text-cream">{typeof request.customerLat === 'number' ? request.customerLat.toFixed(5) : '—'}, {typeof request.customerLng === 'number' ? request.customerLng.toFixed(5) : '—'}</dd></div>
                {request.amountCents != null && <div className="flex justify-between"><dt className="text-steel-400">Amount</dt><dd className="font-medium text-cream">₹{(request.amountCents / 100).toFixed(0)}</dd></div>}
                {request.rating != null && <div className="flex justify-between"><dt className="text-steel-400">Rating</dt><dd className="font-medium text-cream">★ {request.rating}</dd></div>}
              </dl>
            </Card>
            <AdminTrackingCard request={request} />
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}

/** Compact operational metric used across the dispatch header. */
function DispatchStat({
  label,
  value,
  helper,
  icon,
  tone = 'neutral',}: {
  label: string;
  value: string;
  helper: string;
  icon: IconName;
  tone?: 'neutral' | 'brand' | 'warning';}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums leading-tight text-cream">{value}</p>
        </div>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
            tone === 'brand'
              ? 'border-safety-500/30 bg-safety-500/10 text-safety-300'
              : tone === 'warning'
                ? 'border-warning/30 bg-warning/10 text-warning'
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

/** * One operational row. Read-only: the whole row links to the existing request * detail page — no assignment, rematch or dispatch action is offered here. */
function DispatchRow({ request, kind, demoMode }: { request: AdminRequest; kind: 'open' | 'active'; demoMode: boolean }) {
  const category = (request.problemCategory ?? 'Roadside assistance').replace(/-/g, ' ');
  const where = demoMode
    ? request.demoLocation ?? 'Sample area'
    : 'Location in request detail';
  const when = formatUtc(request.createdAt);
  return (
    <li className="border-t border-line-soft/60 first:border-t-0">
      <Link
        to={`/admin/requests/${request.id}`}
        className="flex items-start justify-between gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-graphite-soft/40"
      >
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium text-cream">{request.problemText}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-steel-500">
            <span className="font-mono" title={request.id}>{requestRef(request.id)}</span>
            <span className="inline-flex items-center gap-1"><Icon name="wrench" size={11} />{category}</span>
            <span className="inline-flex items-center gap-1"><Icon name="map-pin" size={11} />{where}</span>
            <span className="inline-flex items-center gap-1"><Icon name="clock" size={11} />{when ? `${when} UTC` : 'time unavailable'}</span>
            {request.mechanicName && (
              <span className="inline-flex items-center gap-1 text-steel-400"><Icon name="person" size={11} />{request.mechanicName}</span>
            )}
            {demoMode && request.demoCustomerName && (
              <span className="inline-flex items-center gap-1"><Icon name="users" size={11} />{request.demoCustomerName}</span>
            )}
          </div>
        </div>
        <span className="shrink-0">
          <Badge tone={kind === 'open' ? 'warning' : toneFor(request.status)}>{kind === 'open' ? 'open' : request.status}</Badge>
        </span>
      </Link>
    </li>
  );
}

/** Panel whose height follows its content (never stretched by its neighbour). */
function DispatchPanel({
  title,
  count,
  description,
  loading,
  empty,
  children,}: {
  title: string;
  count: number | null;
  description: string;
  loading: boolean;
  empty: boolean;
  children: ReactNode;}) {
  return (
    <Card className="p-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cream">{title}</p>
          <p className="mt-0.5 text-[11px] text-steel-500">{description}</p>
        </div>
        <span className="shrink-0 rounded-md border border-line-soft bg-graphite-soft px-2 py-0.5 font-mono text-xs tabular-nums text-steel-300">
          {count ?? '—'}
        </span>
      </div>
      <div className="px-3 py-2">
        {loading ? (
          <div className="grid gap-2 py-2">
            {[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-graphite-soft/70" />)}
          </div>
        ) : empty ? (
          <div className="flex items-start gap-2.5 px-1 py-5">
            <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-steel-500" />
            <div>
              <p className="text-sm font-medium text-steel-300">Nothing here right now</p>
              <p className="mt-0.5 text-[11px] leading-4 text-steel-500">This panel fills as soon as the dispatch service has something to show.</p>
            </div>
          </div>
        ) : (
          <ul>{children}</ul>
        )}
      </div>
    </Card>
  );}
export function DispatchPage() {
  const { demoMode } = useAuth();
  const [open, setOpen] = useState<AdminRequest[] | null>(null);
  const [active, setActive] = useState<AdminRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  useEffect(() => {
    setFeedError(false);
    if (demoMode) {
      const demoRequests = getDemoAdminRequests();
      setOpen(demoRequests.filter((item) => item.status === 'requested'));
      setActive(demoRequests.filter((item) => ['accepted', 'on-the-way', 'arrived', 'service'].includes(item.status)));
      return;
    }
    const a = watchAllRequests(setOpen, 'requested', 20, () => setFeedError(true));
    // Server-side status filter: an active job must never be pushed out of
    // the dispatch view by newer unrelated requests (the old capped 'all'
    // read + client filter had exactly that blind spot).
    const b = watchActiveRequests(setActive, 50, () => setFeedError(true));
    return () => {
      if (a) a();
      if (b) b();
    };
  }, [demoMode]);
  const displayOpen = demoMode ? getDemoAdminRequests().filter((item) => item.status === 'requested') : (open ?? []);
  const displayActive = demoMode ? getDemoAdminRequests().filter((item) => ['accepted', 'on-the-way', 'arrived', 'service'].includes(item.status)) : (active ?? []);
  const inService = displayActive.filter((r) => r.status === 'service').length;
  const loadingOpen = !demoMode && open === null;
  const loadingActive = !demoMode && active === null;
  return (
    <RequireAdmin>
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Dispatch"
          description="Read-only monitoring of open offers and live assignments. Matching, rematching and reassignment are executed by the server-side dispatch service."
        />
        {feedError && !demoMode ? (
          <ErrorState title="Dispatch data unavailable" description="Open requests and active assignments could not be loaded. Figures are unknown, not zero." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <DispatchStat
                label="Open offers"
                value={loadingOpen ? '—' : String(displayOpen.length)}
                helper="Awaiting a mechanic accept"
                icon="inbox"
                tone="warning"
              />
              <DispatchStat
                label="Active assignments"
                value={loadingActive ? '—' : String(displayActive.length)}
                helper="Accepted through service"
                icon="route"
                tone="brand"
              />
              <DispatchStat
                label="In service"
                value={loadingActive ? '—' : String(inService)}
                helper="Work started on site"
                icon="wrench"
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
              <DispatchPanel
                title="Open offers"
                count={loadingOpen ? null : displayOpen.length}
                description="Offers held by eligible mechanics for 120 seconds."
                loading={loadingOpen}
                empty={displayOpen.length === 0}
              >
                {displayOpen.map((r) => <DispatchRow key={r.id} request={r} kind="open" demoMode={demoMode} />)}
              </DispatchPanel>
              <DispatchPanel
                title="Active assignments"
                count={loadingActive ? null : displayActive.length}
                description="Jobs accepted by a mechanic and not yet closed."
                loading={loadingActive}
                empty={displayActive.length === 0}
              >
                {displayActive.map((r) => <DispatchRow key={r.id} request={r} kind="active" demoMode={demoMode} />)}
              </DispatchPanel>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-steel-500">
              Dispatch authority lives in the server-side offer transaction — the client cannot accept, rematch or reassign a request.
            </p>
          </>
        )}
      </div>
    </RequireAdmin>
  );}
export function AuditPage() {
  const { demoMode } = useAuth();
  const [recent, setRecent] = useState<AdminRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  useEffect(() => {
    if (demoMode) {
      setRecent(getDemoAdminRequests().slice(0, 20));
      setFeedError(false);
      return;
    }
    const unsub = watchAllRequests(setRecent, 'all', 20, () => setFeedError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode]);
  const displayRecent = demoMode ? getDemoAdminRequests().slice(0, 20) : (recent ?? []);
  return (
    <RequireAdmin>
      <div className="mx-auto max-w-4xl">
        <PageHeader title="System activity" description="Recent request transitions, derived from live data. No records are invented." />
        {feedError && !demoMode ? (
          <ErrorState title="Activity unavailable" description="Recent request activity could not be loaded." />
        ) : recent === null ? (
          <LoadingState label="Loading activity…" />
        ) : displayRecent.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="There is no dedicated audit log collection in this phase — approval and claim changes are recorded in Cloud Functions logs. Request transitions will appear here once traffic exists."
          />
        ) : (
          <Card>
            {demoMode && <p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">Demo activity only — these examples are not immutable security events.</p>}
            <ul className="grid gap-1.5">
              {displayRecent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-steel-300">
                    <span className="font-mono text-cream">{requestRef(r.id)}</span> · {r.problemText.slice(0, 44)}
                    {r.mechanicName ? ` · ${r.mechanicName}` : ''}
                  </span>
                  <Badge tone={toneFor(r.status)}>{r.status}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-steel-400">
              Approval and claim operations are recorded in Cloud Functions logs (operator view). A dedicated immutable audit trail is a later-phase item.
            </p>
          </Card>
        )}
      </div>
    </RequireAdmin>
  );}