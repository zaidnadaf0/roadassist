import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { safeNextPath } from '@/components/RequireAuth';
import { useMechanicAccess } from '@/components/RequireMechanic';
import { Button, Field, Input } from '@/components/ui';

/**
 * M2 auth screens — real Firebase Email/Password flows.
 *
 * - No role selector: the login form cannot choose a portal and signup
 *   always creates a customer-hint profile (see userProfile.ts). Roles are
 *   never decided by form UI.
 * - `?next=` deep-links survive login via a same-origin guard.
 * - When Firebase is unconfigured the forms stay inert with an honest
 *   notice instead of failing obscurely.
 */

function useNext(defaultHome: string): string {
  const [params] = useSearchParams();
  return safeNextPath(params.get('next')) ?? defaultHome;
}

type AuthPortal = 'customer' | 'mechanic' | 'admin';

function portalForPath(pathname: string): AuthPortal {
  if (pathname.startsWith('/mechanic/')) return 'mechanic';
  if (pathname.startsWith('/admin/')) return 'admin';
  return 'customer';
}

const AUTH_COPY: Record<AuthPortal, { name: string; description: string; login: string; signup: string; home: string }> = {
  customer: { name: 'Customer workspace', description: 'Request help, follow your rescue, and keep your service history in one place.', login: '/customer/login', signup: '/customer/signup', home: '/app' },
  mechanic: { name: 'Mechanic workspace', description: 'Receive verified offers, manage active jobs, and track your earnings.', login: '/mechanic/login', signup: '/mechanic/signup', home: '/m' },
  admin: { name: 'Admin workspace', description: 'Monitor dispatch, approve mechanics, and keep the assistance network running.', login: '/admin/login', signup: '/admin/signup', home: '/admin' },
};

function PortalIntro({ portal }: { portal: AuthPortal }) {
  const copy = AUTH_COPY[portal];
  return (
    <div className="rounded-xl border border-line-soft bg-graphite-soft/40 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-safety-400">{copy.name}</p>
      <p className="mt-1 text-sm text-steel-300">{copy.description}</p>
    </div>
  );
}

function BackendNotice() {
  return (
    <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-steel-300">
      Authentication backend is not connected yet. The project configuration lands with the M2
      rollout — this form stays disabled until then.
    </p>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-cream">
      {message}
    </p>
  );
}

function useAlreadyAuthedRedirect(portal: AuthPortal): string | null {
  const { status, home, isAdmin, profileRole, authorizationResolved, demoMode } = useAuth();
  const { access } = useMechanicAccess(demoMode && portal === 'mechanic');
  const [params] = useSearchParams();
  if (status !== 'authenticated' || !authorizationResolved) return null;
  if (isAdmin === true) return '/admin';
  if (access === 'loading') return null;
  if (access === 'error') {
    if (portal === 'mechanic' || profileRole === 'mechanic') return '/m';
    return safeNextPath(params.get('next')) ?? home;
  }
  if (access.kind !== 'none' || profileRole === 'mechanic') return '/m';
  if (portal === 'mechanic') {
    const next = safeNextPath(params.get('next'));
    return next === '/m' || next?.startsWith('/m/') ? next : '/m/apply';
  }
  if (profileRole === 'admin') return '/app';
  return safeNextPath(params.get('next')) ?? home;
}

export function LoginPage() {
  const { status, configured, signIn } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const portal = portalForPath(pathname);
  const redirect = useAlreadyAuthedRedirect(portal);
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = AUTH_COPY[portal];

  if (redirect) return <Navigate to={redirect} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setError(null);
    try {
      const destination = await signIn(email, password, portal);
      const target = destination === '/admin' || (portal === 'customer' && destination === '/m')
        ? destination
        : portal === 'mechanic'
          ? (next === '/m' || next?.startsWith('/m/') ? next : destination)
          : next ?? destination;
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit} aria-label="Log in">
      <PortalIntro portal={portal} />
      {!configured && <BackendNotice />}
      <FormError message={error} />
      <Field label="Email">
        <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required disabled={!configured} />
      </Field>
      <Field label="Password">
        <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required disabled={!configured} />
      </Field>
      <Button data-testid="login-submit" type="submit" disabled={!configured || busy || status === 'loading'}>
        {busy ? 'Signing in…' : 'Log in'}
      </Button>
      <p className="text-sm text-steel-300">
        No account?{' '}
        <Link to={copy.signup} className="font-medium text-safety-400 hover:text-safety-300">
          {portal === 'admin' ? 'View enrollment' : 'Sign up'}
        </Link>{' '}
        ·{' '}
        <Link to="/forgot" className="font-medium text-safety-400 hover:text-safety-300">
          Forgot password
        </Link>
      </p>
    </form>
  );
}

