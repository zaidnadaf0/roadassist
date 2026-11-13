import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { expireStaleOffers, rematchRequest, sweepRequest } from '../functions/src/dispatch';

/**
 * Server-side offer-expiry and rematch.
 *
 * Why this suite exists: `scheduledOfferSweep` is a pubsub scheduled function,
 * and scheduled triggers DO NOT FIRE in the Firebase emulator (measured: zero
 * executions across a 30-minute session with the pubsub emulator running).
 * A browser test therefore cannot wait for the sweep — it would just time out.
 *
 * Here we invoke the exact functions the sweep calls (`sweepRequest` ->
 * `expireStaleOffers` + `rematchRequest`) directly against real Firestore, so
 * the expiry and rematch behaviour is genuinely proven rather than skipped.
 */

const PROJECT_ID = 'roadassist-9c223';
let app: App;

beforeAll(() => {
  // Point the Admin SDK at the local emulator explicitly. Under
  // `emulators:exec` this is already set; setting it here also lets the file
  // run standalone against a manually started emulator (as the E2E workflow
  // does). Loopback only — never a real project.
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  }
  // The emulator vitest config aliases firebase-admin to the root copy, so
  // Admin-SDK prototype checks (Timestamp/FieldValue) stay consistent.
  app = initializeApp({ projectId: PROJECT_ID }, 'sweep-suite');
});

afterAll(async () => {
  await deleteApp(app).catch(() => {});
});

const db = () => getFirestore(app);

const DOCS =
  'http://127.0.0.1:8080/v1/projects/roadassist-9c223/databases/(default)/documents';
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' } as const;

async function emulatorUp(): Promise<boolean> {
  try {
    const r = await fetch(`${DOCS}/requests`, { headers: ADMIN, signal: AbortSignal.timeout(2000) });
    return r.status > 0;
  } catch {
    return false;
  }
}

/** Seed a request + one pending offer whose window already closed. */
async function seedExpired(requestId: string, mechanicId: string): Promise<void> {
  const now = Date.now();
  await fetch(`${DOCS}/requests?documentId=${requestId}`, {
    method: 'POST',
    headers: ADMIN,
    body: JSON.stringify({
      fields: {
        id: { stringValue: requestId },
        customerId: { stringValue: 'emul-cust' },
        vehicleId: { stringValue: 'emul-veh-1' },
        problemText: { stringValue: `sweep probe ${requestId}` },
        problemCategory: { stringValue: 'battery' },
        customerLat: { doubleValue: 12.9716 },
        customerLng: { doubleValue: 77.5946 },
        status: { stringValue: 'requested' },
        mechanicId: { nullValue: null },
        offerExpiresAt: { timestampValue: new Date(now - 3_600_000).toISOString() },
        createdAt: { timestampValue: new Date(now).toISOString() },
        updatedAt: { timestampValue: new Date(now).toISOString() },
      },
    }),
  });
  await fetch(`${DOCS}/requests/${requestId}/offers?documentId=${mechanicId}`, {
    method: 'POST',
    headers: ADMIN,
    body: JSON.stringify({
      fields: {
        requestId: { stringValue: requestId },
        customerId: { stringValue: 'emul-cust' },
        mechanicId: { stringValue: mechanicId },
        mechanicName: { stringValue: 'Morgan Motors' },
        status: { stringValue: 'pending' },
        round: { integerValue: 0 },
        createdAt: { timestampValue: new Date(now).toISOString() },
        expiresAt: { timestampValue: new Date(now - 3_600_000).toISOString() },
      },
    }),
  });
}

describe('server-side offer expiry and rematch', () => {
  it('expireStaleOffers marks only genuinely expired pending offers', async () => {
    if (!(await emulatorUp())) {
      console.warn('[sweep] SKIPPED: emulators not running (npm run dev:emulators)');
      return;
    }
    const requestId = `sweep-expire-${Date.now().toString(36)}`;
    await seedExpired(requestId, 'emul-mech');

    const n = await expireStaleOffers(db(), requestId, Date.now());
    expect(n).toBe(1);

    const offer = await db().collection('requests').doc(requestId).collection('offers').doc('emul-mech').get();
    expect(offer.data()?.status).toBe('expired');
  });

  it('sweepRequest expires the stale offer and opens the next round', async () => {
    if (!(await emulatorUp())) return;
    const requestId = `sweep-rematch-${Date.now().toString(36)}`;
    await seedExpired(requestId, 'emul-mech');

    const result = await sweepRequest(db(), requestId, Date.now());
    expect(result.expired).toBe(1);
    expect(result.rematched).toBe(true);

    const req = await db().collection('requests').doc(requestId).get();
    // The round advanced, proving rematch actually ran.
    expect(req.data()?.rematchRound).toBe(1);
    // Still open and unassigned: a rematch must not invent an assignment.
    expect(req.data()?.status).toBe('requested');
    expect(req.data()?.mechanicId ?? null).toBeNull();
  });

  it('a request already assigned is never swept or rematched', async () => {
    if (!(await emulatorUp())) return;
    const requestId = `sweep-assigned-${Date.now().toString(36)}`;
    await seedExpired(requestId, 'emul-mech');

    // Simulate an out-of-band assignment.
    await fetch(`${DOCS}/requests/${requestId}?updateMask.fieldPaths=status&updateMask.fieldPaths=mechanicId`, {
      method: 'PATCH',
      headers: ADMIN,
      body: JSON.stringify({
        fields: { status: { stringValue: 'accepted' }, mechanicId: { stringValue: 'emul-mech' } },
      }),
    });

    const result = await sweepRequest(db(), requestId, Date.now());
    expect(result).toEqual({ expired: 0, rematched: false });

    const req = await db().collection('requests').doc(requestId).get();
    expect(req.data()?.status).toBe('accepted');
    expect(req.data()?.rematchRound ?? 0).toBe(0);
  });

  it('rematchRequest stops honestly once the round budget is exhausted', async () => {
    if (!(await emulatorUp())) return;
    const requestId = `sweep-rounds-${Date.now().toString(36)}`;
    await seedExpired(requestId, 'emul-mech');

    // Pin the round at the cap.
    await fetch(`${DOCS}/requests/${requestId}?updateMask.fieldPaths=rematchRound`, {
      method: 'PATCH',
      headers: ADMIN,
      body: JSON.stringify({ fields: { rematchRound: { integerValue: 5 } } }),
    });

    const result = await rematchRequest(db(), requestId);
    expect(result.stopped).toBe('rounds-exhausted');
    expect(result.offers).toBe(0);
  });

  it('clock skew is respected: a still-live offer is NOT expired', async () => {
    if (!(await emulatorUp())) return;
    const requestId = `sweep-live-${Date.now().toString(36)}`;
    await seedExpired(requestId, 'emul-mech');

    // Rewrite the offer to be live for the next two minutes.
    await fetch(`${DOCS}/requests/${requestId}/offers/emul-mech?updateMask.fieldPaths=expiresAt`, {
      method: 'PATCH',
      headers: ADMIN,
      body: JSON.stringify({
        fields: { expiresAt: { timestampValue: new Date(Date.now() + 120_000).toISOString() } },
      }),
    });

    const n = await expireStaleOffers(db(), requestId, Date.now());
    expect(n).toBe(0);

    const offer = await db().collection('requests').doc(requestId).collection('offers').doc('emul-mech').get();
    expect(offer.data()?.status).toBe('pending');
    // Timestamp sanity: the value is a real Firestore Timestamp.
    expect(offer.data()?.expiresAt).toBeInstanceOf(Timestamp);
  });
});
