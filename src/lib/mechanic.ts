import {
  Timestamp,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
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

export function watchMyMechanicRecord(uid: string, cb: (r: MechanicRecord | null) => void): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      doc(d, 'mechanics', uid),
      (snap) => cb(snap.exists() ? asRecord(snap.id, snap.data()) : null),
      () => cb(null),
    );
  } catch {
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
export async function applyAsMechanic(uid: string, app: MechanicApplication): Promise<boolean> {
  try {
    const d = requireDb();
    await setDoc(doc(d, 'mechanics', uid), {
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
    await setDoc(
      doc(d, 'mechanics', uid, 'private', 'contact'),
      { phone: app.phone?.trim() || null, email: app.email?.trim().toLowerCase() || null, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return true;
  } catch {
    return false;
  }
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

/** Open offers (rules: approved mechanics may read status==requested). */
export function watchIncoming(
  cb: (jobs: ServiceRequest[]) => void,
  excludeUid?: string,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collection(d, 'requests'), where('status', '==', 'requested'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        const jobs = snap.docs
          .map((s) => asRequest(s.id, s.data()))
          .filter((j): j is ServiceRequest => j !== null)
          .filter((j) => !excludeUid || !(j.declinedBy ?? []).includes(excludeUid));
        cb(jobs);
      },
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
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

export type AdvanceResult = 'advanced' | 'invalid_transition' | 'terminal' | 'forbidden' | 'error';

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
