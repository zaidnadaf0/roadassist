import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RequireAdmin } from '@/components/RequireAdmin';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { watchAllRequests, type AdminRequest } from '@/lib/admin';
import { getVehicle, watchRequest, type RequestStatus, type ServiceRequest, type Vehicle } from '@/lib/customer';
import { DEMO_CUSTOMER_VEHICLES, getDemoAdminRequests } from '@/lib/fixtures';

const FILTERS: (RequestStatus | 'all')[] = ['all', 'requested', 'accepted', 'on-the-way', 'arrived', 'service', 'completed', 'cancelled'];

function toneFor(s: RequestStatus): 'success' | 'danger' | 'warning' | 'brand' | 'neutral' {
  if (s === 'completed') return 'success';
  if (s === 'cancelled') return 'danger';
  if (s === 'requested') return 'warning';
  return 'brand';
}

export function RequestsPage() {
  const { demoMode } = useAuth();
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [items, setItems] = useState<AdminRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);

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

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Requests" description="Live service requests across the network. Viewing only — assignment and dispatch arrive in a later phase." />
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs ${filter === f ? 'bg-safety-500/15 font-semibold text-safety-300' : 'text-steel-300 hover:text-cream'}`}
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
          <div className="grid gap-2">
            {displayItems.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-cream">{r.problemText}</p>
                    <p className="font-mono text-xs text-steel-500">
                      #{r.id.slice(-6).toUpperCase()} · {r.problemCategory ?? 'general'}
                      {r.mechanicName ? ` · ${r.mechanicName}` : ' · unassigned'}
                      {r.amountCents != null ? ` · ₹${(r.amountCents / 100).toFixed(0)}` : ''}
                    </p>
                  </div>
                  <Badge tone={toneFor(r.status)}>{r.status}</Badge>
                </div>
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
  );
}

export function AdminRequestDetailPage() {
  const { id = '' } = useParams();
  const { demoMode } = useAuth();
  const [request, setRequest] = useState<ServiceRequest | null | 'loading' | 'missing'>('loading');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (demoMode && id.startsWith('demo-')) {
      const item = getDemoAdminRequests().find((request) => request.id === id);
      const customerRecord = DEMO_CUSTOMER_VEHICLES.find((vehicle) => vehicle.id === item?.vehicleId);
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
  }, [request, demoMode]);

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
                <p className="font-mono text-xs text-steel-400">#{request.id.slice(-6).toUpperCase()}</p>
                <Badge tone={toneFor(request.status)}>{request.status}</Badge>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Customer</dt><dd className="font-mono text-cream">{request.customerId}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Problem</dt><dd className="text-right font-medium text-cream">{request.problemText}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Vehicle</dt><dd className="text-right font-medium text-cream">{vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : 'Unavailable'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Mechanic</dt><dd className="font-medium text-cream">{request.mechanicName ?? request.mechanicId ?? 'Unassigned'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-steel-400">Coordinates</dt><dd className="font-mono text-xs text-cream">{request.customerLat.toFixed(5)}, {request.customerLng.toFixed(5)}</dd></div>
                {request.amountCents != null && <div className="flex justify-between"><dt className="text-steel-400">Amount</dt><dd className="font-medium text-cream">₹{(request.amountCents / 100).toFixed(0)}</dd></div>}
                {request.rating != null && <div className="flex justify-between"><dt className="text-steel-400">Rating</dt><dd className="font-medium text-cream">★ {request.rating}</dd></div>}
              </dl>
            </Card>
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}

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
    const b = watchAllRequests(
      (items) => setActive(items.filter((item) => ['accepted', 'on-the-way', 'arrived', 'service'].includes(item.status))),
      'all',
      50,
      () => setFeedError(true),
    );
    return () => {
      if (a) a();
      if (b) b();
    };
  }, [demoMode]);

  const displayOpen = demoMode ? getDemoAdminRequests().filter((item) => item.status === 'requested') : (open ?? []);
  const displayActive = demoMode ? getDemoAdminRequests().filter((item) => ['accepted', 'on-the-way', 'arrived', 'service'].includes(item.status)) : (active ?? []);

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Dispatch" description="Read-only operations view: open offers and active assignments. Matching and reassignment arrive in a later phase." />
        {feedError && !demoMode ? (
          <ErrorState title="Dispatch data unavailable" description="Open requests and active assignments could not be loaded." />
        ) : <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Open offers ({open === null ? '…' : displayOpen.length})</p>
            {open === null ? (
              <LoadingState label="Loading open offers…" />
            ) : displayOpen.length === 0 ? (
              <p className="mt-2 text-sm text-steel-300">No open offers.</p>
            ) : (
              <ul className="mt-2 grid gap-1.5">
                {displayOpen.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="font-medium text-cream">#{r.id.slice(-6).toUpperCase()}</span>
                    <span className="text-steel-300"> · {r.problemText.slice(0, 48)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Active assignments ({active === null ? '…' : displayActive.length})</p>
            {active === null ? (
              <LoadingState label="Loading assignments…" />
            ) : displayActive.length === 0 ? (
              <p className="mt-2 text-sm text-steel-300">Nothing assigned right now.</p>
            ) : (
              <ul className="mt-2 grid gap-1.5">
                {displayActive.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="font-medium text-cream">#{r.id.slice(-6).toUpperCase()}</span>
                    <span className="text-steel-300"> → {r.mechanicName ?? r.mechanicId ?? 'unknown'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>}
      </div>
    </RequireAdmin>
  );
}

export function AuditPage() {
  const { demoMode } = useAuth();
  const [recent, setRecent] = useState<AdminRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (demoMode) {
      setRecent(getDemoAdminRequests().slice(0, 5));
      setFeedError(false);
      return;
    }
    const unsub = watchAllRequests(setRecent, 'all', 20, () => setFeedError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode]);

  const displayRecent = demoMode ? getDemoAdminRequests().slice(0, 5) : (recent ?? []);

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
                    <span className="font-mono text-cream">#{r.id.slice(-6).toUpperCase()}</span> · {r.problemText.slice(0, 44)}
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
  );
}
