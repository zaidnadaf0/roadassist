import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { RequireMechanic } from '@/components/RequireMechanic';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { watchIncoming, type ServiceRequest } from '@/lib/mechanic';
import { acceptViaDispatch, declineViaDispatch, offerCountdown, watchMyOffers, type OfferView } from '@/lib/dispatch';
import { acceptDemoOffer, declineDemoOffer, getDemoMechanicIncoming, getDemoOfferHistory } from '@/lib/fixtures';
import { requestRef } from '@/lib/reference';

function OfferCard({ job, offer, demoMode, onDone }: { job: ServiceRequest; offer?: OfferView; demoMode: boolean; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  // Ticking clock for the countdown + expiry advisory. Pure render: the
  // timestamp is produced inside the effect, never during render.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (!offer) return;
    const update = () => setNowMs(Date.now());
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [offer]);
  const countdown = nowMs != null && offer ? offerCountdown(offer.expiresAtMs ?? null, nowMs) : null;
  // Client-clock advisory only — the callable's server-clock check remains
  // the authority — but a stale pending offer must not display as live.
  const expired = offer != null && typeof offer.expiresAtMs === 'number' && nowMs != null && offer.expiresAtMs <= nowMs;

  async function accept() {
    setBusy(true);
    if (demoMode) {
      acceptDemoOffer(job.id);
      setBusy(false);
      onDone(`Demo offer accepted for ${requestRef(job.id)}. The sample job is now ready to open.`);
      return;
    }
    const res = await acceptViaDispatch(job.id);
    setBusy(false);
    onDone(
      res === 'accepted' ? `Accepted ${requestRef(job.id)}.`
      : res === 'expired' || res === 'offer-expired' ? 'Offer expired before it could be claimed.'
      : res === 'alreadyTaken' ? 'Already claimed by another mechanic.'
      : res === 'offer-missing' ? 'No live offer for you on this request.'
      : res === 'ineligible' ? 'No longer eligible for this offer.'
      : res === 'forbidden' ? 'Not permitted (approval or rules check failed).'
      : 'Could not accept. Try again.',
    );
  }

  async function decline() {
    setBusy(true);
    if (demoMode) {
      declineDemoOffer(job.id);
      setBusy(false);
      onDone('Demo offer declined. The sample queue is updated locally.');
      return;
    }
    const res = await declineViaDispatch(job.id);
    setBusy(false);
    onDone(res === 'declined' ? 'Declined. It stays open for the network.' : 'Could not decline. Try again.');
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2" data-testid="offer-card">
        <div className="min-w-0">
          <p className="font-bold text-cream" data-testid="offer-problem">{job.problemText}</p>
          <p className="mt-0.5 font-mono text-xs text-steel-400">
            {requestRef(job.id)} · {job.problemCategory ?? 'general'}
            {offer ? <> · {expired ? 'expired — awaiting dispatch cleanup' : `offer ${countdown ?? '—'} left`}</> : ' · open request'}
          </p>
        </div>
        <Badge tone={offer ? 'brand' : 'warning'}>{offer ? 'offered to you' : 'requested'}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button data-testid={`offer-accept-${job.id}`} size="sm" disabled={busy || expired} onClick={accept}>{busy ? 'Working…' : 'Accept'}</Button>
        <Button data-testid={`offer-decline-${job.id}`} size="sm" variant="secondary" disabled={busy || expired} onClick={decline}>Decline</Button>
        <Link to={`/m/job/${job.id}`} className="inline-flex h-9 items-center rounded-lg border border-line-soft px-3.5 text-sm font-medium hover:border-line-strong">
          Details
        </Link>
      </div>
    </Card>
  );
}

export function MechanicRequestsPage() {
  const { demoMode, user } = useAuth();
  const uid = user?.uid ?? '';
  const [jobs, setJobs] = useState<ServiceRequest[] | null>(null);
  const [offers, setOffers] = useState<OfferView[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [offersError, setOffersError] = useState(false);
  const [offersRetry, setOffersRetry] = useState(0);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setJobs(getDemoMechanicIncoming());
      setFeedError(false);
      return;
    }
    setFeedError(false);
    const unsub = watchIncoming(
      (list) => setJobs(list.filter((j) => !(j.declinedBy ?? []).includes(uid))),
      uid,
      () => {
        setJobs([]);
        setFeedError(true);
      },
    );
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode]);
  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setOffers(getDemoOfferHistory().filter((item) => item.status === 'pending'));
      setOffersError(false);
      return;
    }
    setOffersError(false);
    const unsub = watchMyOffers(uid, setOffers, () => setOffersError(true));
    return () => {
      if (unsub) unsub();
    };
  }, [uid, demoMode, offersRetry]);

  const displayJobs = demoMode ? getDemoMechanicIncoming() : (jobs ?? []);
  const displayOffers = demoMode ? getDemoOfferHistory().filter((item) => item.status === 'pending') : (offers ?? []);
  const offerByRequest = new Map(displayOffers.map((o) => [o.requestId, o]));
  // Offer-first ordering: addressed offers top, then open requests (deduped).
  const ordered = [...displayJobs].sort((a, b) => {
    const ao = offerByRequest.has(a.id) ? 0 : 1;
    const bo = offerByRequest.has(b.id) ? 0 : 1;
    return ao - bo;
  });

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Incoming requests" description="Open offers from the live queue. Accepting is first-valid-transaction — no reservation until it succeeds." />
        {demoMode && <DemoNotice>These offers are fictional. Accept and decline update only the isolated demo state in this browser.</DemoNotice>}
        {notice && (
          <p role="status" className="mb-4 rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-cream">{notice}</p>
        )}
        {!demoMode && offersError && (
          <ErrorState
            title="Offer feed unavailable"
            description="Your pending offers could not be loaded — countdowns and accept actions may be missing for open requests below. Check your connection and retry; accepting is never possible without a live offer."
            action={<Button size="sm" variant="secondary" onClick={() => setOffersRetry((n) => n + 1)}>Retry</Button>}
          />
        )}
        {jobs === null && !feedError ? (
          <LoadingState label="Loading queue…" />
        ) : feedError && !demoMode ? (
          <ErrorState title="Queue unavailable" description="The live feed failed. Offers already accepted are safe — check your connection and reopen this page." />
        ) : ordered.length === 0 ? (
          <EmptyState title="Queue is clear" description="No open offers right now. Stay available and check back — this list updates live." />
        ) : (
          <div className="grid gap-3">
            {ordered.map((j) => (
              <OfferCard key={j.id} job={j} offer={offerByRequest.get(j.id)} demoMode={demoMode} onDone={(message) => {
                setNotice(message);
                // Only demo state is reset here: in live mode the onSnapshot
                // listeners own the feed, and stamping demo fixtures over it
                // after a failed call would corrupt the real queue.
                if (demoMode) {
                  setJobs(getDemoMechanicIncoming());
                  setOffers(getDemoOfferHistory().filter((item) => item.status === 'pending'));
                }
              }} />
            ))}
          </div>
        )}
      </div>
    </RequireMechanic>
  );
}
