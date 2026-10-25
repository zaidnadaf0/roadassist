import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, DemoNotice, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { createRequest, listVehicles, watchPublicMechanics, type Vehicle } from '@/lib/customer';
import { DEMO_CUSTOMER_VEHICLES, FIXTURE_MECHANICS, advanceDemoRequest } from '@/lib/fixtures';
import {
  answerDemoBotScenario,
  buildFallbackReply,
  buildRequestProblemText,
  getDemoBotMenu,
  startDemoBotScenario,
  triageSafety,
  validateGuideDraft,
  vehicleSummary,
  shouldStartSubmission,
  type DemoBotAnswer,
  type DemoBotScenario,
  type DemoBotTurn,
  type GuideDraft,
  type GuideReply,
} from '@/lib/mechanicGuide';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
  source?: GuideReply['source'];
  demo?: boolean;
  safety?: DemoBotTurn['safety'];
  steps?: string[];
}

const INITIAL_MESSAGE = 'Tell me what happened. I can help you describe the problem, flag safety risks, and prepare a RoadAssist request. I cannot confirm a diagnosis from text alone.';

export function MechanicGuidePage() {
  const { user, demoMode, demoRevision } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [problemText, setProblemText] = useState('');
  const [place, setPlace] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [category, setCategory] = useState<GuideDraft['problemCategory']>('general');
  const [observations, setObservations] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: INITIAL_MESSAGE }]);
  const [input, setInput] = useState('');
  const [botScenario, setBotScenario] = useState<DemoBotScenario | null>(null);
  const [botTurn, setBotTurn] = useState<DemoBotTurn | null>(null);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'error'>('idle');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionStarted = useRef(false);
  const availabilityStop = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { availabilityStop.current?.(); }, []);

  useEffect(() => {
    let cancelled = false;
    setVehiclesError(false);
    if (demoMode) {
      const demoVehicles = DEMO_CUSTOMER_VEHICLES.filter((vehicle) => vehicle.ownerId === 'demo-customer');
      setVehicles(demoVehicles);
      setSelectedVehicle((current) => current || demoVehicles.find((vehicle) => vehicle.isDefault)?.id || demoVehicles[0]?.id || '');
      return () => { cancelled = true; };
    }
    if (!user?.uid) {
      setVehicles([]);
      return () => { cancelled = true; };
    }
    setVehicles(null);
    listVehicles(user.uid)
      .then((items) => { if (!cancelled) setVehicles(items); })
      .catch(() => { if (!cancelled) { setVehicles([]); setVehiclesError(true); } });
    return () => { cancelled = true; };
  }, [demoMode, demoRevision, user?.uid]);

  const draft: GuideDraft = {
    vehicleId: selectedVehicle,
    problemText,
    problemCategory: category,
    place,
    customerLat: lat.trim() ? Number(lat) : null,
    customerLng: lng.trim() ? Number(lng) : null,
    observations,
  };
  const safety = triageSafety(`${problemText} ${observations}`);
  const validation = validateGuideDraft(draft, vehicles ?? [], safety);

  function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      setError('Keep each problem description under 2,000 characters.');
      return;
    }
    setInput('');
    setBotScenario(null);
    setBotTurn(null);
    setAvailability('idle');
    setMessages((current) => [...current, { role: 'user', text: trimmed }]);
    setError(null);
    setProblemText((current) => current || trimmed);
    const reply = buildFallbackReply(trimmed);
    setCategory(reply.category ?? category);
    setMessages((current) => [...current, { role: 'assistant', text: reply.message, source: reply.source }]);
  }

  function chooseScenario(scenario: DemoBotScenario) {
    const turn = startDemoBotScenario(scenario);
    const option = getDemoBotMenu().find((item) => item.id === scenario);
    setBotScenario(scenario);
    setBotTurn(turn);
    setAvailability('idle');
    setError(null);
    setConfirmed(false);
    setCategory(turn.category);
    setProblemText((current) => current || turn.safetySignal);
    setMessages((current) => [
      ...current,
      { role: 'user', text: option?.label ?? 'Selected vehicle problem', demo: true },
      { role: 'assistant', text: `${turn.message} ${turn.question ?? ''}`, demo: true, safety: turn.safety },
    ]);
  }

  function answerScenario(answer: DemoBotAnswer) {
    if (!botScenario || !botTurn || botTurn.phase !== 'question') return;
    const turn = answerDemoBotScenario(botScenario, answer);
    const label = answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : 'Not sure';
    setBotTurn(turn);
    setAvailability('idle');
    setConfirmed(false);
    setCategory(turn.category);
    setProblemText((current) => current || turn.safetySignal);
    setMessages((current) => [...current,
      { role: 'user', text: label, demo: true },
      { role: 'assistant', text: turn.message, demo: true, safety: turn.safety, steps: turn.steps },
    ]);
  }

  function showProblemMenu() {
    setBotScenario(null);
    setBotTurn(null);
    setAvailability('idle');
    setInput('');
    setMessages([{ role: 'assistant', text: 'Choose another predefined problem flow, or describe the issue in your own words.' }]);
  }

  function checkMechanicAvailability() {
    availabilityStop.current?.();
    availabilityStop.current = null;
    setAvailability('checking');
    setError(null);
    if (demoMode) {
      setAvailability(FIXTURE_MECHANICS.some((mechanic) => mechanic.available) ? 'available' : 'unavailable');
      return;
    }
    const stop = watchPublicMechanics((items) => {
      availabilityStop.current?.();
      availabilityStop.current = null;
      setAvailability(items.length > 0 ? 'available' : 'unavailable');
    }, () => {
      availabilityStop.current?.();
      availabilityStop.current = null;
      setAvailability('error');
    });
    availabilityStop.current = stop;
    if (!stop) setAvailability('error');
  }

  async function submitDraft() {
    if (!user?.uid || !shouldStartSubmission(confirmed, validation.valid, submitting, submissionStarted.current)) return;
    submissionStarted.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (demoMode) {
        advanceDemoRequest('demo-request-pending', 'requested');
        setSubmitting(false);
        navigate('/track/demo-request-pending', { replace: true });
        return;
      }
      const id = await createRequest(user.uid, {
        vehicleId: draft.vehicleId,
        problemText: buildRequestProblemText(draft),
        problemCategory: draft.problemCategory,
        customerLat: draft.customerLat as number,
        customerLng: draft.customerLng as number,
      });
      navigate(`/track/${id}`, { replace: true });
    } catch {
      setError('The request was not submitted. Check your connection and try again. No confirmation was recorded.');
      submissionStarted.current = false;
      setSubmitting(false);
    }
  }

  if (vehicles === null) return <LoadingState label="Loading your vehicles…" />;
  if (vehiclesError) return <ErrorState title="Your vehicles could not be loaded" description="The live vehicle feed is unavailable. Try again, or switch to Demo mode for a local presentation." action={<Button onClick={() => setVehicles(null)}>Try again</Button>} />;
  if (vehicles.length === 0) return <EmptyState title="Add a vehicle first" description="The guide needs one of your saved vehicles before it can prepare a request." />;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <section>
        <PageHeader title="Demo Mechanic Bot" description="A predefined, rule-based assistant for common roadside scenarios. It is not a live AI diagnostic service and never submits a request by itself." />
        {demoMode && <DemoNotice>Demo mode is active. The sample vehicle and request flow are isolated from Firebase and never create a live record.</DemoNotice>}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="neutral">Predefined demo assistant</Badge>
            <Link to="/emergency" className="text-sm font-medium text-safety-400 hover:text-safety-300">Emergency help →</Link>
          </div>
          <div className="mt-4 grid max-h-[420px] gap-3 overflow-y-auto pr-1" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-2xl px-4 py-3 text-sm ${message.role === 'user' ? 'ml-8 bg-safety-500/15 text-cream' : 'mr-8 bg-graphite-soft text-steel-200'}`}>
                <p>{message.text}</p>
                {message.steps && <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-steel-200">{message.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
                {message.safety && message.safety.level !== 'normal' && <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${message.safety.level === 'emergency' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10'}`} role="alert"><p className="font-semibold text-cream">{message.safety.title}</p><p className="mt-1">{message.safety.message}</p></div>}
                {message.demo && <p className="mt-2 text-xs text-safety-300">Predefined demo response — not a diagnosis.</p>}
                {!message.demo && message.source === 'fallback' && <p className="mt-2 text-xs text-warning">Safety fallback — not a diagnosis.</p>}
              </div>
            ))}
          </div>
          {!botTurn && <div className="mt-4 border-t border-line-soft pt-4">
            <p className="text-sm font-semibold text-cream">Choose a problem to start</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {getDemoBotMenu().map((item) => <Button key={item.id} size="sm" variant="secondary" onClick={() => chooseScenario(item.id)}>{item.label}</Button>)}
            </div>
          </div>}
          {botTurn?.phase === 'question' && <div className="mt-4 border-t border-line-soft pt-4">
            <p className="text-sm font-semibold text-cream">Quick follow-up</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {botTurn.choices?.map((choice) => <Button key={choice.id} size="sm" variant="secondary" onClick={() => answerScenario(choice.id)}>{choice.label}</Button>)}
            </div>
          </div>}
          {botTurn?.phase === 'guidance' && <div className="mt-4 border-t border-line-soft pt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={checkMechanicAvailability} disabled={availability === 'checking'}>{availability === 'checking' ? 'Checking availability…' : 'Check mechanic availability'}</Button>
              <Link to={`/request${botTurn.category !== 'general' ? `?service=${botTurn.category}` : ''}`}><Button size="sm" variant="secondary">Request roadside assistance</Button></Link>
              <Button size="sm" variant="ghost" onClick={showProblemMenu}>Choose another problem</Button>
            </div>
            {availability === 'available' && <p className="mt-3 text-sm text-success-300" role="status">The existing mechanic availability feed returned available providers. You can view the directory or continue to the request flow.</p>}
            {availability === 'unavailable' && <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-steel-200" role="status"><p className="font-semibold text-cream">No available mechanics were returned by the current availability feed.</p><p className="mt-1">This is a confirmed feed result, not a guarantee about future availability. Retry or continue to the existing assistance-request flow.</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" className="font-medium text-safety-300 hover:text-safety-200" onClick={checkMechanicAvailability}>Retry availability</button><Link to="/request" className="font-medium text-safety-300 hover:text-safety-200">Open request flow</Link></div></div>}
            {availability === 'error' && <p className="mt-3 text-sm text-danger" role="alert">Availability could not be verified. Retry the check or continue to the request flow; the bot will not assume that mechanics are unavailable.</p>}
          </div>}
          {botTurn && <div className="mt-3 flex flex-wrap gap-3"><Button size="sm" variant="ghost" onClick={showProblemMenu}>Back to problem menu</Button><Button size="sm" variant="ghost" onClick={showProblemMenu}>Restart conversation</Button></div>}
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <Input aria-label="Describe the vehicle problem" value={input} maxLength={2000} onChange={(event) => setInput(event.target.value)} placeholder="e.g. The engine temperature went red…" />
            <Button type="submit" disabled={!input.trim()}>Send</Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Battery is dead', 'Flat tyre', 'Engine overheating', 'I need a tow'].map((prompt) => <Button key={prompt} size="sm" variant="secondary" onClick={() => void sendMessage(prompt)}>{prompt}</Button>)}
          </div>
        </Card>
      </section>

      <section>
        <PageHeader title="Request draft" description="Review and edit every field before the final confirmation." />
        <Card>
          <div className="grid gap-4">
            <Field label="Vehicle">
              <select aria-label="Vehicle" value={selectedVehicle} onChange={(event) => { setSelectedVehicle(event.target.value); setConfirmed(false); }} className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream">
                <option value="">Select a vehicle</option>
                {vehicles.map((item) => <option key={item.id} value={item.id}>{vehicleSummary(item)}</option>)}
              </select>
            </Field>
            <Field label="Problem description">
              <textarea aria-label="Problem description" value={problemText} onChange={(event) => { setProblemText(event.target.value); setConfirmed(false); }} className="min-h-24 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 py-3 text-[15px] text-cream placeholder:text-steel-500 focus:border-safety-500 focus:outline-none" placeholder="Describe what happened and what you observe." />
            </Field>
            <Field label="Service category">
              <select aria-label="Service category" value={category} onChange={(event) => { setCategory(event.target.value as GuideDraft['problemCategory']); setConfirmed(false); }} className="h-11 w-full rounded-xl border border-line-soft bg-grease-soft px-3.5 text-cream">
                {['general', 'flat-tyre', 'battery', 'engine', 'tow', 'other'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Observations (optional)"><Input value={observations} onChange={(event) => { setObservations(event.target.value); setConfirmed(false); }} placeholder="Warning lights, sounds, smells, or recent events" /></Field>
            <Field label="Breakdown location"><Input value={place} onChange={(event) => { setPlace(event.target.value); setConfirmed(false); }} placeholder="Road, landmark, or safe meeting point" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude"><Input value={lat} onChange={(event) => { setLat(event.target.value); setConfirmed(false); }} inputMode="decimal" placeholder="12.9716" /></Field>
              <Field label="Longitude"><Input value={lng} onChange={(event) => { setLng(event.target.value); setConfirmed(false); }} inputMode="decimal" placeholder="77.5946" /></Field>
            </div>
          </div>

          {safety.level !== 'normal' && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${safety.level === 'emergency' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10'}`} role="alert"><p className="font-semibold text-cream">{safety.title}</p><p className="mt-1 text-steel-200">{safety.message}</p><ul className="mt-2 list-disc pl-5 text-steel-200">{safety.actions.map((action) => <li key={action}>{action}</li>)}</ul></div>}
          {!validation.valid && <p className="mt-4 text-sm text-warning" role="status">{Object.values(validation.errors)[0]}</p>}
          {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {!confirmed ? <Button disabled={!validation.valid} onClick={() => setConfirmed(true)}>Review and confirm</Button> : <Button disabled={submitting} onClick={() => void submitDraft()}>{submitting ? 'Submitting…' : 'Confirm and request help'}</Button>}
            {confirmed && <Button variant="secondary" onClick={() => setConfirmed(false)} disabled={submitting}>Edit draft</Button>}
          </div>
          {confirmed && <p className="mt-3 text-xs text-steel-400">{demoMode ? 'This final action opens the shared sample booking for the presentation. It never writes demo data to Firebase.' : 'This final action creates a live RoadAssist request and starts the existing dispatch workflow. It does not assign a mechanic directly.'}</p>}
          {demoMode && <p className="mt-3 text-xs text-steel-400">In Demo mode, confirmation opens the shared sample booking so the mechanic and admin presentation views stay connected.</p>}
        </Card>
        <Card className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-cream">Provider status</p>
              <p className="mt-1 text-sm text-steel-300">Deterministic safety fallback is active. No Ollama, Qwen, or other model endpoint is configured in this build.</p>
            </div>
            <Badge tone="neutral">Verified fallback</Badge>
          </div>
        </Card>
        <Card className="mt-4">
          <p className="font-semibold text-cream">Other RoadAssist tools</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link to="/vehicles" className="text-safety-400 hover:text-safety-300">Manage vehicles</Link>
            <Link to="/track" className="text-safety-400 hover:text-safety-300">Track a request</Link>
            <Link to="/history" className="text-safety-400 hover:text-safety-300">View history</Link>
            <Link to="/notifications" className="text-safety-400 hover:text-safety-300">Notifications</Link>
            <Link to="/profile" className="text-safety-400 hover:text-safety-300">Profile</Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
