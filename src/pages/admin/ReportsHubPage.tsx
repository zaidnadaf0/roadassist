import { useEffect, useState } from 'react';
import { RequireAdmin } from '@/components/RequireAdmin';
import { Button, Card, DemoNotice, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { useAuth } from '@/app/AuthProvider';
import { downloadCsv, toCsv } from '@/lib/analytics';
import { listAllRequestsOnce, watchAllMechanics, type AdminMechanic, type AdminRequest } from '@/lib/admin';
import { DEMO_ADMIN_MECHANICS, getDemoAdminRequests } from '@/lib/fixtures';

/**
 * Reports hub: CSV exports generated client-side from bounded,
 * rule-readable snapshots. No server report jobs in this phase.
 */
export function ReportsHubPage() {
  const { demoMode } = useAuth();
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [mechanics, setMechanics] = useState<AdminMechanic[] | null>(null);
  const [feedError, setFeedError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFeedError(false);
    if (demoMode) {
      setRequests(getDemoAdminRequests());
      setMechanics(DEMO_ADMIN_MECHANICS);
      return () => { cancelled = true; };
    }
    listAllRequestsOnce('all', 200)
      .then((r) => {
        if (!cancelled) setRequests(r);
      })
      .catch(() => {
        if (!cancelled) {
          setRequests([]);
          setFeedError(true);
        }
      });
    const unsub = watchAllMechanics((m) => {
      if (!cancelled) setMechanics(m);
    }, 200, () => setFeedError(true));
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [demoMode]);

  function exportRequests() {
    if (!requests) return;
    downloadCsv(
      'roadassist-requests.csv',
      toCsv(
        ['id', 'status', 'category', 'customer', 'mechanic', 'amount_cents', 'rating'],
        requests.map((r) => [r.id, r.status, r.problemCategory ?? '', r.customerId, r.mechanicId ?? '', r.amountCents ?? '', r.rating ?? '']),
      ),
    );
  }

  function exportMechanics() {
    if (!mechanics) return;
    downloadCsv(
      'roadassist-mechanics.csv',
      toCsv(
        ['id', 'name', 'approved', 'verification', 'available', 'rating', 'reviews', 'radius_km'],
        mechanics.map((m) => [
          m.id,
          m.name,
          m.approved ? 'yes' : 'no',
          m.verificationStatus ?? '',
          m.isAvailable ? 'yes' : 'no',
          m.rating ?? '',
          m.reviewCount ?? '',
          m.serviceRadiusKm ?? '',
        ]),
      ),
    );
  }

  const ready = requests !== null && mechanics !== null;

  return (
    <RequireAdmin>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Reports" description="CSV exports from live snapshots (bounded windows). No contact data, no coordinates." />
        {demoMode && <DemoNotice>Exports use the same labelled sample dataset as the admin dashboard. They do not contain real customer data.</DemoNotice>}
        {feedError && !demoMode ? (
          <ErrorState title="Reports unavailable" description="The report snapshots could not be loaded. Check your connection and try again." />
        ) : !ready ? (
          <LoadingState label="Loading snapshots…" />
        ) : (
          <div className="grid gap-4">
            <Card>
              <p className="font-semibold text-cream">Requests export</p>
              <p className="mt-1 text-sm text-steel-300">{requests.length} requests in the current snapshot. IDs, statuses, categories, assignment, amounts, ratings — no locations.</p>
              {requests.length === 0 ? (
                <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Nothing to export — the snapshot is empty. A header-only file would be misleading, so the download is disabled.</p>
              ) : (
                <div className="mt-3"><Button onClick={exportRequests}>Download requests CSV</Button></div>
              )}
            </Card>
            <Card>
              <p className="font-semibold text-cream">Mechanics export</p>
              <p className="mt-1 text-sm text-steel-300">{mechanics.length} mechanics in the current snapshot. Approval state, availability, rating aggregates — no addresses, coordinates, or contact.</p>
              {mechanics.length === 0 ? (
                <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Nothing to export — the snapshot is empty. A header-only file would be misleading, so the download is disabled.</p>
              ) : (
                <div className="mt-3"><Button onClick={exportMechanics}>Download mechanics CSV</Button></div>
              )}
            </Card>
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}
