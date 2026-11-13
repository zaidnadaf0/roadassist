import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseDb } from './firebase';
import { OFFER_WINDOW_MS, type RequestStatus, type ServiceRequest } from './customer';

export type { RequestStatus, ServiceRequest } from './customer';

/**
 * M5 mechanic data layer — every write stays inside the M3 rules allowlists:
 * self-update {isAvailable, currentLat, currentLng, locationUpdatedAt,
 * updatedAt}, approval-frozen, rating-frozen, first-assignment shape,
 * append-only declinedBy, release shape with timestamp releasedAt.
 * No GPS writes in M5 (location push arrives with M7).
 */

export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'suspended' | 'rejected';

export interface MechanicRecord {
  id: string;
  name: string;
  approved: boolean;
  verificationStatus?: VerificationStatus;
  specialties: string[];
  vehicleTypes?: string[];
  experienceYears?: number;
  serviceRadiusKm?: number;
  isAvailable: boolean;
  rating?: number;
  reviewCount?: number;
  vehicleDescription?: string | null;
  garageName?: string;
  garageAddress?: string;
  baseLat?: number | null;
  baseLng?: number | null;
}

export type MechanicAccess =
  | { kind: 'none' }
  | { kind: 'pending' | 'under_review' | 'suspended' | 'rejected'; record: MechanicRecord }
  | { kind: 'approved'; record: MechanicRecord };

/** Map a record (or its absence) to a UX access state. Pure — tested. */
export function accessForRecord(record: MechanicRecord | null): MechanicAccess {
  if (!record) return { kind: 'none' };
  if (record.approved && record.verificationStatus !== 'suspended') return { kind: 'approved', record };
  const s = record.verificationStatus;
  if (s === 'pending' || s === 'under_review' || s === 'suspended' || s === 'rejected') {
    return { kind: s, record };
  }
  return { kind: 'none' };
}

export const RELEASABLE: RequestStatus[] = ['accepted', 'on-the-way', 'arrived', 'service'];
export const TERMINAL: RequestStatus[] = ['completed', 'cancelled'];
export const NEXT_STATUS: Partial<Record<RequestStatus, RequestStatus>> = {
  accepted: 'on-the-way',
  'on-the-way': 'arrived',
  arrived: 'service',
  service: 'completed',
};

/** Client-side transition guard mirroring the rules (defense in depth). Pure — tested. */
export function canAdvance(from: RequestStatus, to: RequestStatus): boolean {
  return NEXT_STATUS[from] === to;
}

function requireDb(): Firestore {
  const db = firebaseDb();
  if (!db) throw new Error('Backend not connected.');
  return db;
}

