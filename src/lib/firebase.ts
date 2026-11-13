import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

/**
 * M2 Firebase initialization (modular SDK only — no compat SDK).
 *
 * Values come EXCLUSIVELY from Vite environment variables (`.env.local`,
 * gitignored). No Firebase values are hard-coded anywhere in src — see
 * `noSecrets.test.ts`, which fails the suite if an `AIza` key or a
 * project ID ever appears in source.
 *
 * When required variables are missing the app runs in honest
 * UNCONFIGURED mode: `firebaseConfigured === false`, all singletons
 * return null, and auth screens explain the backend is not connected
 * instead of failing obscurely.
 */

export interface FirebaseWebConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

/** Read the web config from a Vite-style env record. Pure — unit-tested. */
export function readWebConfig(env: Record<string, string | undefined>): FirebaseWebConfig {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

/** Complete enough to initialize Firebase Auth + Firestore. Pure — unit-tested. */
export function isConfigComplete(config: FirebaseWebConfig): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

const webConfig = readWebConfig(import.meta.env);

/** False until a real `.env.local` is present. Auth UI gates on this. */
export const firebaseConfigured: boolean = isConfigComplete(webConfig);

/** The connected project ID, for diagnostics only. Undefined when unconfigured. */
export const firebaseProjectId: string | undefined = webConfig.projectId || undefined;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;

export function firebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  if (!_app) _app = initializeApp(webConfig);
  return _app;
}

/**
 * Dev-only emulator seam: set VITE_USE_EMULATORS=true to wire Auth
 * (127.0.0.1:9099), Firestore (127.0.0.1:8080) and Functions
 * (127.0.0.1:5001) to the local Firebase Emulator Suite. Production
 * behavior is unchanged — the flag is read once at init and never set in
 * any deployed environment. Always-on-auth imports keep the module tree
 * clean; the connections are made lazily inside the singletons.
 */
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

export function firebaseAuth(): Auth | null {
  const app = firebaseApp();
  if (!app) return null;
  if (!_auth) {
    _auth = getAuth(app);
    if (USE_EMULATORS) connectAuthEmulator(_auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return _auth;
}

/**
 * Firestore singleton foundation (M2). Used ONLY for the `users/{uid}`
 * profile document written at signup. Business collections arrive in M3.
 * Null when unconfigured.
 */
export function firebaseDb(): Firestore | null {
  const app = firebaseApp();
  if (!app) return null;
  if (!_db) {
    _db = getFirestore(app);
    if (USE_EMULATORS) connectFirestoreEmulator(_db, '127.0.0.1', 8080);
  }
  return _db;
}

/**
 * Cloud Functions singleton (M6). Used ONLY for trusted callables
 * (`setMechanicApproval`; admin-claim callables in later phases).
 * The client NEVER mints claims — callables enforce caller authority
 * server-side. Null when unconfigured.
 */
export function firebaseFunctions(): Functions | null {
  const app = firebaseApp();
  if (!app) return null;
  if (!_functions) {
    _functions = getFunctions(app);
    if (USE_EMULATORS) connectFunctionsEmulator(_functions, '127.0.0.1', 5001);
  }
  return _functions;
}
