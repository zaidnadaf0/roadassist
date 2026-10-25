import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { downloadCsv, toCsv } from '@/lib/analytics';
import { getVehicle, watchMyRequests, watchRequest, type ServiceRequest, type Vehicle } from '@/lib/customer';
import { DEMO_CUSTOMER_VEHICLES, getDemoCustomerRequests } from '@/lib/fixtures';

export function HistoryPage() {
  const { demoMode, user } = useAuth();
  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (demoMode) {
      setItems(getDemoCustomerRequests());
      setFeedError(false);
      return;
    }
    setFeedError(false);
    const unsub = watchMyRequests(user.uid, setItems, () => {
      setItems([]);
      setFeedError(true);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [user, demoMode]);

  const displayItems = demoMode ? getDemoCustomerRequests() : (items ?? []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Service history" description="Every request with its receipt and rating." />
      {items === null ? (
        <LoadingState label="Loading history…" />
      ) : feedError ? (
        <ErrorState title="History unavailable" description="Your service history could not be loaded. Check your connection and try again." />
      ) : displayItems.length === 0 ? (
        <EmptyState title="No history yet" description="Completed and cancelled requests will appear here." />
      ) : (
        <>
          <div className="mb-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  'roadassist-my-history.csv',
                  toCsv(
                    ['id', 'status', 'category', 'mechanic', 'amount_inr', 'rating'],
                    displayItems.map((r) => [
                      r.id,
                      r.status,
                      r.problemCategory ?? '',
                      r.mechanicName ?? '',
                      r.amountCents != null ? (r.amountCents / 100).toFixed(0) : '',
                      r.rating ?? '',
                    ]),
                  ),
                )
              }
            >
              Export my history CSV
            </Button>
          </div>
          <ul className="grid gap-2">
          {displayItems.map((r) => (
            <li key={r.id}>
              <Link to={`/history/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft px-4 py-3 hover:border-line-strong">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-cream">{r.problemText}</span>
                  <span className="font-mono text-xs text-steel-400">#{r.id.slice(-6).toUpperCase()} · {r.mechanicName ?? 'unassigned'}</span>
                </span>
                <Badge tone={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'brand'}>{r.status}</Badge>
              </Link>
            </li>
          ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function HistoryDetailPage() {
  const { id = '' } = useParams();
  const { demoMode, user } = useAuth();
  const [req, setReq] = useState<ServiceRequest | null | 'loading' | 'missing' | 'error'>('loading');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (demoMode && id.startsWith('demo-')) {
      setReq(getDemoCustomerRequests().find((item) => item.id === id) ?? 'missing');
      return;
    }
    const unsub = watchRequest(id, (r) => setReq(r ?? 'missing'), () => setReq('error'));
    return () => {
      if (unsub) unsub();
    };
  }, [id, demoMode]);

  useEffect(() => {
    if (!user || req === 'loading' || req === 'missing' || req === 'error' || req === null) return;
    if (demoMode && req.id.startsWith('demo-')) {
      setVehicle(DEMO_CUSTOMER_VEHICLES.find((item) => item.id === req.vehicleId) ?? null);
      return;
    }
    let cancelled = false;
    getVehicle(req.vehicleId)
      .then((item) => {
        if (!cancelled) setVehicle(item);
      })
      .catch(() => {
        if (!cancelled) setVehicle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [req, user, demoMode]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Receipt" description="Service record, charges, and your rating." />
      {req === 'loading' ? (
        <LoadingState label="Loading receipt…" />
      ) : req === 'error' ? (
        <ErrorState title="Receipt unavailable" description="The service record could not be loaded. Check your connection and try again." />
      ) : req === 'missing' || req === null ? (
        <ErrorState title="Not found" description="This record may belong to another account." />
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-steel-400">#{req.id.slice(-6).toUpperCase()}</p>
            <Badge tone={req.status === 'completed' ? 'success' : req.status === 'cancelled' ? 'danger' : 'brand'}>{req.status}</Badge>
          </div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-steel-400">Problem</dt><dd className="text-right font-medium text-cream">{req.problemText}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-steel-400">Vehicle</dt><dd className="text-right font-medium text-cream">{vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : 'Unavailable'}</dd></div>
            {req.problemCategory && <div className="flex justify-between"><dt className="text-steel-400">Category</dt><dd className="font-medium text-cream">{req.problemCategory}</dd></div>}
            <div className="flex justify-between"><dt className="text-steel-400">Mechanic</dt><dd className="font-medium text-cream">{req.mechanicName ?? '—'}</dd></div>
            {req.amountCents != null && (
              <div className="flex justify-between"><dt className="text-steel-400">Charged</dt><dd className="font-bold text-cream">₹{(req.amountCents / 100).toFixed(0)}</dd></div>
            )}
            {req.durationMin != null && (
              <div className="flex justify-between"><dt className="text-steel-400">On site</dt><dd className="font-medium text-cream">{req.durationMin} min</dd></div>
            )}
            {req.rating != null && (
              <div className="flex justify-between"><dt className="text-steel-400">Your rating</dt><dd className="font-medium text-cream">★ {req.rating}{req.comment ? ` — ${req.comment}` : ''}</dd></div>
            )}
            {req.status === 'cancelled' && (
              <div className="flex justify-between"><dt className="text-steel-400">Cancelled by</dt><dd className="font-medium text-cream">{req.cancelledBy ?? '—'}{req.cancellationReason ? ` — ${req.cancellationReason}` : ''}</dd></div>
            )}
          </dl>
          <p className="mt-3">
            <Link to={`/track/${req.id}`} className="text-sm font-medium text-safety-400 hover:text-safety-300">Open live tracking →</Link>
          </p>
        </Card>
      )}
    </div>
  );
}
