/**
 * Emulator state reset for browser E2E.
 *
 * Why this is necessary (measured, not assumed): `dispatch.ts` caps a mechanic
 * at MAX_ACTIVE_JOBS = 3 live jobs. Every booking journey that ends in
 * `accepted` without reaching `completed` permanently consumes one slot, so
 * after three runs the seeded mechanic receives NO further offers. Tests then
 * fail with "offer not found" — which looks like a product bug but is really
 * leaked state from a previous run.
 *
 * This helper returns the emulator to a known baseline before each test:
 *   - terminal-ise any request still holding a live job for the mechanic,
 *   - clear stale pending offers,
 *   - restore the mechanic to approved + available.
 *
 * It uses the emulator Admin bypass (`Bearer owner`) on loopback only.
 */

export const FS_BASE = 'http://127.0.0.1:8080/v1/projects/roadassist-9c223/databases/(default)/documents';
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' } as const;

const LIVE = new Set(['accepted', 'on-the-way', 'arrived', 'service']);

interface RawDoc {
  name: string;
  fields?: Record<string, Record<string, unknown>>;
}

function idOf(doc: RawDoc): string {
  return doc.name.split('/').pop() as string;
}

function str(doc: RawDoc, key: string): string | undefined {
  return doc.fields?.[key]?.stringValue as string | undefined;
}

async function listRaw(path: string): Promise<RawDoc[]> {
  const res = await fetch(`${FS_BASE}/${path}`, { headers: ADMIN });
  if (!res.ok) throw new Error(`reset LIST ${path}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { documents?: RawDoc[] }).documents ?? [];
}

async function patch(path: string, fields: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const res = await fetch(`${FS_BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: ADMIN,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`reset PATCH ${path}: ${res.status} ${await res.text()}`);
}

async function remove(path: string): Promise<void> {
  // Deleting a request cascades nothing, so offers are removed explicitly.
  await fetch(`${FS_BASE}/${path}`, { method: 'DELETE', headers: ADMIN });
}

/**
 * Reset the emulator to a clean baseline. Safe to call before every test.
 * `mechanicId` defaults to the seeded mechanic.
 */
export async function resetEmulatorState(mechanicId = 'emul-mech'): Promise<void> {
  const requests = await listRaw('requests');

  for (const req of requests) {
    const id = idOf(req);
    const status = str(req, 'status');
    const assigned = str(req, 'mechanicId');

    // Release live jobs held by the seeded mechanic so the active-job cap
    // cannot leak across tests. Cancelling is the honest representation:
    // these are abandoned test bookings, not real completions.
    if (assigned === mechanicId && status && LIVE.has(status)) {
      await patch(`requests/${id}`, {
        status: { stringValue: 'cancelled' },
        cancelledBy: { stringValue: 'customer' },
        cancellationReason: { stringValue: 'E2E reset: abandoned test booking' },
        updatedAt: { timestampValue: new Date().toISOString() },
      });
    }

    // Drop offers attached to test requests so a stale pending offer cannot
    // make the next run believe an offer already exists.
    if (status === 'requested' && id.startsWith('neg-')) {
      const offers = await listRaw(`requests/${id}/offers`).catch(() => []);
      for (const o of offers) await remove(`requests/${id}/offers/${idOf(o)}`);
    }
  }

  // Restore the mechanic to a dispatch-eligible state.
  await patch(`mechanics/${mechanicId}`, {
    approved: { booleanValue: true },
    isAvailable: { booleanValue: true },
  });

  // Keep the public projection consistent with the private source so the
  // customer-facing directory does not report a stale availability.
  await patch(`publicMechanics/${mechanicId}`, {
    approved: { booleanValue: true },
    isAvailable: { booleanValue: true },
  }).catch(() => {
    /* projection is server-written; absence is fine for tests */
  });
}

/** Count live jobs currently assigned to a mechanic (for assertions). */
export async function liveJobCount(mechanicId = 'emul-mech'): Promise<number> {
  const requests = await listRaw('requests');
  return requests.filter((r) => {
    const status = str(r, 'status');
    return str(r, 'mechanicId') === mechanicId && !!status && LIVE.has(status);
  }).length;
}
