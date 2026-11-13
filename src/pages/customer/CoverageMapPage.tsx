import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/lib/mapProvider';
import { watchPublicMechanics, type PublicMechanic } from '@/lib/customer';
import { useGeolocation } from '@/lib/geolocation';
import { useAuth } from '@/app/AuthProvider';
import { FIXTURE_MECHANICS } from '@/lib/fixtures';

const MapView = lazy(() => import('@/components/map/MapView').then((m) => ({ default: m.MapView })));

export function CoverageMapPage() {
  const { demoMode } = useAuth();
  const [mechanics, setMechanics] = useState<PublicMechanic[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [geo, requestGeo] = useGeolocation();

  useEffect(() => {
    if (geo.status === 'granted' && geo.coords) {
      setCenter([geo.coords.lat, geo.coords.lng]);
    }
  }, [geo]);

  useEffect(() => {
    if (demoMode) {
      // Mirror the live query scope (approved && available) so the demo map
      // matches its own "approved mechanic areas" copy exactly.
      setFeedError(false);
      setMechanics(FIXTURE_MECHANICS.filter((m) => m.id !== 'demo-mech-03').map((m) => ({ id: m.id, name: m.name, garageName: m.garage, specialties: m.specialties, rating: m.rating, reviewCount: m.reviewCount, experienceYears: m.experienceYears, serviceRadiusKm: m.serviceRadiusKm, approved: true, isAvailable: m.available, baseLat: m.baseLat, baseLng: m.baseLng })));
      return;
    }
    setFeedError(false);
    const unsub = watchPublicMechanics(setMechanics, () => setFeedError(true), 100);
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode, retry]);

  const markers = (mechanics ?? [])
    .filter((m) => m.baseLat != null && m.baseLng != null)
    .map((m) => ({
      id: m.id,
      position: [m.baseLat as number, m.baseLng as number] as [number, number],
      label: `${m.name} · approximate area`,
      tone: 'aqua' as const,
    }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Live coverage map" description="Explore the RoadAssist coverage area and start a request from the same workspace." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={requestGeo} disabled={geo.status === 'requesting'}>
          {geo.status === 'requesting' ? 'Locating…' : 'Center on my location'}
        </Button>
        {geo.status === 'granted' && geo.coords && <span className="text-xs text-steel-400">Centered on your device location (approximate).</span>}
        {(geo.status === 'denied' || geo.status === 'unavailable' || geo.status === 'timeout' || geo.status === 'error') && (
          <span className="text-xs text-steel-400">{geo.error ?? 'Location unavailable'} — the default coverage view still applies.</span>
        )}
      </div>
      <Card className="overflow-hidden p-2">
        <Suspense fallback={<LoadingState label="Loading map…" />}>
          <MapView
            center={center}
            zoom={DEFAULT_ZOOM}
            className="h-[420px] w-full rounded-xl"
            mechanicMarkers={markers}
            userPosition={geo.status === 'granted' && geo.coords ? [geo.coords.lat, geo.coords.lng] : null}
            userLabel="You"
          />
        </Suspense>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-cream">What the map shows</h2>
          <p className="mt-2 text-sm leading-6 text-steel-300">The map is centered on the current RoadAssist operating area. Exact customer and mechanic coordinates are only shown inside an authorised request flow.</p>
          {feedError ? (
            <ErrorState
              title="Coverage feed unavailable"
              description="Mechanic areas could not be loaded. This is not a confirmed empty coverage result — check your connection and retry."
              action={<Button size="sm" variant="secondary" onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
            />
          ) : markers.length === 0 && <EmptyState title="No mechanic locations available" description="Mechanics appear here only when their approved public area coordinates are available." />}
          {markers.length > 0 && <p className="mt-2 text-xs text-steel-400">{markers.length} approved mechanic area{markers.length === 1 ? '' : 's'} shown using coarse public coordinates.</p>}
        </Card>
        <Card>
          <h2 className="font-semibold text-cream">Ready to get help?</h2>
          <p className="mt-2 text-sm leading-6 text-steel-300">Choose a service to share your vehicle, problem, and location with the dispatch workflow.</p>
          <Link to="/services" className="mt-3 inline-block text-sm font-semibold text-safety-400">Request assistance →</Link>
        </Card>
      </div>
    </div>
  );
}
