import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { applyAsMechanic } from '@/lib/mechanic';

const SPECIALTY_OPTIONS = ['tow', 'recovery', 'battery', 'electrical', 'engine', 'tyre', 'general'];
const VEHICLE_OPTIONS = ['car', 'bike', 'van', 'truck'];

/**
 * Workshop application. Writes approved:false + pending — approval itself
 * is exclusively server/admin-side. No self-approval path exists.
 */
export function MechanicApplyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    const ok = await applyAsMechanic(user.uid, {
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
    setBusy(false);
    if (!ok) {
      setError('Could not submit. Check your connection and try again.');
      return;
    }
    navigate('/m', { replace: true });
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
