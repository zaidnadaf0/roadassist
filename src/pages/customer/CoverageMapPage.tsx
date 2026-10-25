import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, LoadingState, PageHeader } from '@/components/ui';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/lib/mapProvider';
import { watchPublicMechanics, type PublicMechanic } from '@/lib/customer';
import { useAuth } from '@/app/AuthProvider';
import { FIXTURE_MECHANICS } from '@/lib/fixtures';

const MapView = lazy(() => import('@/components/map/MapView').then((m) => ({ default: m.MapView })));

export function CoverageMapPage() {
  const { demoMode } = useAuth();
  const [mechanics, setMechanics] = useState<PublicMechanic[]>([]);

  useEffect(() => {
    if (demoMode) {
      setMechanics(FIXTURE_MECHANICS.map((m) => ({ id: m.id, name: m.name, garageName: m.garage, specialties: m.specialties, rating: m.rating, reviewCount: m.reviewCount, experienceYears: m.experienceYears, serviceRadiusKm: m.serviceRadiusKm, approved: m.id !== 'demo-mech-03', isAvailable: m.available, baseLat: m.baseLat, baseLng: m.baseLng })));
      return;
    }
    const unsub = watchPublicMechanics(setMechanics, () => setMechanics([]), 100);
    return () => {
      if (unsub) unsub();
    };
  }, [demoMode]);

  const markers = mechanics
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
      <Card className="overflow-hidden p-2">
        <Suspense fallback={<LoadingState label="Loading map…" />}>
          <MapView center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-[420px] w-full rounded-xl" mechanicMarkers={markers} />
        </Suspense>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-cream">What the map shows</h2>
          <p className="mt-2 text-sm leading-6 text-steel-300">The map is centered on the current RoadAssist operating area. Exact customer and mechanic coordinates are only shown inside an authorised request flow.</p>
          {markers.length === 0 && <EmptyState title="No mechanic locations available" description="Mechanics appear here only when their approved public area coordinates are available." />}
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
