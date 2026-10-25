import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseAuth, firebaseConfigured, firebaseDb } from '@/lib/firebase';
import { mapAuthError } from '@/lib/authErrors';
import {
  USER_COLLECTION,
  buildNewUserProfile,
  homeForHint,
  isProfileHint,
  type ProfileHint,
} from '@/lib/userProfile';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  /** False when no Firebase config is present — auth calls throw a clear error. */
  configured: boolean;
  user: User | null;
  emailVerified: boolean;
  /** Role hint from `users/{uid}.role`. UI routing convenience ONLY — never authority. */
  profileRole: ProfileHint | null;
  /**
   * Admin authority from the Firebase ID-token custom claim.
   * null = unknown (or unconfigured). Minted server-side in a later phase;
   * until then this is always false for real users. Never set from the client.
   */
  isAdmin: boolean | null;
  home: string;
  signUp: (input: SignUpInput) => Promise<void>;
  /** Resolves to the correct portal home after role/claim hints are loaded. */
  signIn: (email: string, password: string) => Promise<string>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Force-refresh the ID token (picks up a freshly minted claim). */
  refreshClaim: () => Promise<void>;
  /** Explicit local presentation mode. Demo records never touch Firebase. */
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  /** Changes whenever another demo tab mutates the isolated workflow. */
  demoRevision: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_TIMEOUT_MS = 8000;
const DEMO_MODE_KEY = 'roadassist.demoMode';

function initialDemoMode(): boolean {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(DEMO_MODE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  }
  // Local Vite presentation builds default to the isolated demo environment.
  // A production build is live-only unless explicitly configured otherwise.
  return import.meta.env.VITE_ROADASSIST_MODE === 'demo' || (import.meta.env.DEV && import.meta.env.VITE_ROADASSIST_MODE !== 'live');
}

function notConfigured(): Error {
  return new Error('Authentication backend is not connected yet. Add your Firebase configuration and reload.');
}

async function readProfileRole(uid: string): Promise<ProfileHint | null> {
  try {
    const db = firebaseDb();
    if (!db) return null;
    const snap = await Promise.race([
      getDoc(doc(db, USER_COLLECTION, uid)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('role-timeout')), ROLE_TIMEOUT_MS)),
    ]);
    if (!snap.exists()) return null;
    const role = (snap.data() as { role?: unknown }).role;
    return isProfileHint(role) ? role : null;
  } catch {
    return null;
  }
}

async function readAdminClaim(user: User): Promise<boolean> {
  try {
    const token = await user.getIdTokenResult(false);
    return token.claims?.admin === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileHint | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [demoMode, setDemoModeState] = useState(initialDemoMode);
  const [demoRevision, setDemoRevision] = useState(0);

  const setDemoMode = useCallback((enabled: boolean) => {
    setDemoModeState(enabled);
    if (typeof window !== 'undefined') window.localStorage.setItem(DEMO_MODE_KEY, String(enabled));
  }, []);

  useEffect(() => {
    const refresh = () => setDemoRevision((value) => value + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('roadassist-demo-state', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('roadassist-demo-state', refresh);
    };
  }, []);

  useEffect(() => {
    const auth = firebaseAuth();
    if (!auth) {
      setStatus('unauthenticated');
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setStatus('unauthenticated');
        setProfileRole(null);
        setIsAdmin(null);
        return;
      }
      setStatus('authenticated');
      // Resolve hint + claim without blocking the shell on either.
      void readProfileRole(u.uid).then(setProfileRole);
      void readAdminClaim(u).then(setIsAdmin);
    });
  }, []);

  const signUp = useCallback(async ({ displayName, email, password }: SignUpInput) => {
    const auth = firebaseAuth();
    if (!auth) throw notConfigured();
    let created: User;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      created = cred.user;
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
    // Profile foundation: customer-only role (see userProfile.ts contract).
    try {
      const db = firebaseDb();
      if (db) {
        const profile = buildNewUserProfile(created.uid, created.email ?? email, displayName);
        await setDoc(doc(db, USER_COLLECTION, created.uid), {
          ...profile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Auth succeeded; the profile sync can be retried later. Never strand signup.
      console.warn('[auth] profile write failed; continuing signed in');
    }
    try {
      await sendEmailVerification(created);
    } catch {
      // Non-fatal: /verify offers an explicit resend.
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string> => {
    const auth = firebaseAuth();
    if (!auth) throw notConfigured();
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const [role, admin] = await Promise.all([
        readProfileRole(cred.user.uid),
        readAdminClaim(cred.user),
      ]);
      setProfileRole(role);
      setIsAdmin(admin);
      return admin ? '/admin' : homeForHint(role);
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = firebaseAuth();
    if (!auth) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    await fbSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const auth = firebaseAuth();
    if (!auth) throw notConfigured();
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  }, []);

  const resendVerification = useCallback(async () => {
    const auth = firebaseAuth();
    const current = auth?.currentUser;
    if (!auth || !current) throw notConfigured();
    try {
      await sendEmailVerification(current);
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  }, []);

  const refreshClaim = useCallback(async () => {
    const auth = firebaseAuth();
    const current = auth?.currentUser;
    if (!current) return;
    try {
      const token = await current.getIdToken(true);
      void token;
      setIsAdmin(await readAdminClaim(current));
    } catch {
      // Keep the last known value; the next natural refresh will retry.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      configured: firebaseConfigured,
      user,
      emailVerified: user?.emailVerified ?? false,
      profileRole,
      isAdmin,
      home: homeForHint(profileRole),
      signUp,
      signIn,
      signOut,
      resetPassword,
      resendVerification,
      refreshClaim,
      demoMode,
      setDemoMode,
      demoRevision,
    }),
    [status, user, profileRole, isAdmin, signUp, signIn, signOut, resetPassword, resendVerification, refreshClaim, demoMode, setDemoMode, demoRevision],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
