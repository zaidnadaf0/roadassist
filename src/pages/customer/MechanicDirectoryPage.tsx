import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { watchPublicMechanics, type PublicMechanic } from '@/lib/customer';
import { explainMechanic, rankWithML } from '@/lib/mlRank';
import { FIXTURE_MECHANICS } from '@/lib/fixtures';
import { useAuth } from '@/app/AuthProvider';

const FILTERS = ['all', 'tow', 'battery', 'engine', 'tyre', 'general'] as const;

const FILTER_CATEGORY: Record<(typeof FILTERS)[number], string> = {
  all: 'other',
  tow: 'tow',
  battery: 'battery',
  engine: 'engine',
  tyre: 'flat-tyre',
  general: 'other',
};

/** Public roster — reads ONLY the server-written projection (no exact locations). */
export function MechanicDirectoryPage() {
  const { demoMode } = useAuth();
  const [roster, setRoster] = useState<PublicMechanic[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [mlOrder, setMlOrder] = useState<string[] | null>(null);
  const [mlOrderSource, setMlOrderSource] = useState<'ml' | 'fallback' | null>(null);

  useEffect(() => {
    if (demoMode) {
      setFeedError(false);
      setRoster(FIXTURE_MECHANICS.map((m) => ({
        id: m.id,
        name: m.name,
        approved: m.id !== 'demo-mech-03',
        isAvailable: m.available,
        specialties: m.specialties,
        rating: m.rating,
        reviewCount: m.reviewCount,
        experienceYears: m.experienceYears,
        serviceRadiusKm: m.serviceRadiusKm,
        garageName: m.garage,
        baseLat: m.baseLat,
        baseLng: m.baseLng,
      })));
      return;
    }
    const unsub = watchPublicMechanics((items) => setRoster(items), () => setFeedError(true), 100);
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode, retry]);

  // M11 display-ordering seam: ML service first (1.2 s), deterministic
  // fallback guaranteed. Ordering only — never assignment or dispatch.
  useEffect(() => {
    if (!roster || roster.length === 0) return;
    let cancelled = false;
    void rankWithML(
      roster.map((m) => ({
        id: m.id,
        distanceKm: null,
        serviceMatch: filter === 'all' ? true : (m.specialties ?? []).some((s) => s.toLowerCase().includes(filter)),
        rating: typeof m.rating === 'number' ? m.rating : null,
        reviewCount: typeof m.reviewCount === 'number' ? m.reviewCount : null,
        problemCategory: FILTER_CATEGORY[filter],
        vehicleType: 'car',
      })),
    ).then((out) => {
      if (!cancelled) {
        setMlOrder(out.orderedIds);
        setMlOrderSource(out.source);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roster, filter]);

  const filtered = useMemo(() => {
    const list = (roster ?? []).filter(
      (m) => filter === 'all' || (m.specialties ?? []).some((s) => s.toLowerCase().includes(filter)),
    );
    if (!mlOrder) return [...list].sort((a, b) => a.name.localeCompare(b.name));
    const rank = new Map(mlOrder.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
  }, [roster, filter, mlOrder]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Find mechanics" description="Vetted mechanics currently accepting jobs. Locations shown are approximate until a job starts." />
      {roster === null && !feedError ? (
        <LoadingState label="Loading mechanics…" />
      ) : feedError ? (
        <ErrorState
          title="Mechanic directory unavailable"
          description="The availability feed failed. This is NOT a confirmed 'no mechanics online' result — nothing was verified either way. Check your connection and retry."
          action={<Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
        />
      ) : (roster ?? []).length === 0 ? (
        <>
          <EmptyState title="No mechanics online right now" description="The current availability feed returned no approved, available mechanics. You can retry later, place an open request, or use the predefined Mechanic Bot for safe next steps." />
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/guide" className="inline-flex h-10 items-center rounded-xl bg-safety-500 px-4 text-sm font-semibold text-white hover:bg-safety-600">Open Mechanic Bot</Link>
            <Link to="/request" className="inline-flex h-10 items-center rounded-xl border border-line-soft px-4 text-sm font-semibold text-cream hover:border-line-strong">Place open request</Link>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Specialty filter">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors capitalize ${filter === f ? 'border-safety-500/50 bg-safety-500/15 font-semibold text-safety-300' : 'border-line-soft text-steel-300 hover:border-line-strong hover:bg-graphite-soft/60 hover:text-cream'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            {mlOrder && (
              <Badge
                tone={mlOrderSource === 'ml' ? 'brand' : 'neutral'}
              >
                Ordered by {mlOrderSource === 'ml' ? 'ML ranking' : 'deterministic formula'}
              </Badge>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => (
              <Card key={m.id}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold tracking-widest text-safety-400">UNIT · {m.id.slice(0, 4).toUpperCase()}</span>
                  <Badge tone={m.isAvailable ? 'success' : 'neutral'}>{m.isAvailable ? 'available' : 'on job'}</Badge>
                </div>
                <h2 className="mt-3 font-bold text-cream">{m.name}</h2>
                {m.garageName && <p className="text-sm text-steel-300">{m.garageName}</p>}
                <p className="mt-1 text-sm text-steel-300">
                  {(m.specialties ?? []).slice(0, 3).join(' · ') || 'General mechanic'}
                  {typeof m.rating === 'number' ? ` · ★ ${m.rating.toFixed(1)}` : ''}
                </p>

                {/* Factual recommendation highlights — not ML explainability. */}
                {(() => {
                  const highlights = explainMechanic({
                    id: m.id,
                    distanceKm: null,
                    serviceMatch: filter === 'all' ? true : (m.specialties ?? []).some((s) => s.toLowerCase().includes(filter)),
                    rating: typeof m.rating === 'number' ? m.rating : null,
                    reviewCount: typeof m.reviewCount === 'number' ? m.reviewCount : null,
                    problemCategory: FILTER_CATEGORY[filter],
                    vehicleType: 'car',
                  });
                  const items = [highlights.distance, highlights.serviceMatch, highlights.rating, highlights.reviews].filter(Boolean);
                  if (items.length === 0) return null;
                  return (
                    <p className="mt-1 text-xs text-steel-400">{items.join(' · ')}</p>
                  );
                })()}

                <div className="mt-4 flex gap-2">
                  <Link to={`/mechanic/${m.id}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-line-soft text-sm font-medium hover:border-line-strong">
                    Details
                  </Link>
                  {m.isAvailable && (
                    <Link to={`/request?mechanic=${m.id}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-safety-500 text-sm font-semibold text-white hover:bg-safety-600">
                      Request
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="mt-4">
              <EmptyState title="No matches for this filter" description="Try a different specialty." />
            </div>
          )}
        </>
      )}
    </div>
  );
}
