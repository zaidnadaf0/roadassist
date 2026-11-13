import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useMechanicAccess } from '@/components/RequireMechanic';
import { Button, Card, EmptyState, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { applyAsMechanic } from '@/lib/mechanic';

const SPECIALTY_OPTIONS = ['tow', 'recovery', 'battery', 'electrical', 'engine', 'tyre', 'general'];
const VEHICLE_OPTIONS = ['car', 'bike', 'van', 'truck'];

/**
 * Workshop application. Writes approved:false + pending — approval itself
 * is exclusively server/admin-side. No self-approval path exists.
 *
 * The mechanics/{uid} create is the ONLY write this page can perform: when a
 * record already exists the rules make a resubmit an (always-denied)
 * update, so existing applicants see their actual application state instead
 * of the form.
 */
export function MechanicApplyPage() {
  const { user, demoMode } = useAuth();
  const navigate = useNavigate();
  const { access, record, retry } = useMechanicAccess(demoMode);
  const [name, setName] = useState(user?.displayName ?? '');
  const [garageName, setGarageName] = useState('');
  const [garageAddress, setGarageAddress] = useState('');
  const [specialties, setSpecialties] = useState<string[]>(['general']);
  const [vehicles, setVehicles] = useState<string[]>(['car']);
  const [exp, setExp] = useState(2);
  const [radius, setRadius] = useState(25);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing mechanic record: the application form is create-only, so any
  // recorded state replaces it. Re-applying would be denied by rules.
  if (access === 'error') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Workshop status unavailable" description="RoadAssist needs to verify your existing workshop record before accepting another application." />
        <EmptyState title="Application paused" description="The record check failed, so no application was submitted. Retry the status check or contact RoadAssist operations." />
        <div className="mt-4"><Button variant="secondary" onClick={retry}>Retry status check</Button></div>
      </div>
    );
  }
  if (access === 'loading') {
    return (
      <div className="mx-auto max-w-2xl">
        <LoadingState label="Checking workshop status…" />
      </div>
    );
  }
  if (access.kind === 'none' && record !== null) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Workshop record needs review" description="RoadAssist found an existing workshop record but could not identify its application state." />
        <EmptyState title="No new application was submitted" description="To protect the existing workshop record, this page will not submit over it. Contact RoadAssist operations to review its status." />
        <p className="mt-4"><Link to="/m" className="inline-flex h-11 items-center rounded-xl border border-line-soft px-5 text-sm font-medium hover:border-line-strong">Back to mechanic portal</Link></p>
      </div>
    );
  }
  if (access.kind === 'pending' || access.kind === 'under_review') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Application under review" description="Your workshop application is with operations." />
        <EmptyState
          title={access.kind === 'pending' ? 'Application received' : 'Review in progress'}
          description="Operations is verifying your garage, documents, and coverage. Submitting again is not possible or needed — you will see the job queue the moment you are approved."
        />
        <p className="mt-4"><Link to="/m" className="inline-flex h-11 items-center rounded-xl border border-line-soft px-5 text-sm font-medium hover:border-line-strong">Back to dashboard</Link></p>
      </div>
    );
  }
  if (access.kind === 'approved') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="You are approved" description="No application is needed — your workshop is active." />
        <EmptyState title="Workshop already active" description="Your mechanic record is approved. You can go online and receive offers right away." />
        <p className="mt-4"><Link to="/m" className="inline-flex h-11 items-center rounded-xl bg-safety-500 px-5 text-sm font-semibold text-white hover:bg-safety-600">Open the mechanic dashboard</Link></p>
      </div>
    );
  }
  if (access.kind === 'suspended') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Account suspended" description="Your workshop standing is paused." />
        <EmptyState title="Temporarily suspended" description="Your workshop is paused while operations reviews an issue. Resubmitting an application will not change this state — contact RoadAssist support." />
      </div>
    );
  }
  if (access.kind === 'rejected') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Application not approved" description="This workshop application was not approved." />
        <EmptyState title="Application rejected" description="Contact RoadAssist support if you believe this is a mistake. A fresh application needs operations to clear the previous record first — resubmitting from this screen cannot succeed." />
      </div>
    );
  }

  function toggle(list: string[], v: string, set: (l: string[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    if (name.trim().length < 2 || garageName.trim().length < 2 || garageAddress.trim().length < 5) {
      setError('Fill your name, garage name, and full garage address.');
      return;
    }
    if (specialties.length === 0) {
      setError('Pick at least one specialty.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await applyAsMechanic(user.uid, {
        name,
        garageName,
        garageAddress,
        specialties,
        vehicleTypes: vehicles,
        experienceYears: Math.max(0, Math.min(60, Math.round(exp))),
        serviceRadiusKm: Math.max(1, Math.min(200, Math.round(radius))),
        isAvailable: true,
        phone,
        email,
      });
      navigate('/m', { replace: true });
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
        ? err.code
        : '';
      if (code.includes('permission-denied')) {
        setError('Firebase denied the pending application write. Check the Firestore rules deployed to RoadAssist; this form cannot change an existing workshop record.');
      } else if (code.includes('unavailable') || code.includes('network')) {
        setError('RoadAssist could not reach Firebase. Check your connection and try again.');
      } else {
        setError(`Application could not be saved${code ? ` (${code})` : ''}. Please try again or contact RoadAssist support.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Apply as a mechanic" description="Operations reviews every application. Approval is granted by reviewers — never from this screen." />
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-cream">{error}</p>
      )}
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3">
          <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Garage / rig name"><Input value={garageName} onChange={(e) => setGarageName(e.target.value)} required /></Field>
          <Field label="Garage address (private — never shown publicly)" hint="Used by operations for verification only.">
            <Input value={garageAddress} onChange={(e) => setGarageAddress(e.target.value)} required />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-cream">Specialties</p>
            <div className="flex flex-wrap gap-1.5">
              {SPECIALTY_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => toggle(specialties, s, setSpecialties)} aria-pressed={specialties.includes(s)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${specialties.includes(s) ? 'bg-safety-500/15 text-safety-300' : 'text-steel-300 hover:text-cream'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-cream">Vehicle types</p>
            <div className="flex flex-wrap gap-1.5">
              {VEHICLE_OPTIONS.map((v) => (
                <button key={v} type="button" onClick={() => toggle(vehicles, v, setVehicles)} aria-pressed={vehicles.includes(v)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${vehicles.includes(v) ? 'bg-safety-500/15 text-safety-300' : 'text-steel-300 hover:text-cream'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Experience (years)"><Input type="number" value={exp} onChange={(e) => setExp(Number(e.target.value))} min={0} max={60} required /></Field>
            <Field label="Service radius (km)"><Input type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} min={1} max={200} required /></Field>
          </div>
          <Field label="Contact phone (private)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" autoComplete="tel" /></Field>
          <Field label="Contact email (private)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <div><Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</Button></div>
        </form>
      </Card>
    </div>
  );
}
