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
    <div className="map-grid grid aspect-[16/10] w-full place-items-center rounded-xl border border-line-soft" role="status">
      <p className="text-sm text-steel-300">Loading map…</p>
    </div>
  );
}
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, PageHeader, SectionHeading } from '@/components/ui';
import { cancelRequest, rateRequest, watchMyRequests, watchRequest, type RequestStatus, type ServiceRequest } from '@/lib/customer';
import { distanceKm } from '@/lib/geolocation';
import { acceptDemoOffer, advanceDemoRequest, getDemoCustomerRequests } from '@/lib/fixtures';

const TIMELINE = ['requested', 'accepted', 'on-the-way', 'arrived', 'service', 'completed'] as const;
const DEMO_NEXT_STATUS: Partial<Record<RequestStatus, RequestStatus>> = {
  accepted: 'on-the-way',
  'on-the-way': 'arrived',
  arrived: 'service',
  service: 'completed',
};

function demoActionLabel(status: RequestStatus): string | null {
  if (status === 'requested') return 'Mechanic accepts request';
  if (status === 'accepted') return 'Mechanic starts travel';
  if (status === 'on-the-way') return 'Mechanic marks arrived';
  if (status === 'arrived') return 'Mechanic starts service';
  if (status === 'service') return 'Mechanic completes service';
  return null;
}