function asRecord(id: string, raw: DocumentData | undefined): MechanicRecord | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<MechanicRecord, 'id'>) };
}
function asRequest(id: string, raw: DocumentData | undefined): ServiceRequest | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<ServiceRequest, 'id'>) };
}
function requestTimeMs(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/* ---------------- profile / approval ---------------- */

export async function getMyMechanicRecord(uid: string): Promise<MechanicRecord | null> {
  try {
    const d = requireDb();
    const snap = await getDoc(doc(d, 'mechanics', uid));
    return snap.exists() ? asRecord(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

export function watchMyMechanicRecord(
  uid: string,
  cb: (r: MechanicRecord | null) => void,
  onError: () => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      doc(d, 'mechanics', uid),
      (snap) => cb(snap.exists() ? asRecord(snap.id, snap.data()) : null),
      () => onError(),
    );
  } catch {
    onError();
    return null;
  }
}

export async function setAvailability(uid: string, available: boolean): Promise<boolean> {
  try {
    const d = requireDb();
    await updateDoc(doc(d, 'mechanics', uid), { isAvailable: available, updatedAt: serverTimestamp() });
    return true;
  } catch {
    return false;
  }
}

export interface MechanicApplication {
  name: string;
  garageName: string;
  garageAddress: string;
  specialties: string[];
  vehicleTypes: string[];
  experienceYears: number;
  serviceRadiusKm: number;
  isAvailable: boolean;
  vehicleDescription?: string;
  phone?: string | null;
  email?: string | null;
  baseLat?: number | null;
  baseLng?: number | null;
}

/**
 * Self-onboarding application. Writes approved:false + pending — approval
 * itself is exclusively server/admin-side. Contact goes to private/contact.
 */
export async function applyAsMechanic(uid: string, app: MechanicApplication): Promise<void> {
  const d = requireDb();
  const batch = writeBatch(d);
  batch.set(doc(d, 'mechanics', uid), {
    uid,
    name: app.name.trim(),
    approved: false,
    verificationStatus: 'pending',
    specialties: app.specialties,
    vehicleTypes: app.vehicleTypes,
    experienceYears: app.experienceYears,
    serviceRadiusKm: app.serviceRadiusKm,
    isAvailable: app.isAvailable,
    vehicleDescription: app.vehicleDescription?.trim() || null,
    garageName: app.garageName.trim(),
    garageAddress: app.garageAddress.trim(),
    baseLat: app.baseLat ?? null,
    baseLng: app.baseLng ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(d, 'mechanics', uid, 'private', 'contact'),
    { phone: app.phone?.trim() || null, email: app.email?.trim().toLowerCase() || null, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}

export interface MechanicContact {
  phone: string | null;
  email: string | null;
}

export async function getMyContact(uid: string): Promise<MechanicContact | null> {
  try {
    const d = requireDb();
    const snap = await getDoc(doc(d, 'mechanics', uid, 'private', 'contact'));
    if (!snap.exists()) return null;
    const raw = snap.data() as Partial<MechanicContact>;
    return {
      phone: typeof raw.phone === 'string' ? raw.phone : null,
      email: typeof raw.email === 'string' ? raw.email : null,
    };
  } catch {
    return null;
  }
}

export async function updateMyContact(uid: string, patch: { phone?: string | null; email?: string | null }): Promise<boolean> {
  try {
    const d = requireDb();
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.phone !== undefined) clean.phone = patch.phone?.trim() || null;
    if (patch.email !== undefined) clean.email = patch.email?.trim().toLowerCase() || null;
    await setDoc(doc(d, 'mechanics', uid, 'private', 'contact'), clean, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/* ---------------- live location (M7) ---------------- */

/**
 * Push the mechanic's live fix onto their OWN profile doc. Allowed keys only
 * (currentLat/currentLng/locationUpdatedAt/updatedAt); finite numbers only.
 * Callers MUST gate on an active job + throttle (see useWatchPosition).
 */
export async function pushMechanicLocation(uid: string, lat: number, lng: number): Promise<boolean> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  try {
    const d = requireDb();
    await updateDoc(doc(d, 'mechanics', uid), {
      currentLat: lat,
      currentLng: lng,
      locationUpdatedAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Push the mechanic's live fix onto the ASSIGNED request (the pin the
 * customer tracks). Same gating/throttle contract as above. Completion
 * nulls these fields (see advanceJob); the server trigger clears the
 * profile copy.
 */
export async function pushMechanicLocationToRequest(requestId: string, lat: number, lng: number): Promise<boolean> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  try {
    const d = requireDb();
    await updateDoc(doc(d, 'requests', requestId), {
      mechanicLat: lat,
      mechanicLng: lng,
      mechanicLocationUpdatedAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/* ---------------- queue / jobs ---------------- */

/** Requests reachable through a pending offer addressed to this mechanic. */
export function watchIncoming(
  cb: (jobs: ServiceRequest[]) => void,
  mechanicUid: string,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    const subscriptions = new Map<string, Unsubscribe>();
    const requests = new Map<string, ServiceRequest>();
    let stopped = false;
    const emit = () => {
      if (!stopped) {
        cb([...requests.values()].sort((a, b) => requestTimeMs(b.createdAt) - requestTimeMs(a.createdAt)));
      }
    };
    const offers = query(
      collectionGroup(d, 'offers'),
      where('mechanicId', '==', mechanicUid),
      where('status', '==', 'pending'),
      limit(50),
    );
    const stopOffers = onSnapshot(offers, (snap) => {
      const wanted = new Map<string, DocumentReference>();
      for (const offer of snap.docs) {
        const expiresAt = offer.data().expiresAt;
        if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) continue;
        const requestRef = offer.ref.parent.parent;
        if (requestRef) wanted.set(requestRef.id, requestRef);
      }
      for (const [id, stop] of subscriptions) {
        if (!wanted.has(id)) {
          stop();
          subscriptions.delete(id);
          requests.delete(id);
        }
      }
      for (const [id, requestRef] of wanted) {
        if (subscriptions.has(id)) continue;
        const stop = onSnapshot(requestRef, (requestSnap) => {
          const job = requestSnap.exists() ? asRequest(requestSnap.id, requestSnap.data()) : null;
          if (job?.status === 'requested' && !job.mechanicId && !(job.declinedBy ?? []).includes(mechanicUid)) {
            requests.set(id, job);
          } else {
            requests.delete(id);
          }
          emit();
        }, (err) => {
          requests.delete(id);
          emit();
          // Expiry/cancellation can close access between the offer query and
          // parent listener. Treat that expected race as removal from queue.
          if ((err as { code?: string }).code !== 'permission-denied') onError?.(err as Error);
        });
        subscriptions.set(id, stop);
      }
      emit();
    }, (err) => {
      cb([]);
      onError?.(err as Error);
    });
    return () => {
      stopped = true;
      stopOffers();
      for (const stop of subscriptions.values()) stop();
      subscriptions.clear();
      requests.clear();
    };
  } catch {
    onError?.(new Error('Could not start mechanic offer feed.'));
    return null;
  }
}

export function watchMyActiveJobs(
  mechanicId: string,
  cb: (jobs: ServiceRequest[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(
        collection(d, 'requests'),
        where('mechanicId', '==', mechanicId),
        where('status', 'in', ['accepted', 'on-the-way', 'arrived', 'service']),
        limit(10),
      ),
      (snap) => cb(snap.docs.map((s) => asRequest(s.id, s.data())).filter((j): j is ServiceRequest => j !== null)),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

export function watchMyJobHistory(
  mechanicId: string,
  cb: (jobs: ServiceRequest[]) => void,
  max = 30,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(
        collection(d, 'requests'),
        where('mechanicId', '==', mechanicId),
        where('status', '==', 'completed'),
        orderBy('updatedAt', 'desc'),
        limit(max),
      ),
      (snap) => cb(snap.docs.map((s) => asRequest(s.id, s.data())).filter((j): j is ServiceRequest => j !== null)),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

export type ReleaseResult = 'released' | 'not_assigned' | 'invalid_state' | 'forbidden' | 'error';

export async function releaseJob(requestId: string, mechanicId: string, reason: string): Promise<ReleaseResult> {
  try {
    const d = requireDb();
    const ref = doc(d, 'requests', requestId);
    return await runTransaction(d, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return 'invalid_state' as const;
      const data = snap.data() as ServiceRequest;
      if (data.mechanicId !== mechanicId) return 'not_assigned' as const;
      if (!RELEASABLE.includes(data.status)) return 'invalid_state' as const;
      tx.update(ref, {
        status: 'requested',
        mechanicId: null,
        mechanicName: null,
        mechanicPhone: null,
        mechanicLat: null,
        mechanicLng: null,
        mechanicLocationUpdatedAt: null,
        offerExpiresAt: Timestamp.fromMillis(Date.now() + OFFER_WINDOW_MS),
        releaseReason: reason.trim().slice(0, 500),
        releasedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return 'released' as const;
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? '';
    if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) return 'forbidden';
    return 'error';
  }
}

export type AdvanceResult =
  | 'advanced'
  | 'invalid_transition'
  | 'terminal'
  | 'forbidden'
  | 'error'
  | 'estimate_required';

export async function advanceJob(
  id: string,
  to: RequestStatus,
  extra?: { amountCents?: number; durationMin?: number },
): Promise<AdvanceResult> {
  try {
    const d = requireDb();
    const ref = doc(d, 'requests', id);
    return await runTransaction(d, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return 'terminal' as const;
      const cur = (snap.data() as ServiceRequest).status;
      if (cur === 'completed' || cur === 'cancelled') return 'terminal' as const;
      if (!canAdvance(cur, to)) return 'invalid_transition' as const;
      const patch: Record<string, unknown> = { status: to, updatedAt: serverTimestamp() };
      if (to === 'completed') {
        // Live pin cleared (privacy); billing preserved for history/earnings.
        patch.mechanicLat = null;
        patch.mechanicLng = null;
        patch.mechanicLocationUpdatedAt = null;
        // Completion requires an approved estimate — prevents unapproved repair billing.
        const reqData = (snap.data() as ServiceRequest & { estimateStatus?: string });
        if (reqData.estimateStatus !== 'approved') {
          return 'estimate_required' as const;
        }
        if (extra?.amountCents != null && Number.isFinite(extra.amountCents) && extra.amountCents >= 0) {
          patch.amountCents = Math.round(extra.amountCents);
        }
        if (extra?.durationMin != null && Number.isFinite(extra.durationMin) && extra.durationMin >= 0) {
          patch.durationMin = Math.round(extra.durationMin);
        }
      }
      tx.update(ref, patch);
      return 'advanced' as const;
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? '';
    if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) return 'forbidden';
    return 'error';
  }
}

/* ---------------- earnings ---------------- */

export interface EarningsSummary {
  totalCents: number;
  jobs: number;
}

/* ------------- completion billing validation ------------- */

/** Server-allowed bounds (firestore.rules mechanic completion branch). */
export const MAX_AMOUNT_CENTS = 1_000_000; // ₹10,000
export const MAX_DURATION_MIN = 1440; // 24h

export type BillingParseResult =
  | { ok: true; extra: { amountCents?: number; durationMin?: number } }
  | { ok: false; error: string };

/**
 * Parse + validate the completion billing inputs against the exact bounds
 * the server enforces. Rejects non-finite, negative, and over-limit values
 * with a specific message so a typo can never silently complete a job
 * without (or with an invalid) amount. Pure — unit-tested.
 */
export function parseBillingInput(amount: string, duration: string): BillingParseResult {
  const cents = amount.trim() ? Math.round(Number(amount) * 100) : null;
  const mins = duration.trim() ? Math.round(Number(duration)) : null;
  if (cents != null && (!Number.isFinite(cents) || cents < 0)) {
    return { ok: false, error: 'Amount must be 0 or a positive number (e.g. 499.00). Nothing was submitted.' };
  }
  if (mins != null && (!Number.isFinite(mins) || mins < 0)) {
    return { ok: false, error: 'Duration must be 0 or a positive number of minutes. Nothing was submitted.' };
  }
  if (cents != null && cents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: `Amount exceeds the maximum allowed (₹${(MAX_AMOUNT_CENTS / 100).toLocaleString('en-IN')}). Nothing was submitted.` };
  }
  if (mins != null && mins > MAX_DURATION_MIN) {
    return { ok: false, error: `Duration exceeds the maximum allowed (${MAX_DURATION_MIN} minutes). Nothing was submitted.` };
  }
  return {
    ok: true,
    extra: {
      ...(cents != null ? { amountCents: cents } : {}),
      ...(mins != null ? { durationMin: mins } : {}),
    },
  };
}

/** ---------- Repair estimate validation ---------- */

/** Bounds mirroring firestore.rules mechanic estimate branch. */
export const MAX_ESTIMATE_AMOUNT_CENTS = 1_000_000; // ₹10,000
export const MAX_ESTIMATE_DURATION_MIN = 1440; // 24h

export type EstimateParseResult =
  | { ok: true; extra: { estimatedAmountCents?: number; estimatedDurationMin?: number; diagnosis?: string } }
  | { ok: false; error: string };

/**
 * Parse + validate mechanic estimate inputs against server bounds.
 * Diagnosis is optional free text; parts/labour amounts map to estimatedAmountCents.
 * Pure — unit-tested.
 */
export function parseEstimateInput(
  diagnosis: string | null | undefined,
  amount: string | null | undefined,
  duration: string | null | undefined,
): EstimateParseResult {
  const cents = amount && amount.trim() ? Math.round(Number(amount) * 100) : null;
  const mins = duration && duration.trim() ? Math.round(Number(duration)) : null;

  if (cents != null && (!Number.isFinite(cents) || cents < 0)) {
    return { ok: false, error: 'Estimate amount must be 0 or a positive number. Nothing was submitted.' };
  }
  if (mins != null && (!Number.isFinite(mins) || mins < 0)) {
    return { ok: false, error: 'Estimated duration must be 0 or a positive number of minutes. Nothing was submitted.' };
  }
  if (cents != null && cents > MAX_ESTIMATE_AMOUNT_CENTS) {
    return { ok: false, error: `Estimate amount exceeds the maximum allowed (₹${(MAX_ESTIMATE_AMOUNT_CENTS / 100).toLocaleString('en-IN')}). Nothing was submitted.` };
  }
  if (mins != null && mins > MAX_ESTIMATE_DURATION_MIN) {
    return { ok: false, error: `Estimated duration exceeds the maximum allowed (${MAX_ESTIMATE_DURATION_MIN} minutes). Nothing was submitted.` };
  }
  const diagnosisText = diagnosis ? diagnosis.trim() : null;
  return {
    ok: true,
    extra: {
      ...(cents != null ? { estimatedAmountCents: cents } : {}),
      ...(mins != null ? { estimatedDurationMin: mins } : {}),
      ...(diagnosisText ? { diagnosis: diagnosisText } : {}),
    },
  };
}

/** ---------- Offline payment validation ---------- */

export type PaymentMethod = 'cash' | 'upi';

export type PaymentParseResult =
  | { ok: true; extra: { paymentMethod: PaymentMethod; amountCents: number } }
  | { ok: false; error: string };

/**
 * Parse + validate an offline payment recording input.
 * Payment is recorded by an authorized actor; it is NOT independently verified.
 * Pure — unit-tested.
 */
export function parsePaymentInput(method: string | null | undefined, amount: string | null | undefined): PaymentParseResult {
  const m = (method ?? '').trim() as PaymentMethod;
  if (m !== 'cash' && m !== 'upi') {
    return { ok: false, error: 'Payment method must be cash or UPI. Nothing was submitted.' };
  }
  const cents = amount && amount.trim() ? Math.round(Number(amount) * 100) : null;
  if (cents == null || !Number.isFinite(cents) || cents < 0) {
    return { ok: false, error: 'Payment amount must be 0 or a positive number. Nothing was submitted.' };
  }
  if (cents > MAX_AMOUNT_CENTS) {
    return { ok: false, error: `Payment amount exceeds the maximum allowed (₹${(MAX_AMOUNT_CENTS / 100).toLocaleString('en-IN')}). Nothing was submitted.` };
  }
  return { ok: true, extra: { paymentMethod: m, amountCents: cents } };
}

/** Derived strictly from completed-job amounts (trusted server data). Pure — tested. */
export function summarizeEarnings(items: ServiceRequest[]): EarningsSummary {
  let totalCents = 0;
  let count = 0;
  for (const j of items) {
    if (j.status !== 'completed') continue;
    count++;
    if (typeof j.amountCents === 'number' && Number.isFinite(j.amountCents) && j.amountCents >= 0) {
      totalCents += Math.round(j.amountCents);
    }
  }
  return { totalCents, jobs: count };
}

/** ---------- Estimate submission (assigned mechanic only) ---------- */

export type SubmitEstimateResult =
  | 'submitted'
  | 'not_assigned'
  | 'invalid_state'
  | 'forbidden'
  | 'error';

/**
 * Submit a repair estimate for an assigned job. Only the assigned mechanic may
 * write estimate fields, and only while the request is open and uncompleted.
 * Prevents modification after customer approval (estimateStatus === 'approved');
 * a rejected estimate may be revised back to 'pending'.
 */
export async function submitEstimate(
  id: string,
  mechanicId: string,
  diagnosis: string | null | undefined,
  amount: string | null | undefined,
  duration: string | null | undefined,
): Promise<SubmitEstimateResult> {
  try {
    const d = requireDb();
    const ref = doc(d, 'requests', id);
    return await runTransaction(d, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return 'not_assigned' as const;
      const data = snap.data() as ServiceRequest;
      if (data.mechanicId !== mechanicId) return 'not_assigned' as const;
      if (data.status === 'completed' || data.status === 'cancelled') return 'invalid_state' as const;
      if (data.estimateStatus === 'approved') return 'invalid_state' as const;

      const parsed = parseEstimateInput(diagnosis, amount, duration);
      if (!parsed.ok) {
        // Surface validation error as forbidden so the caller can display it.
        throw new Error(parsed.error);
      }

      const patch: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (parsed.extra.estimatedAmountCents != null) patch.estimatedAmountCents = parsed.extra.estimatedAmountCents;
      if (parsed.extra.estimatedDurationMin != null) patch.estimatedDurationMin = parsed.extra.estimatedDurationMin;
      if (parsed.extra.diagnosis != null) patch.estimateDiagnosis = parsed.extra.diagnosis;
      // A fresh estimate starts pending; a REJECTED estimate is resubmitted as a
      // revision, so it must return to 'pending' for the customer to decide again.
      if (data.estimateStatus == null || data.estimateStatus === 'rejected') {
        patch.estimateStatus = 'pending';
      }

      tx.update(ref, patch);
      return 'submitted' as const;
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? '';
    if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) return 'forbidden';
    return 'error';
  }
}

/** ---------- Offline payment recording (authorized actor only) ---------- */

export type RecordPaymentResult =
  | 'recorded'
  | 'not_assigned'
  | 'invalid_state'
  | 'amount_mismatch'
  | 'forbidden'
  | 'error';

/**
 * Record an offline (cash/UPI) payment for a completed job.
 * Payment is recorded by an authorized actor; it is NOT independently verified.
 *
 * `actorUid` must be the AUTHENTICATED uid: authorization is decided by the
 * document's own customerId/mechanicId, never by a caller-supplied customer id
 * (the original signature let a stranger satisfy the ownership test by echoing
 * the document's value).
 *
 * The rules allowlist stores no payment-amount field, so the completed job's
 * `amountCents` is the only recorded figure. A conflicting amount is REFUSED
 * rather than silently discarded.
 */
export async function recordPayment(
  id: string,
  actorUid: string,
  method: string | null | undefined,
  amount: string | null | undefined,
): Promise<RecordPaymentResult> {
  try {
    const d = requireDb();
    const ref = doc(d, 'requests', id);
    return await runTransaction(d, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return 'not_assigned' as const;
      const data = snap.data() as ServiceRequest;
      if (data.customerId !== actorUid && data.mechanicId !== actorUid) return 'not_assigned' as const;
      if (data.status !== 'completed') return 'invalid_state' as const;

      const parsed = parsePaymentInput(method, amount);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const billed =
        typeof data.amountCents === 'number' && Number.isFinite(data.amountCents)
          ? Math.round(data.amountCents)
          : null;
      if (billed != null && parsed.extra.amountCents !== billed) {
        return 'amount_mismatch' as const;
      }

      tx.update(ref, {
        paymentMethod: parsed.extra.paymentMethod,
        paymentStatus: 'paid',
        paidAt: Date.now(),
        paidBy: actorUid,
        updatedAt: serverTimestamp(),
      });
      return 'recorded' as const;
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? '';
    if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) return 'forbidden';
    return 'error';
  }
}
