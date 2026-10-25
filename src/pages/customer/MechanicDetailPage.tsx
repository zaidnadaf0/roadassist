import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '@/components/ui';
import { getPublicMechanic, type PublicMechanic } from '@/lib/customer';
import { useAuth } from '@/app/AuthProvider';
import { FIXTURE_MECHANICS } from '@/lib/fixtures';

/** Mechanic detail — projection fields only. No address, no coordinates, no contact. */
export function MechanicDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { demoMode } = useAuth();
  const [item, setItem] = useState<PublicMechanic | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (demoMode) {
      const m = FIXTURE_MECHANICS.find((item) => item.id === id);
      setItem(m ? { id: m.id, name: m.name, garageName: m.garage, specialties: m.specialties, rating: m.rating, reviewCount: m.reviewCount, experienceYears: m.experienceYears, serviceRadiusKm: m.serviceRadiusKm, approved: m.id !== 'demo-mech-03', isAvailable: m.available, baseLat: m.baseLat, baseLng: m.baseLng } : null);
      return () => { cancelled = true; };
    }
    getPublicMechanic(id).then((m) => {
      if (!cancelled) setItem(m);
    });
    return () => {
      cancelled = true;
    };
  }, [id, demoMode]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mechanic" description="Verified profile. Exact location is shared only after your job starts." />
      {item === undefined ? (
        <LoadingState label="Loading mechanic…" />
      ) : item === null ? (
        <EmptyState title="Mechanic not found" description="They may have gone offline. Browse the directory for alternatives." />
      ) : (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-cream">{item.name}</h2>
              <p className="text-sm text-steel-300">{item.garageName ?? 'Independent mechanic'}</p>
            </div>
            <Badge tone={item.isAvailable ? 'success' : 'neutral'}>{item.isAvailable ? 'available' : 'on job'}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(item.specialties ?? []).map((s) => (
              <span key={s} className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-steel-300">{s}</span>
            ))}
          </div>
          <p className="mt-3 text-sm text-steel-300">
            {typeof item.rating === 'number' ? `★ ${item.rating.toFixed(1)}${typeof item.reviewCount === 'number' ? ` (${item.reviewCount})` : ''}` : 'New on network'}
            {typeof item.experienceYears === 'number' ? ` · ${item.experienceYears}y exp` : ''}
            {typeof item.serviceRadiusKm === 'number' ? ` · serves ~${item.serviceRadiusKm} km` : ''}
          </p>
          {item.vehicleDescription && <p className="mt-2 text-sm text-steel-300">{item.vehicleDescription}</p>}
          {!item.approved && <p className="mt-2 text-xs text-steel-400">Note: pending verification — requests route only to approved mechanics.</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {item.isAvailable && (
              <Button onClick={() => navigate(`/request?mechanic=${item.id}`)}>Request this mechanic</Button>
            )}
            <Link to="/mechanics">
              <Button variant="secondary">All mechanics</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