function requestReference(id: string): string {
  return id === 'demo-request-pending' ? 'RA-DEMO-1001' : `RA-${id.slice(-6).toUpperCase()}`;
}

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onPick?.(n)}
          disabled={!onPick}
          className={`text-xl ${n <= value ? 'text-safety-400' : 'text-steel-500'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function TrackingView({ req, preview = false }: { req: ServiceRequest; preview?: boolean }) {
  const { user, demoRevision } = useAuth();
  const [cancelBusy, setCancelBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [rated, setRated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [offersPending, setOffersPending] = useState<number | null>(null);

  useEffect(() => {
    if (preview || req.status !== 'requested' || !user) {
      setOffersPending(null);
      return;
    }
    const unsub = watchRequestOffers(req.id, user.uid, (list) => setOffersPending(list.length));
    return () => {
      if (unsub) unsub();
    };
  }, [req.id, req.status, user, demoRevision, preview]);

  const idx = TIMELINE.indexOf(req.status as (typeof TIMELINE)[number]);
  const cancellable = ['requested', 'accepted', 'on-the-way', 'arrived'].includes(req.status);
  const straightLineKm = req.mechanicLat != null && req.mechanicLng != null
    ? distanceKm({ lat: req.customerLat, lng: req.customerLng }, { lat: req.mechanicLat, lng: req.mechanicLng })
    : null;
  const locationUpdatedAt = typeof req.mechanicLocationUpdatedAt === 'number' ? req.mechanicLocationUpdatedAt : null;
  // Ticking clock: staleness stays honest between snapshot emissions and the
  // render stays pure (Date.now() only inside effects/intervals).
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const locationStale = locationUpdatedAt != null && nowMs > 0 && nowMs - locationUpdatedAt > 5 * 60_000;

  async function onCancel() {
    if (preview) return;
    if (!window.confirm('Cancel this request? The mechanic is released immediately.')) return;
    setCancelBusy(true);
    const res = await cancelRequest(req.id);
    setCancelBusy(false);
    setNotice(res === 'cancelled' ? 'Request cancelled.' : res === 'too_late' ? 'Too late to cancel — it already finished.' : 'Could not cancel. Try again.');
  }

  async function onRate() {
    if (preview) return;
    const ok = await rateRequest(req.id, rating, comment);
    setNotice(ok ? 'Thanks for the feedback.' : 'Could not save your rating.');
    if (ok) setRated(true);
  }

  function onDemoWorkflowAction() {
    if (!preview || req.id !== 'demo-request-pending') return;
    if (req.status === 'requested') {
      const accepted = acceptDemoOffer(req.id);
      setNotice(accepted ? 'Demo mechanic accepted the request. The next action is to start travel.' : 'The demo offer is no longer available. Reset Demo mode and try again.');
      return;
    }
    const next = DEMO_NEXT_STATUS[req.status];
    if (!next) return;
    const updated = advanceDemoRequest(req.id, next);
    setNotice(updated ? `Demo workflow advanced to ${next}. The customer, mechanic and admin demo views are synchronized.` : 'The demo workflow could not be advanced.');
  }

  const demoAction = preview && req.id === 'demo-request-pending' ? demoActionLabel(req.status) : null;

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">{requestReference(req.id)}</p>
            <p className="mt-1 font-bold text-cream">{req.problemText}</p>
          </div>
          <Badge tone={req.status === 'completed' ? 'success' : req.status === 'cancelled' ? 'danger' : 'brand'}>{req.status}</Badge>
        </div>
        <ol className="mt-4 grid gap-2">
          {TIMELINE.map((s, i) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${idx >= 0 && i <= idx ? 'bg-safety-400' : 'bg-graphite-soft'}`} />
              <span className={idx >= 0 && i <= idx ? 'text-cream' : 'text-steel-500'}>{s}</span>
              {idx === i && <span className="ml-auto font-mono text-xs text-safety-400">now</span>}
            </li>
          ))}
        </ol>
      </Card>

      {preview && (
        <Card className="border-safety-500/20 bg-safety-500/5">
          <SectionHeading title="Demo presentation flow" description="Use the same sample booking across three role sessions." />
          <ol className="grid gap-2 text-sm text-steel-300">
            <li><span className="font-semibold text-safety-400">1. Customer</span> submits this demo booking and watches the request status.</li>
            <li><span className="font-semibold text-safety-400">2. Mechanic</span> opens Incoming requests, accepts the offer, then advances the job.</li>
            <li><span className="font-semibold text-safety-400">3. Admin</span> opens Dispatch and Analytics to see the same request change through the workflow.</li>
          </ol>
          <p className="mt-3 text-xs text-steel-400">Open each role in its authorized account. Demo actions synchronize through this browser only; no Firebase record is changed.</p>
          {demoAction && <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
            <Button onClick={onDemoWorkflowAction}>{demoAction}</Button>
            <span className="text-xs text-steel-400">Demo-only mechanic action · current stage: {req.status}</span>
          </div>}
          {!demoAction && req.status === 'completed' && <p className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success-300">Demo booking completed. Open the mechanic history or admin reports to show the final record and illustrative receipt.</p>}
        </Card>
      )}

      <Card>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Mechanic</p>
        {req.mechanicName ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-cream">{req.mechanicName}</p>
            {req.mechanicPhone && !preview ? (
              <a href={`tel:${req.mechanicPhone}`} className="inline-flex h-9 items-center rounded-lg bg-graphite-soft px-4 text-sm font-semibold hover:border-line-strong">
                Call
              </a>
            ) : (
              <span className="text-xs text-steel-400">Number appears once assigned</span>
            )}
          </div>
        ) : req.status === 'requested' ? (
          <p className="mt-1 text-sm text-steel-300">
            {offersPending === null
              ? 'Finding a mechanic…'
              : offersPending > 0
                ? `${offersPending} nearby mechanic${offersPending > 1 ? 's' : ''} notified — first valid accept wins.`
                : 'Finding a mechanic… no offers out right now, stay on this screen.'}
          </p>
        ) : (
          <p className="mt-1 text-sm text-steel-300">Awaiting match — eligible mechanics hold a 2-minute offer.</p>
        )}
        {req.mechanicLat != null && req.mechanicLng != null && req.status !== 'completed' && req.status !== 'cancelled' ? (
          <div className="mt-3 overflow-hidden rounded-xl">
            <Suspense fallback={<MapFallback />}>
              <MapView
                center={[req.customerLat, req.customerLng]}
                zoom={13}
                userPosition={[req.customerLat, req.customerLng]}
                userLabel="You"
                mechanicMarkers={[{ id: 'mech', position: [req.mechanicLat, req.mechanicLng], label: req.mechanicName ?? 'Mechanic', tone: 'aqua' }]}
                line={[[req.mechanicLat, req.mechanicLng], [req.customerLat, req.customerLng]]}
              />
            </Suspense>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-steel-400">
              <span>Approx. straight-line distance: {straightLineKm == null ? '—' : `${straightLineKm.toFixed(1)} km`}</span>
              <span>{locationStale ? 'Location may be stale — waiting for a fresh GPS fix.' : 'Road route and traffic ETA are not calculated.'}</span>
            </div>
          </div>
        ) : (
          req.mechanicName != null && req.status !== 'completed' && req.status !== 'cancelled' && (
            <p className="mt-2 text-sm text-steel-300">Waiting for mechanic location — their live pin appears here once their device shares it.</p>
          )
        )}
      </Card>

      {notice && (
        <p role="status" className="rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-cream">{notice}</p>
      )}

      {cancellable && !preview && (
        <Button variant="ghost" disabled={cancelBusy} onClick={onCancel}>{cancelBusy ? 'Cancelling…' : 'Cancel request'}</Button>
      )}

      {req.status === 'completed' && !preview && !rated && req.rating == null && (
        <Card>
          <p className="font-semibold text-cream">Rate this service</p>
          <div className="mt-2"><Stars value={rating} onPick={setRating} /></div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment…" rows={2} className="mt-2 w-full rounded-xl border border-line-soft bg-grease-soft px-3 py-2 text-sm text-cream" />
          <div className="mt-2"><Button size="sm" onClick={onRate}>Submit rating</Button></div>
        </Card>
      )}
      {req.rating != null && (
        <Card>
          <p className="font-semibold text-cream">Your rating</p>
          <div className="mt-1"><Stars value={req.rating} /></div>
          {req.comment && <p className="mt-1 text-sm text-steel-300">{req.comment}</p>}
        </Card>
      )}
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

  // /track without id: jump to the live request, then use the same labelled
  // preview records as the dashboard when no live records exist.
  const usingDemo = !id && demoMode;
  const displayMine = useMemo(
    () => (usingDemo ? getDemoCustomerRequests() : (mine ?? [])),
    [usingDemo, mine],
  );
  const live = useMemo(() => displayMine.find((r) => ['requested', 'accepted', 'on-the-way', 'arrived', 'service'].includes(r.status)) ?? null, [displayMine]);

  useEffect(() => {
    if (!id && live) navigate(`/track/${live.id}`, { replace: true });
  }, [id, live, navigate]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Track request" description="Live status, mechanic, and receipt for your rescue." />
      {id ? (
        req === 'loading' ? <LoadingState label="Loading request…" />
        : req === 'error' ? <ErrorState title="Tracking unavailable" description="This request could not be loaded. Check your connection and try again." />
        : req === 'missing' || req === null ? <ErrorState title="Request not found" description="It may belong to another account or was removed." />
        : <>
          {req.id.startsWith('demo-') && <DemoNotice>Demo preview: this tracking view uses sample records so you can see the connected customer journey. Cancel, rating and phone actions are disabled until a live request is selected.</DemoNotice>}
          <TrackingView req={req} preview={req.id.startsWith('demo-')} />
        </>
      ) : mine === null ? (
        <LoadingState label="Finding your requests…" />
      ) : displayMine.length === 0 ? (
        <EmptyState title="No requests yet" description="Place your first request to track it here." />
      ) : (
        <div className="grid gap-3">
          {usingDemo && <DemoNotice>Demo tracking uses fixed sample coordinates and a simulated mechanic location. It is not live GPS.</DemoNotice>}
          {!usingDemo && feedError && <ErrorState title="Tracking unavailable" description="Your live request list could not be loaded. Retry from live mode or switch to Demo mode in Settings." />}
          {displayMine.map((r) => (
            <Link key={r.id} to={`/track/${r.id}`} className="flex items-center justify-between rounded-xl border border-line-soft px-4 py-3 hover:border-line-strong">
              <span className="truncate font-medium text-cream">{r.problemText}</span>
              <Badge tone={r.status === 'completed' ? 'success' : 'brand'}>{r.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
