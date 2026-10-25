import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { RequireMechanic, useMechanicAccess } from '@/components/RequireMechanic';
import { Badge, Button, Card, DemoNotice, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { getMyContact, setAvailability, updateMyContact } from '@/lib/mechanic';
import { DEMO_MECHANIC_PROFILE } from '@/lib/fixtures';

export function MechanicProfilePage() {
  const { demoMode, user } = useAuth();
  const { record } = useMechanicAccess();
  const uid = user?.uid ?? '';
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setPhone(DEMO_MECHANIC_PROFILE.phone);
      setEmail(DEMO_MECHANIC_PROFILE.email);
      setLoaded(true);
      return;
    }
    getMyContact(uid).then((c) => {
      setPhone(c?.phone ?? '');
      setEmail(c?.email ?? '');
      setLoaded(true);
    });
  }, [uid, demoMode]);

  async function onSaveContact(e: FormEvent) {
    e.preventDefault();
    if (!uid || busy) return;
    if (demoMode) {
      setNotice('Demo contact saved for this browser session. Firebase was not changed.');
      return;
    }
    setBusy(true);
    const ok = await updateMyContact(uid, { phone, email });
    setBusy(false);
    setNotice(ok ? 'Contact saved (owner-only, never public).' : 'Could not save. Try again.');
  }

  async function toggle() {
    if (!uid || !record || demoMode) return;
    setBusy(true);
    await setAvailability(uid, !record.isAvailable);
    setBusy(false);
  }

  const displayRating = demoMode ? DEMO_MECHANIC_PROFILE.rating : record?.rating;
  const displayReviews = demoMode ? DEMO_MECHANIC_PROFILE.reviewCount : record?.reviewCount;
  const displayExperience = demoMode ? DEMO_MECHANIC_PROFILE.experienceYears : record?.experienceYears;
  const displayRadius = demoMode ? DEMO_MECHANIC_PROFILE.serviceRadiusKm : record?.serviceRadiusKm;
  const displaySpecialties = (demoMode ? DEMO_MECHANIC_PROFILE.specialties : record?.specialties) ?? [];

  return (
    <RequireMechanic>
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Workshop profile" description="Your verified record. Only availability and contact are self-editable — everything else is operations-controlled." />
        {demoMode && <DemoNotice>Imran Shaikh and RoadAssist Demo Garage are fictional sample records for presentation.</DemoNotice>}
        {(demoMode ? !loaded : !record || !loaded) ? (
          <LoadingState label="Loading profile…" />
        ) : (
          <div className="grid gap-4">
            {notice && (
              <p role="status" className="rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-cream">{notice}</p>
            )}
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-cream">{demoMode ? DEMO_MECHANIC_PROFILE.name : record?.name}</h2>
                  <p className="text-sm text-steel-300">{(demoMode ? DEMO_MECHANIC_PROFILE.garageName : record?.garageName) ?? 'Independent mechanic'}</p>
                </div>
                <Badge tone={(demoMode ? DEMO_MECHANIC_PROFILE.isAvailable : record?.isAvailable) ? 'success' : 'neutral'}>{(demoMode ? DEMO_MECHANIC_PROFILE.isAvailable : record?.isAvailable) ? 'available' : 'offline'}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {displaySpecialties.map((s) => (
                  <span key={s} className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-steel-300">{s}</span>
                ))}
              </div>
              <p className="mt-2 text-sm text-steel-300">
                {displayExperience != null ? `${displayExperience}y exp · ` : ''}
                {displayRadius != null ? `serves ~${displayRadius} km · ` : ''}
                {displayRating != null ? `★ ${displayRating?.toFixed(1) ?? '—'} (${displayReviews ?? 0})` : 'New on network'}
              </p>
              <div className="mt-3">
                <Button size="sm" variant={(demoMode ? DEMO_MECHANIC_PROFILE.isAvailable : record?.isAvailable) ? 'secondary' : 'primary'} disabled={busy || demoMode} onClick={toggle}>
                  {demoMode ? 'Demo availability' : record?.isAvailable ? 'Go offline' : 'Go online'}
                </Button>
              </div>
              <p className="mt-3 text-xs text-steel-400">
                Name, specialties, coverage, and verification can only be changed by operations. Contact your admin for corrections.
              </p>
            </Card>
            <Card>
              <p className="font-semibold text-cream">Private contact</p>
              <p className="mt-1 text-sm text-steel-300">Visible only to you, admins, and customers with an assigned job (via their request).</p>
              <form onSubmit={onSaveContact} className="mt-3 grid gap-3">
                <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" autoComplete="tel" /></Field>
                <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@garage.com" autoComplete="email" /></Field>
                <div><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save contact'}</Button></div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </RequireMechanic>
  );
}
