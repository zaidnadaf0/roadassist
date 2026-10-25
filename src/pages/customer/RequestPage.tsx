import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button, Card, DemoNotice, EmptyState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { useGeolocation } from '@/lib/geolocation';
import {
  createRequest,
  getPublicMechanic,
  listVehicles,
  watchPublicMechanics,
  type PublicMechanic,
  type Vehicle,
} from '@/lib/customer';
import { DEMO_CUSTOMER_VEHICLES, FIXTURE_MECHANICS, FIXTURE_SERVICES } from '@/lib/fixtures';

type Step = 1 | 2 | 3 | 4;

/**
 * Request wizard: vehicle → problem → location → mechanic → confirm.
 * Location supports manual coordinates and browser geolocation when available;
 * the backend remains authoritative for dispatch and assigned-mechanic data.
 */
export function RequestPage() {
  const { demoMode, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uid = user?.uid ?? '';

  const [step, setStep] = useState<Step>(1);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [problem, setProblem] = useState('');
  const [category, setCategory] = useState('general');
  const [place, setPlace] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [mechanics, setMechanics] = useState<PublicMechanic[] | null>(null);
  const [picked, setPicked] = useState<string | null>(params.get('mechanic'));
  const [submitting, setSubmitting] = useState(false);
  const requestKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geo, requestGeo] = useGeolocation();
  const serviceId = params.get('service');

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setVehicles(DEMO_CUSTOMER_VEHICLES.filter((item) => item.ownerId === 'demo-customer'));
      return;
    }
    listVehicles(uid).then(setVehicles).catch(() => setVehicles([]));
  }, [uid, demoMode]);

  useEffect(() => {
    if (step !== 3 || mechanics !== null) return;
    if (demoMode) {
      setMechanics(FIXTURE_MECHANICS.map((m) => ({ id: m.id, name: m.name, garageName: m.garage, specialties: m.specialties, rating: m.rating, reviewCount: m.reviewCount, experienceYears: m.experienceYears, serviceRadiusKm: m.serviceRadiusKm, approved: m.id !== 'demo-mech-03', isAvailable: m.available, baseLat: m.baseLat, baseLng: m.baseLng })));
      return;
    }
    const unsub = watchPublicMechanics((items) => setMechanics(items), () => setMechanics([]), 200);
    return () => {
      if (unsub) unsub();
    };
  }, [step, mechanics, demoMode]);

  const [pickedName, setPickedName] = useState<string | null>(null);  useEffect(() => {
    if (!picked) {
      setPickedName(null);
      return;
    }
    if (demoMode) {
      setPickedName(FIXTURE_MECHANICS.find((item) => item.id === picked)?.name ?? null);
      return;
    }
    getPublicMechanic(picked).then((m) => setPickedName(m?.name ?? null));
  }, [picked, demoMode]);

  // Autofill manual fields from a GPS fix (user verifies before continuing).
  useEffect(() => {
    if (geo.status === 'granted' && geo.coords) {
      setLat(geo.coords.lat.toFixed(6));
      setLng(geo.coords.lng.toFixed(6));
    }
  }, [geo]);

  const coords = useMemo(() => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!lat.trim() || !lng.trim() || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
    return { lat: la, lng: ln };
  }, [lat, lng]);

  const svcName = FIXTURE_SERVICES.find((s) => s.id === serviceId)?.name;

  function loadDemoBooking() {
    const vehicle = DEMO_CUSTOMER_VEHICLES.find((item) => item.isDefault) ?? DEMO_CUSTOMER_VEHICLES[0];
    setVehicleId(vehicle.id);
    setProblem('Fuel delivery needed before a campus event');
    setCategory('fuel');
    setPlace('Cubbon Park, Bengaluru');
    setLat('12.9763');
    setLng('77.5929');
    setPicked(null);
    setStep(4);
  }

  async function submit() {
    if (!uid || !vehicleId || problem.trim().length < 5 || !place.trim() || !coords || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (demoMode) {
        setSubmitting(false);
        navigate('/track/demo-request-pending', { replace: true });
        return;
      }
      if (!requestKeyRef.current) {
        requestKeyRef.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const id = await createRequest(uid, {
        vehicleId,
        problemText: `${svcName ? `[${svcName}] ` : ''}${problem.trim()} @ ${place.trim()}`,
        problemCategory: category,
        customerLat: coords.lat,
        customerLng: coords.lng,
        ...(picked ? { pickedMechanicId: picked } : {}),
      }, requestKeyRef.current);
      requestKeyRef.current = null;
      navigate(`/track/${id}`, { replace: true });
    } catch {
      setError('Could not place your request. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (vehicles === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="New request" description="Vehicle, problem, location, mechanic, confirm." />
        <LoadingState label="Loading your vehicles…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New request" description={`Step ${step} of 4 — vehicle, problem, location, confirm.`} />
      {demoMode && <DemoNotice><span>Demo booking flow: submit the linked sample rescue to see the same booking in customer tracking, mechanic offers and admin dispatch.</span><Button size="sm" variant="secondary" onClick={loadDemoBooking}>Load demo booking</Button></DemoNotice>}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-cream">{error}</p>
      )}

      {step === 1 && (
        <Card>
          <p className="font-semibold text-cream">Which vehicle needs help?</p>
          {vehicles.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No vehicles yet" description="Add your first vehicle to place a request." />
              <Button onClick={() => navigate('/vehicles')}>Add vehicle</Button>
            </div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {vehicles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setVehicleId(v.id)}
                    aria-pressed={vehicleId === v.id}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${vehicleId === v.id ? 'border-safety-500 bg-safety-500/10' : 'border-line-soft hover:border-line-strong'}`}
                  >
                    <span className="font-medium text-cream">{v.make} {v.model} · {v.plate}</span>
                    <span className="font-mono text-xs text-steel-400">{v.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end">
            <Button disabled={!vehicleId} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="grid gap-4">
            <Field label="What happened? (min 5 characters)">
              <Input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. Rear tyre burst on the highway…" />
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream">
                {['general', 'flat-tyre', 'battery', 'engine', 'tow', 'other'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={problem.trim().length < 5} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <div className="grid gap-4">
            <div>
              <Button variant="secondary" onClick={requestGeo} disabled={geo.status === 'requesting'}>
                {geo.status === 'requesting' ? 'Locating…' : 'Use my current location'}
              </Button>
              {geo.status === 'granted' && geo.coords && (
                <p role="status" className="mt-1.5 text-xs text-steel-300">
                  Detected {geo.coords.lat.toFixed(5)}, {geo.coords.lng.toFixed(5)}
                  {geo.coords.accuracy != null ? ` (±${Math.round(geo.coords.accuracy)} m)` : ''} — filled below, verify before continuing.
                </p>
              )}
              {(geo.status === 'denied' || geo.status === 'unavailable' || geo.status === 'timeout' || geo.status === 'error') && (
                <p role="alert" className="mt-1.5 text-xs text-warning">{geo.error} Manual entry still works.</p>
              )}
            </div>
            <Field label="Where is the vehicle?" hint="Street / landmark.">
              <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Outer Ring Road, near HSR exit" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="12.9716" inputMode="decimal" />
              </Field>
              <Field label="Longitude">
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.5946" inputMode="decimal" />
              </Field>
            </div>
            {mechanics === null ? (
              <LoadingState label="Loading mechanics…" />
            ) : (
              <Field label="Prefer a mechanic? (optional)">
                <select value={picked ?? ''} onChange={(e) => setPicked(e.target.value || null)} className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream">
                  <option value="">No preference — best available</option>
                  {mechanics.filter((m) => m.isAvailable).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{typeof m.rating === 'number' ? ` · ★${m.rating.toFixed(1)}` : ''}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button disabled={!place.trim() || !coords} onClick={() => setStep(4)}>Review</Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-steel-400">Vehicle</dt><dd className="font-medium text-cream">{vehicles.find((v) => v.id === vehicleId)?.plate ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-400">Problem</dt><dd className="max-w-[60%] text-right font-medium text-cream">{problem}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-400">Location</dt><dd className="max-w-[60%] text-right font-medium text-cream">{place} ({coords?.lat}, {coords?.lng})</dd></div>
            <div className="flex justify-between"><dt className="text-steel-400">Mechanic</dt><dd className="font-medium text-cream">{picked ? (pickedName ?? '…') : 'Best available'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-steel-400">Submitting creates a live request with a 2-minute offer window for eligible mechanics.</p>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
            <Button disabled={submitting} onClick={submit}>{submitting ? 'Placing…' : 'Confirm request'}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Legacy alias: /request/:id resolves to live tracking for that request. */
export function RequestAliasPage() {
  const { id = '' } = useParams();
  return <Navigate to={`/track/${id}`} replace />;
}
