import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { Badge, Button, Card, DemoNotice, Field, Input, LoadingState, PageHeader } from '@/components/ui';
import { getProfile, updateProfile } from '@/lib/customer';
import { DEMO_CUSTOMER_PROFILE } from '@/lib/fixtures';

export function ProfilePage() {
  const { demoMode, user, emailVerified, profileRole } = useAuth();
  const uid = user?.uid ?? '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    if (demoMode) {
      setName(DEMO_CUSTOMER_PROFILE.displayName);
      setPhone(DEMO_CUSTOMER_PROFILE.phone);
      setLoaded(true);
      return;
    }
    getProfile(uid).then((p) => {
      setName(p?.displayName ?? user?.displayName ?? '');
      setPhone(p?.phone ?? '');
      setLoaded(true);
    });
  }, [uid, user?.displayName, demoMode]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!uid || busy) return;
    if (name.trim().length < 2) {
      setNotice('Enter your full name.');
      return;
    }
    if (demoMode) {
      setNotice('Demo profile saved for this session only. Firebase was not changed.');
      return;
    }
    setBusy(true);
    const ok = await updateProfile(uid, { displayName: name, phone });
    setBusy(false);
    setNotice(ok ? 'Profile saved.' : 'Could not save. Try again.');
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Profile" description="How mechanics and support see you." />
        <LoadingState label="Loading profile…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" description="How mechanics and support see you." />
      {demoMode && <DemoNotice>Aarav Sharma is a fictional demonstration profile. Changes stay local to this demo session.</DemoNotice>}
      {notice && (
        <p role="status" className="mb-4 rounded-xl border border-line-soft bg-graphite-soft px-4 py-3 text-sm text-cream">{notice}</p>
      )}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="neutral">{profileRole ?? 'customer'}</Badge>
          <Badge tone={emailVerified ? 'success' : 'warning'}>{emailVerified ? 'email verified' : 'email unverified'}</Badge>
        </div>
        <p className="text-sm text-steel-300">Signed in as <strong className="text-cream">{demoMode ? DEMO_CUSTOMER_PROFILE.email : user?.email}</strong></p>
        <form onSubmit={onSave} className="mt-4 grid gap-3">
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Phone (optional)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" autoComplete="tel" /></Field>
          <div><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button></div>
        </form>
      </Card>
    </div>
  );
}
