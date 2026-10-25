import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { RequireMechanic } from '@/components/RequireMechanic';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { LIVE_THROTTLE, useWatchPosition } from '@/lib/geolocation';
import { watchMyActiveJobs } from '@/lib/mechanic';

// Lazy: Leaflet touches `window` at import; keep it out of node-evaluated modules.
const MapView = lazy(() =>
  import('@/components/map/MapView').then((m) => ({ default: m.MapView })),
);
import { watchRequest } from '@/lib/customer';
import {
  NEXT_STATUS,
  RELEASABLE,
  advanceJob,
  pushMechanicLocation,
  pushMechanicLocationToRequest,
  releaseJob,
  type ServiceRequest,
} from '@/lib/mechanic';
import { advanceDemoRequest, getDemoMechanicActive, getDemoMechanicHistory, getDemoMechanicIncoming } from '@/lib/fixtures';

const LABEL: Record<string, string> = {
  accepted: 'Accepted',
  'on-the-way': 'On the way',
  arrived: 'Arrived',
  service: 'Service',
  completed: 'Completed',
};

function JobDetail({ job, uid, demoMode, onDemoUpdate }: { job: ServiceRequest; uid: string; demoMode: boolean; onDemoUpdate: (job: ServiceRequest) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');

  const next = NEXT_STATUS[job.status];
  const mine = demoMode ? job.id.startsWith('demo-') : job.mechanicId === uid;
  const releasable = mine && RELEASABLE.includes(job.status);
  const tracking = !demoMode && mine && ['accepted', 'on-the-way', 'arrived', 'service'].includes(job.status);
  const [geo] = useWatchPosition({ enabled: tracking, ...LIVE_THROTTLE });
  const [pushNote, setPushNote] = useState<string | null>(null);

  // Live push: own profile + assigned request, throttled by the hook.
  // Stops automatically when the job leaves a live state or unmounts.
  useEffect(() => {
    const fix = geo.coords;
    if (!tracking || !fix || !mine) return;
    let cancelled = false;
    void (async () => {
      const okReq = await pushMechanicLocationToRequest(job.id, fix.lat, fix.lng);
      const okProfile = await pushMechanicLocation(uid, fix.lat, fix.lng);
      if (!cancelled && (!okReq || !okProfile)) {
        setPushNote('Live location failed to save — retrying on the next fix.');
      } else if (!cancelled) {
        setPushNote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tracking, geo.coords, job.id, mine, uid]);

  async function advance() {
    if (!next) return;
    let extra: { amountCents?: number; durationMin?: number } | undefined;
    if (next === 'completed') {
      // Validate billing before submit: a typo like "4 9" would silently
      // become NaN and the transaction would complete with no amount.
      const cents = amount.trim() ? Math.round(Number(amount) * 100) : null;
      const mins = duration.trim() ? Math.round(Number(duration)) : null;
      if ((cents != null && !Number.isFinite(cents)) || (mins != null && !Number.isFinite(mins))) {
        setNotice('Billing fields must be plain numbers (e.g. 499.00 and 25). Nothing was submitted.');
        return;
      }
      extra = { ...(cents != null ? { amountCents: cents } : {}), ...(mins != null ? { durationMin: mins } : {}) };
    }
    setBusy(true);
    if (demoMode) {
      const updated = advanceDemoRequest(job.id, next);
      setBusy(false);
      if (updated) {
        onDemoUpdate(updated);
        setNotice(`Demo status → ${LABEL[next]}. The sample customer view is updated locally.`);
      } else setNotice('Demo job could not be updated.');
      return;
    }
    const res = await advanceJob(job.id, next, extra);
    setBusy(false);
    setNotice(
      res === 'advanced' ? `Status → ${LABEL[next]}.`
      : res === 'invalid_transition' ? 'That step is not allowed from here.'
      : res === 'terminal' ? 'This job is already closed.'
      : res === 'forbidden' ? 'Not permitted.'
      : 'Could not update. Try again.',
    );
    if (res === 'advanced' && next === 'completed') navigate('/m/history', { replace: true });
  }

  async function release() {
    if (demoMode) {
      setReleasing(false);
      setNotice('Demo release recorded locally; the sample offer is available again after refresh.');
      return;
    }
    if (!reason.trim()) {
      setNotice('Give a short reason so operations can re-dispatch cleanly.');
      return;
    }
    setBusy(true);
    const res = await releaseJob(job.id, uid, reason);
    setBusy(false);
    setReleasing(false);
    setNotice(
      res === 'released' ? 'Released back to the queue.'
      : res === 'not_assigned' ? 'This job is no longer assigned to you.'
      : res === 'invalid_state' ? 'Cannot release from this state.'
      : res === 'forbidden' ? 'Not permitted.'
      : 'Could not release. Try again.',
    );
    if (res === 'released') navigate('/m/requests', { replace: true });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">#{job.id.slice(-6).toUpperCase()}</p>
            <p className="mt-1 font-bold text-cream">{job.problemText}</p>
          </div>
          <Badge tone="brand">{job.status}</Badge>
        </div>
        <dl className="mt-3 grid gap-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-steel-400">Category</dt><dd className="font-medium text-cream">{job.problemCategory ?? 'general'}</dd></div>
          <div className="flex justify-between"><dt className="text-steel-400">Customer location</dt><dd className="font-mono text-xs text-cream">{typeof job.customerLat === 'number' ? job.customerLat.toFixed(4) : '—'}, {typeof job.customerLng === 'number' ? job.customerLng.toFixed(4) : '—'}</dd></div>
          {job.etaMin != null && (
            <div className="flex justify-between"><dt className="text-steel-400">Committed ETA</dt><dd className="font-medium text-cream">{job.etaMin} min</dd></div>
          )}
        </dl>
        {!mine && (
          <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-cream">
            Assigned to another mechanic. You can view details but cannot change this job.
          </p>
        )}
      </Card>

      <Card>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Job map</p>
        <div className="mt-2 overflow-hidden rounded-xl">
          <Suspense
            fallback={
              <div className="map-grid grid aspect-[16/10] w-full place-items-center rounded-xl border border-line-soft" role="status">
                <p className="text-sm text-steel-300">Loading map…</p>
              </div>
            }
          >
            <MapView
              center={[job.customerLat, job.customerLng]}
              zoom={13}
              userPosition={geo.coords ? [geo.coords.lat, geo.coords.lng] : null}
              userLabel="You"
              mechanicMarkers={[{ id: 'customer', position: [job.customerLat, job.customerLng], label: 'Customer', tone: 'azure' }]}
            />
          </Suspense>
        </div>
        {mine && tracking && (
          <p className="mt-2 text-xs text-steel-400" role="status">
            {geo.status === 'granted' && geo.coords
              ? `Sharing live location (±${geo.coords.accuracy != null ? Math.round(geo.coords.accuracy) : '–'} m). Stops when the job closes.`
              : geo.status === 'requesting'
                ? 'Acquiring location…'
                : geo.status !== 'idle'
                  ? `${geo.error ?? 'Location unavailable.'} Status updates still work.`
                  : 'Location sharing starts with your next fix.'}
          </p>
        )}
        {pushNote && (
          <p role="alert" className="mt-2 text-xs text-warning">{pushNote}</p>
        )}
        {!tracking && (
          <p className="mt-2 text-xs text-steel-400">Location sharing is off — no active leg on this job.</p>
        )}
      </Card>

      {notice && (
        <p role="status" className="rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-cream">{notice}</p>
      )}

      {mine && next && (
        <Card>
          <p className="font-semibold text-cream">Next step: {LABEL[next]}</p>
          {next === 'completed' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Amount charged (₹, optional)" hint="Recorded on the receipt. Only on completion.">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 499" inputMode="decimal" />
              </Field>
              <Field label="Minutes on site (optional)">
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 25" inputMode="numeric" />
              </Field>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={advance}>{busy ? 'Saving…' : `Mark ${LABEL[next]}`}</Button>
            {releasable && (
              <Button variant="secondary" onClick={() => setReleasing((v) => !v)}>Release job</Button>
            )}
          </div>
          {releasing && releasable && (
            <div className="mt-3 grid gap-2">
              <Field label="Release reason (visible to operations)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vehicle breakdown, out of coverage…" />
              </Field>
              <div><Button size="sm" variant="danger" disabled={busy} onClick={release}>Confirm release</Button></div>
            </div>
          )}
        </Card>
      )}

      <p>
        <Link to="/m/requests" className="text-sm font-medium text-safety-400 hover:text-safety-300">← Back to queue</Link>
      </p>
    </div>
  );
}

export function MechanicJobPage() {
  const { id } = useParams();
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [job, setJob] = useState<ServiceRequest | null | 'loading' | 'missing' | 'error'>('loading');
  const [active, setActive] = useState<ServiceRequest[] | null>(null);

  useEffect(() => {
    if (!id) return;
    if (demoMode && id.startsWith('demo-')) {
      const demoJob = [...getDemoMechanicActive(), ...getDemoMechanicIncoming(), ...getDemoMechanicHistory()].find((item) => item.id === id);
      setJob(demoJob ?? 'missing');
      return;
    }
    setJob('loading');
    const unsub = watchRequest(id, (r) => setJob(r ?? 'missing'), () => setJob('error'));
    return () => {
      if (unsub) unsub();
    };
  }, [id, demoMode]);

  useEffect(() => {
    if (id || !uid) return;
    if (demoMode) {
      setActive(getDemoMechanicActive());
      return;
    }
    const unsub = watchMyActiveJobs(uid, setActive);
    return () => {
      if (unsub) unsub();
    };
  }, [id, uid, demoMode]);

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-3xl">
        <PageHeader title={id ? 'Job' : 'Active job'} description="Status progression, release, and completion with billing." />
        {id ? (
          job === 'loading' ? <LoadingState label="Loading job…" />
          : job === 'error' ? <ErrorState title="Job unavailable" description="The job could not be loaded. Check your connection and try again." />
          : job === 'missing' || job === null ? <ErrorState title="Job not found" description="It may have been reassigned or you may lack access." />
          : <JobDetail job={job} uid={uid} demoMode={demoMode} onDemoUpdate={setJob} />
        ) : active === null ? (
          <LoadingState label="Finding your active job…" />
        ) : active.length === 0 ? (
          <EmptyState title="No active job" description="Accepted work appears here. Check the queue for open offers." />
        ) : (
          <div className="grid gap-2">
            {active.map((j) => (
              <Link key={j.id} to={`/m/job/${j.id}`} className="flex items-center justify-between rounded-xl border border-line-soft px-4 py-3 hover:border-line-strong">
                <span className="truncate font-medium text-cream">{j.problemText}</span>
                <Badge tone="brand">{j.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </RequireMechanic>
  );
}