export function SignupPage() {
  const { status, configured, signUp, home } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const portal = portalForPath(pathname);
  const copy = AUTH_COPY[portal];
  const requestedNext = useNext(portal === 'mechanic' ? '/m/apply' : home);
  const next = portal === 'mechanic' && requestedNext !== '/m' && !requestedNext.startsWith('/m/') ? '/m/apply' : requestedNext;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') return <Navigate to={next} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !configured) return;
    if (name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp({ displayName: name, email, password });
      navigate(`/verify?next=${encodeURIComponent(next)}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit} aria-label="Sign up">
      <PortalIntro portal={portal} />
      {portal === 'mechanic' && (
        <p className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-steel-300">
          After creating your account, you will complete a workshop application. Operations must approve it before you can receive jobs.
        </p>
      )}
      {!configured && <BackendNotice />}
      <FormError message={error} />
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Kumar" autoComplete="name" required disabled={!configured} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required disabled={!configured} />
      </Field>
      <Field label="Password" hint="Minimum 6 characters.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required minLength={6} disabled={!configured} />
      </Field>
      <Button type="submit" disabled={!configured || busy || status === 'loading'}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-sm text-steel-300">
        Have an account?{' '}
        <Link to={copy.login} className="font-medium text-safety-400 hover:text-safety-300">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function AdminSignupPage() {
  const { status, home } = useAuth();

  if (status === 'authenticated') return <Navigate to={home} replace />;

  return (
    <div className="grid gap-4" aria-label="Admin enrollment">
      <PortalIntro portal="admin" />
      <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm text-steel-200">
        <p className="font-semibold text-cream">Administrator enrollment is invitation only.</p>
        <p className="mt-1 text-steel-300">Admin access is granted by the project owner through a Firebase admin claim. A public form cannot safely create an administrator account.</p>
      </div>
      <div className="grid gap-2 rounded-xl border border-line-soft bg-graphite-card p-4 text-sm text-steel-300">
        <p className="font-semibold text-cream">How admin access works</p>
        <p>1. The project owner creates or selects the staff account.</p>
        <p>2. The owner grants the admin claim through the secured operations process.</p>
        <p>3. The staff member signs in through the admin portal.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/admin/login" className="inline-flex h-11 items-center rounded-xl bg-safety-500 px-5 text-sm font-semibold text-white hover:bg-safety-600">Admin login</Link>
        <Link to="/customer/signup" className="inline-flex h-11 items-center rounded-xl border border-line-soft px-5 text-sm font-semibold text-cream hover:border-line-strong">Create customer account</Link>
      </div>
    </div>
  );
}

export function ForgotPage() {
  const { status, configured, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="grid gap-4" role="status">
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-cream">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your
          inbox (and spam folder).
        </p>
        <p className="text-sm text-steel-300">
          <Link to="/login" className="font-medium text-safety-400 hover:text-safety-300">
            ← Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit} aria-label="Reset password">
      {!configured && <BackendNotice />}
      <FormError message={error} />
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required disabled={!configured} />
      </Field>
      <Button type="submit" disabled={!configured || busy || status === 'loading'}>
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-sm text-steel-300">
        <Link to="/login" className="font-medium text-safety-400 hover:text-safety-300">
          ← Back to log in
        </Link>
      </p>
    </form>
  );
}

export function VerifyPage() {
  const { status, configured, user, emailVerified, resendVerification } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [params] = useSearchParams();
  const continueTo = safeNextPath(params.get('next')) ?? '/app';

  if (status === 'unauthenticated') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-steel-300">
          Sign in to check your verification status.{' '}
          <Link to="/login?next=%2Fverify" className="font-medium text-safety-400 hover:text-safety-300">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  if (emailVerified) {
    return (
      <div className="grid gap-4" role="status">
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-cream">
          Your email is verified. Verification is informational for now — access policy tightening
          arrives with the M3 security phase.
        </p>
        <p className="text-sm text-steel-300">
          <Link to={continueTo} className="font-medium text-safety-400 hover:text-safety-300">
            Continue to dashboard →
          </Link>
        </p>
      </div>
    );
  }

  async function resend() {
    if (busy || !configured) return;
    setBusy(true);
    setError(null);
    try {
      await resendVerification();
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {!configured && <BackendNotice />}
      <FormError message={error} />
      <p className="text-sm text-steel-300">
        We sent a verification link to <strong className="text-cream">{user?.email ?? 'your email'}</strong>.
        Click it, then reload this page.
      </p>
      {sent && (
        <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-cream">
          Fresh link sent. Check your inbox.
        </p>
      )}
      <Button onClick={resend} disabled={!configured || busy}>
        {busy ? 'Sending…' : 'Resend verification email'}
      </Button>
    </div>
  );
}
