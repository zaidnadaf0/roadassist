import {
  Timestamp,
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebaseDb, firebaseFunctions } from './firebase';

/**
 * M8 client dispatch layer.
 *
 * Authority ladder: the `acceptOffer`/`declineOffer` callables validate
 * server-side (offer ownership, expiry vs server time, live eligibility).
 * Cloud Functions are the only mutation path. Countdowns displayed from
 * `expiresAt` are UI ONLY; the backend timestamp decides validity.
 */

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'superseded';
export type AcceptResult = 'accepted' | 'expired' | 'alreadyTaken' | 'forbidden' | 'error';
export type DeclineResult = 'declined' | 'alreadyTaken' | 'forbidden' | 'error';

export interface OfferView {
  id: string;
  requestId: string;
  mechanicId: string;
  mechanicName?: string;
  expiresAtMs: number | null;
  status: OfferStatus;
  round?: number;
}

function requireDb(): Firestore {
  const db = firebaseDb();
  if (!db) throw new Error('Backend not connected.');
  return db;
}

function asOffer(requestId: string, id: string, raw: DocumentData | undefined): OfferView | null {
  if (!raw) return null;
  const exp = raw.expiresAt;
  return {
    id,
    requestId,
    mechanicId: typeof raw.mechanicId === 'string' ? raw.mechanicId : '',
    mechanicName: typeof raw.mechanicName === 'string' ? raw.mechanicName : undefined,
    expiresAtMs: exp instanceof Timestamp ? exp.toMillis() : null,
    status: raw.status as OfferStatus,
    round: typeof raw.round === 'number' ? raw.round : undefined,
  };
}

/** Pending offers addressed to one mechanic (display + countdown source). */
export function watchMyOffers(
  mechanicId: string,
  cb: (offers: OfferView[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collectionGroup(d, 'offers'), where('mechanicId', '==', mechanicId), where('status', '==', 'pending')),
      (snap) =>
        cb(
          snap.docs
            .map((s) => {
              const reqId = s.ref.parent.parent?.id ?? '';
              return asOffer(reqId, s.id, s.data());
            })
            .filter((o): o is OfferView => o !== null),
        ),
      (err) => {
        // With an error handler the caller owns the failure state — never
        // masquerade a query/rules failure as an empty queue. Callers
        // without a handler keep the legacy empty-array behavior.
        if (onError) onError(err as Error);
        else cb([]);
      },
    );
  } catch {
    return null;
  }
}

/**
 * Pending offers on one request (customer dispatch-state source).
 * The customerId filter is REQUIRED, not cosmetic: list rules must be
 * provably scoped by the query, and the offers rule authorizes via
 * denormalized customerId (no parent lookup). Unfiltered scans are denied.
 */
export function watchRequestOffers(
  requestId: string,
  customerId: string,
  cb: (offers: OfferView[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(
        collection(d, 'requests', requestId, 'offers'),
        where('customerId', '==', customerId),
        where('status', '==', 'pending'),
      ),
      (snap) =>
        cb(
          snap.docs
            .map((s) => asOffer(requestId, s.id, s.data()))
            .filter((o): o is OfferView => o !== null),
        ),
      (err) => {
        // Caller with a handler owns the failure state; without one the
        // legacy empty-array behavior is preserved.
        if (onError) onError(err as Error);
        else cb([]);
      },
    );
  } catch {
    return null;
  }
}

/** All offers ever addressed to one mechanic (acceptance-rate source, bounded). */
export function watchMyOfferHistory(
  mechanicId: string,
  cb: (offers: OfferView[]) => void,
  max = 50,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collectionGroup(d, 'offers'), where('mechanicId', '==', mechanicId), limit(max)),
      (snap) =>
        cb(
          snap.docs
            .map((s) => {
              const reqId = s.ref.parent.parent?.id ?? '';
              return asOffer(reqId, s.id, s.data());
            })
            .filter((o): o is OfferView => o !== null),
        ),
      (err) => {
        if (onError) onError(err as Error);
        else cb([]);
      },
    );
  } catch {
    return null;
  }
}

/** Display-only countdown text. Validity is decided server-side. Pure — tested. */
export function offerCountdown(expiresAtMs: number | null, nowMs = Date.now()): string | null {
  if (expiresAtMs == null) return null;
  const s = Math.max(0, Math.round((expiresAtMs - nowMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function callableUnreachable(e: unknown): boolean {
  const code = String((e as { code?: unknown } | null)?.code ?? '');
  return (
    code.includes('not-found') ||
    code.includes('unavailable') ||
    code.includes('internal') ||
    code.includes('unknown')
  );
}

export type DispatchAcceptResult = AcceptResult | 'offer-expired' | 'offer-missing' | 'ineligible';

/** Accept only through the server-authoritative callable. */
export async function acceptViaDispatch(
  requestId: string,
): Promise<DispatchAcceptResult> {
  const fns = firebaseFunctions();
  if (fns) {
    try {
      const call = httpsCallable<{ requestId: string }, { success: boolean }>(fns, 'acceptOffer');
      const res = await call({ requestId });
      if (res.data?.success) return 'accepted';
      return 'error';
    } catch (e) {
      if (!callableUnreachable(e)) {
        const code = String((e as { code?: unknown } | null)?.code ?? '');
        if (code.includes('deadline-exceeded')) return 'offer-expired';
        if (code.includes('aborted')) return 'alreadyTaken';
        if (code.includes('permission-denied')) return 'ineligible';
        if (code.includes('not-found')) return 'offer-missing';
        return 'error';
      }
      // Functions unreachable (not deployed / offline) — there is no client
      // fallback: assignment is server-only, so surface a plain error the
      // UI can explain as "try again later".
    }
  }
  return 'error';
}

export type DispatchDeclineResult = DeclineResult;

/** Decline only through the server-authoritative callable. */
export async function declineViaDispatch(requestId: string): Promise<DispatchDeclineResult> {
  const fns = firebaseFunctions();
  if (fns) {
    try {
      const call = httpsCallable<{ requestId: string }, { success: boolean }>(fns, 'declineOffer');
      await call({ requestId });
      return 'declined';
    } catch (e) {
      if (!callableUnreachable(e)) {
        const code = String((e as { code?: unknown } | null)?.code ?? '');
        if (code.includes('permission-denied') || code.includes('unauthenticated')) return 'forbidden';
        return 'error';
      }
    }
  }
  return 'error';
}
