import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button, Card, DemoNotice, EmptyState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { useGeolocation } from '@/lib/geolocation';
import { DEFAULT_CENTER } from '@/lib/mapProvider';

/** Lazy-loaded map to keep Leaflet out of Node test environments. */
const MapView = lazy(() => import('@/components/map/MapView').then((m) => ({ default: m.MapView })));
import {
  createRequest,
  getPublicMechanic,
  listVehicles,
  watchPublicMechanics,
  type PublicMechanic,
  type Vehicle,
} from '@/lib/customer';
import { DEMO_CUSTOMER_VEHICLES, FIXTURE_MECHANICS, FIXTURE_SERVICES, advanceDemoRequest } from '@/lib/fixtures';
import { classifyProblem, type GuideCategory, type SafetyTriage } from '@/lib/mechanicGuide';

/** Valid dispatch categories (mirrors the step-2 select and CATEGORY_NEEDS). */
const REQUEST_CATEGORIES: GuideCategory[] = ['general', 'flat-tyre', 'battery', 'engine', 'tow', 'other'];

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
  const [vehiclesError, setVehiclesError] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [problem, setProblem] = useState('');
  const [category, setCategory] = useState(() => (REQUEST_CATEGORIES.includes(params.get('category') ?? '') ? (params.get('category') as string) : 'general'));
  const [classification, setClassification] = useState<{ suggestedCategory: GuideCategory; matchStatus: 'matched' | 'uncertain'; safety: SafetyTriage } | null>(null);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const classificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [place, setPlace] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locationSource, setLocationSource] = useState<'gps' | 'manual' | null>(null);
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
      setVehiclesError(false);
      return;
    }
    listVehicles(uid).then((items) => {
      setVehicles(items);
      setVehiclesError(false);
    }).catch(() => {
      // Distinct failure: a rules/network error must not read as "no vehicles".
      setVehicles([]);
      setVehiclesError(true);
    });
  }, [uid, demoMode]);

  // Debounced classification: updates suggestion as the customer types.
  // Manual overrides are preserved; only automatic selection is refreshed.
  useEffect(() => {
    if (classificationTimer.current) {
      clearTimeout(classificationTimer.current);
    }
    classificationTimer.current = setTimeout(() => {
      const result = classifyProblem(problem);
      setClassification({
        suggestedCategory: result.suggestedCategory,
        matchStatus: result.matchStatus,
        safety: result.safety,
      });
      if (!isManualOverride) {
        setCategory(result.suggestedCategory);
      }
    }, 300);
    return () => {
      if (classificationTimer.current) {
        clearTimeout(classificationTimer.current);
      }
    };
  }, [problem, isManualOverride]);

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

  const [pickedName, setPickedName] = useState<string | null>(null);
  const [mechanicNotice, setMechanicNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!picked) {
      setPickedName(null);
      setMechanicNotice(null);
      return;
    }
    if (demoMode) {
      const name = FIXTURE_MECHANICS.find((item) => item.id === picked)?.name;
      if (name) {
        setPickedName(name);
        setMechanicNotice(null);
      } else {
        setPicked(null);
        setMechanicNotice('The shared mechanic link is no longer valid — the request will be placed open to the network.');
      }
      return;
    }
    let cancelled = false;
    getPublicMechanic(picked).then((m) => {
      if (cancelled) return;
      if (m?.name) {
        setPickedName(m.name);
        setMechanicNotice(null);
      } else {
        // Never submit an unresolved mechanic id — fall back to an open request.
        setPicked(null);
        setPickedName(null);
        setMechanicNotice('The shared mechanic link is no longer valid or that mechanic is unavailable — the request will be placed open to the network.');
      }
    }).catch(() => {
      if (cancelled) return;
      setPicked(null);
      setPickedName(null);
      setMechanicNotice('The preferred mechanic could not be verified — the request will be placed open to the network.');
    });
    return () => { cancelled = true; };
  }, [picked, demoMode]);

  // Autofill manual fields from a GPS fix (user verifies before continuing).
  useEffect(() => {
    if (geo.status === 'granted' && geo.coords) {
      setLat(geo.coords.lat.toFixed(6));
      setLng(geo.coords.lng.toFixed(6));
      setLocationSource('gps');
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
        // Reset the shared sample booking so a presentation always starts
        // from `requested` — even right after a previous completed run.
        advanceDemoRequest('demo-request-pending', 'requested');
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
      <PageHeader title="New request" description="Four short steps: vehicle, problem, location, confirm." />

      {/* Step indicator: state is spelled out for screen readers, not colour-only. */}
      <ol className="mb-5 grid grid-cols-4 gap-1.5" aria-label="Request progress">
        {(['Vehicle', 'Problem', 'Location', 'Confirm'] as const).map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label}>
              <div className={`h-1 rounded-full transition-colors ${current || done ? 'bg-safety-500' : 'bg-graphite-soft'}`} />
              <p className={`mt-1.5 truncate text-[10px] uppercase tracking-wider ${current ? 'font-semibold text-cream' : done ? 'text-steel-400' : 'text-steel-500'}`}>
                {n}. {label}
              </p>
              <span className="sr-only">{done ? 'completed' : current ? 'current step' : 'upcoming'}</span>
            </li>
          );
        })}
      </ol>
      {demoMode && <DemoNotice><span>Demo booking flow: submit the linked sample rescue to see the same booking in customer tracking, mechanic offers and admin dispatch.</span><Button size="sm" variant="secondary" onClick={loadDemoBooking}>Load demo booking</Button></DemoNotice>}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-cream">{error}</p>
      )}

      {step === 1 && (
        <Card>
          <p className="font-semibold text-cream">Which vehicle needs help?</p>
          {vehiclesError ? (
            <div className="mt-3">
              <EmptyState title="Vehicles unavailable" description="Your saved vehicles could not be loaded, so no vehicle can be selected yet. Nothing is lost — check your connection and reopen this page, or manage vehicles from the vehicles page." />
              <Button variant="secondary" onClick={() => navigate('/vehicles')}>Open vehicles</Button>
            </div>
          ) : vehicles.length === 0 ? (
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
                    data-testid={`vehicle-option-${v.id}`}
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
            <Button data-testid="wizard-continue-vehicle" disabled={!vehicleId} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="grid gap-4">
            <Field label="What happened? (min 5 characters)">
              <Input data-testid="request-problem" value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={Math.max(5, 2000 - ((svcName ? svcName.length + 3 : 0) + (place.trim() ? place.trim().length + 3 : 0)))} placeholder="e.g. Rear tyre burst on the highway…" />
            </Field>

            {/* Classification suggestion + safety (passive, non-blocking) */}
            {classification && (
              <div className="mt-2 grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {classification.matchStatus === 'matched' ? (
                    <span className="inline-flex items-center gap-2 rounded-lg border border-safety-500/30 bg-safety-500/10 px-3 py-1.5 text-xs font-mono text-safety-300">
                      Suggested: {classification.suggestedCategory}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-lg border border-line-soft bg-graphite-soft/50 px-3 py-1.5 text-xs font-mono text-steel-400">
                      Not classified — please select manually
                    </span>
                  )}
                  {isManualOverride && classification.matchStatus === 'matched' && classification.suggestedCategory !== category && (
                    <Button size="sm" variant="secondary" onClick={() => {
                      setCategory(classification.suggestedCategory);
                      setIsManualOverride(false);
                    }}>
                      Apply suggestion
                    </Button>
                  )}
                  {isManualOverride && (
                    <Button size="sm" variant="ghost" onClick={() => setIsManualOverride(false)}>
                      Use automatic
                    </Button>
                  )}
                </div>

                {classification.safety.level !== 'normal' && (
                  <div className={`rounded-xl border px-3 py-2 text-xs ${classification.safety.level === 'emergency' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10'}`} role="alert">
                    <p className="font-semibold text-cream">{classification.safety.title}</p>
                    <p className="mt-1 text-steel-200">{classification.safety.message}</p>
                  </div>
                )}
              </div>
            )}

            <Field label="Category">
              <select data-testid="request-category" value={category} onChange={(e) => {
                const val = e.target.value as GuideCategory;
                setCategory(val);
                setIsManualOverride(true);
              }} className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream">
                {REQUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {classification?.matchStatus === 'matched' && !isManualOverride && (
                <p className="mt-1 text-[10px] text-steel-500">Rule-based suggestion — you can change it above.</p>
              )}
            </Field>
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button data-testid="wizard-continue-problem" disabled={problem.trim().length < 5} onClick={() => setStep(3)}>Continue</Button>
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
                <p role="alert" className="mt-1.5 text-xs text-warning">{geo.error} Manual entry and map selection still work.</p>
              )}
              <p className="mt-1.5 text-xs text-steel-400">
                Location source: <span className="font-medium">{locationSource === 'gps' ? 'GPS-detected' : locationSource === 'manual' ? 'Manually selected' : 'Not set'}</span>
              </p>
            </div>
            <Field label="Where is the vehicle?" hint="Street / landmark.">
              <Input data-testid="request-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Outer Ring Road, near HSR exit" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input data-testid="request-lat" value={lat} onChange={(e) => { setLat(e.target.value); setLocationSource('manual'); }} placeholder="12.9716" inputMode="decimal" />
              </Field>
              <Field label="Longitude">
                <Input data-testid="request-lng" value={lng} onChange={(e) => { setLng(e.target.value); setLocationSource('manual'); }} placeholder="77.5946" inputMode="decimal" />
              </Field>
            </div>
            <Card className="h-[300px]">
              <Suspense fallback={<div className="h-full w-full flex items-center justify-center rounded-xl border border-line-soft bg-graphite-card text-xs text-steel-400">Loading map…</div>}>
                <MapView
                  center={coords ? [coords.lat, coords.lng] : DEFAULT_CENTER}
                  zoom={14}
                  onPinClick={([clat, clng]) => {
                    setLat(clat.toFixed(6));
                    setLng(clng.toFixed(6));
                    setLocationSource('manual');
                  }}
                  userPosition={geo.status === 'granted' && geo.coords ? [geo.coords.lat, geo.coords.lng] : null}
                  userLabel="You"
                  className="h-full w-full rounded-xl"
                />
              </Suspense>
              {coords && (
                <p className="mt-1 text-xs text-steel-400 text-center">Click the map to move your location pin.</p>
              )}
            </Card>
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
            <Button data-testid="wizard-review" disabled={!place.trim() || !coords} onClick={() => setStep(4)}>Review</Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card>
          {mechanicNotice && (
            <p role="status" className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-cream">{mechanicNotice}</p>
          )}
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-steel-400">Vehicle</dt><dd className="font-medium text-cream">{vehicles.find((v) => v.id === vehicleId)?.plate ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-400">Problem</dt><dd className="max-w-[60%] text-right font-medium text-cream">{problem}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-400">Location</dt><dd className="max-w-[60%] text-right font-medium text-cream">{place} ({coords?.lat}, {coords?.lng})</dd></div>
            <div className="flex justify-between"><dt className="text-steel-400">Mechanic</dt><dd className="font-medium text-cream">{picked ? (pickedName ?? '…') : 'Best available'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-steel-400">Submitting creates a live request with a 2-minute offer window for eligible mechanics.</p>
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
            <Button data-testid="wizard-confirm" disabled={submitting} onClick={submit}>{submitting ? 'Placing…' : 'Confirm request'}</Button>
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
