/**
 * Hard safety gate for browser E2E.
 *
 * RoadAssist's emulator env uses the SAME Firebase project id (`roadassist-9c223`)
 * as the real project. Emulator isolation therefore depends entirely on the
 * SDK `connect*Emulator` calls, which only run when `VITE_USE_EMULATORS=true`.
 * If that flag is missing, the app would talk to PRODUCTION.
 *
 * This module refuses to let a browser test start unless BOTH hold:
 *   1. The local emulators answer on the documented loopback ports.
 *   2. `.env.emulator` explicitly enables emulator mode.
 *
 * Every check targets 127.0.0.1 with a literal, never an env-derived host,
 * so there is no configuration by which this can reach Google.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PROJECT_ID = 'roadassist-9c223';
export const EMULATOR_BASE = 'http://127.0.0.1:8080';
export const EMULATOR_ORIGIN = '127.0.0.1';

/** Ports we require to be alive before any browser opens. */
export const REQUIRED_EMULATORS = [
  { name: 'auth', port: 9099 },
  { name: 'firestore', port: 8080 },
  { name: 'functions', port: 5001 },
] as const;

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Read the emulator env file and assert it is genuinely emulator-shaped.
 * Throws with an actionable message; never silently continues.
 */
export function assertEmulatorEnv(): void {
  const env = parseEnvFile(join(root, '.env.emulator'));
  const problems: string[] = [];

  if (!env.VITE_FIREBASE_API_KEY) problems.push('.env.emulator has no VITE_FIREBASE_API_KEY');
  if (!env.VITE_FIREBASE_PROJECT_ID) problems.push('.env.emulator has no VITE_FIREBASE_PROJECT_ID');
  if (env.VITE_USE_EMULATORS !== 'true') {
    problems.push(
      `.env.emulator must set VITE_USE_EMULATORS=true (found: ${env.VITE_USE_EMULATORS ?? '<unset>'}) — ` +
        'without it the app would target PRODUCTION Firebase',
    );
  }
  if (env.VITE_ROADASSIST_MODE === 'demo') {
    problems.push(
      '.env.emulator sets VITE_ROADASSIST_MODE=demo — fixtures never touch Firestore, ' +
        'so the journey would "pass" without a real booking',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      '\n\nE2E SAFETY GUARD BLOCKED THE RUN\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nFix .env.emulator before running browser tests.\n',
    );
  }
}

/** True when something is listening and speaking HTTP on the loopback port. */
export async function portAnswers(port: number, path = '/'): Promise<boolean> {
  const url = `http://${EMULATOR_ORIGIN}:${port}${path}`;
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2500) });
    // Any HTTP status proves something answered. The emulators return 404/200
    // depending on the path; both mean "reachable".
    return res.status > 0;
  } catch {
    return false;
  }
}

/** Assert every required emulator answers, or fail loudly. */
export async function assertEmulatorsReachable(): Promise<void> {
  const dead: string[] = [];
  for (const e of REQUIRED_EMULATORS) {
    if (!(await portAnswers(e.port))) dead.push(`${e.name} (127.0.0.1:${e.port})`);
  }
  if (dead.length > 0) {
    throw new Error(
      '\n\nE2E SAFETY GUARD BLOCKED THE RUN\n' +
        `  Local emulators are not reachable: ${dead.join(', ')}\n\n` +
        'Start them first:  npm run dev:emulators\n' +
        'Then seed:         npm run seed:local\n' +
        'Browser E2E never runs against a live endpoint.\n',
    );
  }
}

/* ---------------- Firestore emulator REST (admin bypass) ---------------- */

const DOCS = `${EMULATOR_BASE}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * The Firestore emulator evaluates security rules for REST reads, which
 * correctly denies anonymous listing. `Bearer owner` is the emulator's
 * documented admin bypass — it substitutes for a service account and gives
 * the test a trusted view of committed state. It is loopback-only and
 * carries no credential from any real project.
 */
const ADMIN_HEADERS = { Authorization: 'Bearer owner' } as const;

export interface FsDoc {
  id: string;
  fields: Record<string, unknown>;
}

/** Typed view over a Firestore REST value object. */
export function fieldValue(doc: FsDoc, key: string): unknown {
  const anyFields = doc.fields as Record<string, Record<string, unknown>>;
  const f = anyFields[key];
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('nullValue' in f) return null;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return f.arrayValue;
  return undefined;
}

function toDoc(d: { name: string; fields?: Record<string, unknown> }): FsDoc {
  return { id: d.name.split('/').pop() as string, fields: d.fields ?? {} };
}

/** Read one document. Returns null when it does not exist. */
export async function getDoc(path: string): Promise<FsDoc | null> {
  const res = await fetch(`${DOCS}/${path}`, { headers: ADMIN_HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} failed: ${res.status} ${await res.text()}`);
  return toDoc((await res.json()) as { name: string; fields?: Record<string, unknown> });
}

/** List a collection or subcollection. */
export async function listDocs(path: string): Promise<FsDoc[]> {
  const res = await fetch(`${DOCS}/${path}`, { headers: ADMIN_HEADERS });
  if (!res.ok) throw new Error(`Firestore LIST ${path} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, unknown> }[] };
  return (body.documents ?? []).map(toDoc);
}

/**
 * Poll until `predicate` holds. Firestore triggers (onRequestCreate ->
 * createOfferBatch) are asynchronous, so a snapshot immediately after a write
 * can legitimately be behind. Polling is the honest way to assert eventual
 * state without weakening the assertion to "eventually something".
 */
export async function waitForDoc(
  path: string,
  predicate: (doc: FsDoc | null) => boolean,
  { timeoutMs = 30_000, label = path } = {},
): Promise<FsDoc | null> {
  const deadline = Date.now() + timeoutMs;
  let last: FsDoc | null = null;
  while (Date.now() < deadline) {
    last = await getDoc(path);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}. Last observed: ${JSON.stringify(last)}`);
}

/** Find the newest request created by a customer whose problemText matches. */
export async function findRequestByProblemText(customerId: string, needle: string): Promise<FsDoc | null> {
  const all = await listDocs('requests');
  const matches = all.filter(
    (d) => fieldValue(d, 'customerId') === customerId && String(fieldValue(d, 'problemText') ?? '').includes(needle),
  );
  if (matches.length === 0) return null;
  const withTime = matches.map((d) => ({
    d,
    t: Date.parse(String(fieldValue(d, 'createdAt') ?? '')) || 0,
  }));
  withTime.sort((a, b) => b.t - a.t);
  return withTime[0].d;
}
