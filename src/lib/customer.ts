import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseDb } from './firebase';

/** Canonical lifecycle (M3 rules enforce it server-side). */
export type RequestStatus =
  | 'requested'
  | 'accepted'
  | 'on-the-way'
  | 'arrived'
  | 'service'
  | 'completed'
  | 'cancelled';

export const OFFER_WINDOW_MS = 120_000;
export const CANCELLABLE_STATUSES: RequestStatus[] = ['requested', 'accepted', 'on-the-way', 'arrived'];

export interface Vehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  type: 'car' | 'bike' | 'van' | 'truck';
  isDefault?: boolean;
  createdAt?: unknown;
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  vehicleId: string;
  problemText: string;
  problemCategory?: string;
  status: RequestStatus;
  customerLat: number;
  customerLng: number;
  pickedMechanicId?: string;
  mechanicId?: string | null;
  mechanicName?: string | null;
  mechanicPhone?: string | null;
  mechanicLat?: number | null;
  mechanicLng?: number | null;
  mechanicLocationUpdatedAt?: unknown;
  etaMin?: number;
  offerExpiresAt?: unknown;
  declinedBy?: string[];
  releaseReason?: string | null;
  amountCents?: number;
  durationMin?: number;
  rating?: number;
  comment?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Customer-safe mechanic preview (mirrors publicMechanics projection). */
export interface PublicMechanic {
  id: string;
  name: string;
  approved: boolean;
  isAvailable: boolean;
  specialties?: string[];
  vehicleTypes?: string[];
  experienceYears?: number;
  serviceRadiusKm?: number;
  rating?: number;
  reviewCount?: number;
  vehicleDescription?: string | null;
  garageName?: string;
  /** COARSE coordinates (~1.1 km) — never exact. Null when unset. */
  baseLat?: number | null;
  baseLng?: number | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  requestId?: string;
  path?: string;
  createdAt: number;
  read: boolean;
}

export interface CustomerProfile {
  uid: string;
  email?: string;
  displayName?: string;
  phone?: string | null;
  role?: string;
}

function requireDb(): Firestore {
  const db = firebaseDb();
  if (!db) throw new Error('Backend not connected.');
  return db;
}

function asVehicle(id: string, raw: DocumentData | undefined): Vehicle | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<Vehicle, 'id'>) };
}
function asRequest(id: string, raw: DocumentData | undefined): ServiceRequest | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<ServiceRequest, 'id'>) };
}
function asMechanic(id: string, raw: DocumentData | undefined): PublicMechanic | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<PublicMechanic, 'id'>) };
}
function asNotif(id: string, raw: DocumentData | undefined): AppNotification | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<AppNotification, 'id'>) };
}

function timestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    const ms = value.toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/* ---------------- vehicles ---------------- */

export async function listVehicles(ownerId: string): Promise<Vehicle[]> {
  const d = requireDb();
  const snap = await getDocs(
    // Keep this query usable before the optional composite index is deployed.
    query(collection(d, 'vehicles'), where('ownerId', '==', ownerId), limit(20)),
  );
  return snap.docs
    .map((s) => asVehicle(s.id, s.data()))
    .filter((v): v is Vehicle => v !== null)
    .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const d = requireDb();
  const snap = await getDoc(doc(d, 'vehicles', id));
  return snap.exists() ? asVehicle(snap.id, snap.data()) : null;
}

export interface NewVehicle {
  make: string;
  model: string;
  year: number;
  plate: string;
  type: Vehicle['type'];
  isDefault?: boolean;
}

/** Create payload uses EXACTLY the rules allowlist (no updatedAt on create). Pure — tested. */
export function buildVehiclePayload(ownerId: string, v: NewVehicle): Record<string, unknown> {
  return {
    ownerId,
    make: v.make.trim(),
    model: v.model.trim(),
    year: v.year,
    plate: v.plate.trim(),
    type: v.type,
    ...(v.isDefault !== undefined ? { isDefault: v.isDefault } : {}),
    createdAt: serverTimestamp(),
  };
}

export async function addVehicle(ownerId: string, v: NewVehicle): Promise<string> {
  const d = requireDb();
  const ref = doc(collection(d, 'vehicles'));
  await setDoc(ref, buildVehiclePayload(ownerId, v));
  return ref.id;
}

export async function updateVehicle(id: string, patch: Partial<Pick<Vehicle, 'make' | 'model' | 'year' | 'plate' | 'type' | 'isDefault'>>): Promise<void> {
  const d = requireDb();
  await updateDoc(doc(d, 'vehicles', id), { ...patch });
}

export async function deleteVehicle(id: string): Promise<void> {
  const d = requireDb();
  await deleteDoc(doc(d, 'vehicles', id));
}

/* ---------------- requests ---------------- */

export interface NewRequest {
  vehicleId: string;
  problemText: string;
  problemCategory?: string;
  customerLat: number;
  customerLng: number;
  pickedMechanicId?: string;
}

/**
 * Create payload matches the M3 rules allowlist EXACTLY, with offerExpiresAt
 * as a Firestore Timestamp (timestamp<int comparison would deny everything).
 * Pure — tested.
 */
export function buildRequestPayload(customerId: string, r: NewRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {
    customerId,
    vehicleId: r.vehicleId,
    problemText: r.problemText.trim(),
    customerLat: r.customerLat,
    customerLng: r.customerLng,
    status: 'requested',
    offerExpiresAt: Timestamp.fromMillis(Date.now() + OFFER_WINDOW_MS),
    mechanicId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (r.problemCategory) out.problemCategory = r.problemCategory;
  if (r.pickedMechanicId) out.pickedMechanicId = r.pickedMechanicId;
  return out;
}

export async function createRequest(customerId: string, r: NewRequest, requestId?: string): Promise<string> {
  const d = requireDb();
  const ref = requestId ? doc(d, 'requests', requestId) : doc(collection(d, 'requests'));
  if (requestId) {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data() as Partial<ServiceRequest>;
      if (
        data.customerId === customerId &&
        data.vehicleId === r.vehicleId &&
        data.problemText === r.problemText.trim()
      ) {
        return ref.id;
      }
      throw new Error('Request key is already in use. Start a new request.');
    }
  }
  await setDoc(ref, { id: ref.id, ...buildRequestPayload(customerId, r) });
  return ref.id;
}

export function watchRequest(
  id: string,
  cb: (r: ServiceRequest | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      doc(d, 'requests', id),
      (snap) => cb(snap.exists() ? asRequest(snap.id, snap.data()) : null),
      (err) => onError?.(err as Error),
    );
  } catch {
    return null;
  }
}

export function watchMyRequests(
  customerId: string,
  cb: (items: ServiceRequest[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      // The ownership filter is enough for security and uses only the
      // automatic single-field index. Sort locally so a missing optional
      // customerId+createdAt composite index cannot blank the dashboard.
      query(collection(d, 'requests'), where('customerId', '==', customerId), limit(50)),
      (snap) => cb(
        snap.docs
          .map((s) => asRequest(s.id, s.data()))
          .filter((r): r is ServiceRequest => r !== null)
          .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt)),
      ),
      (err) => onError?.(err as Error),
    );
  } catch {
    return null;
  }
}

export type CancelResult = 'cancelled' | 'too_late' | 'forbidden' | 'error';

export async function cancelRequest(id: string, reason?: string): Promise<CancelResult> {
  try {
    const d = requireDb();
    const ref = doc(d, 'requests', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 'error';
    const cur = (snap.data() as ServiceRequest).status;
    if (cur === 'completed' || cur === 'cancelled') return 'too_late';
    if (!CANCELLABLE_STATUSES.includes(cur)) return 'too_late';
    const patch: Record<string, unknown> = {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: 'customer',
      updatedAt: serverTimestamp(),
    };
    if (reason?.trim()) patch.cancellationReason = reason.trim().slice(0, 500);
    await updateDoc(ref, patch);
    return 'cancelled';
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? '';
    if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) return 'forbidden';
    return 'error';
  }
}

export async function rateRequest(id: string, rating: number, comment?: string): Promise<boolean> {
  try {
    const d = requireDb();
    const patch: Record<string, unknown> = {
      rating: Math.min(5, Math.max(1, Math.round(rating))),
      ratedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (comment?.trim()) patch.comment = comment.trim().slice(0, 500);
    await updateDoc(doc(d, 'requests', id), patch);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- public mechanics ---------------- */

export function watchPublicMechanics(
  cb: (items: PublicMechanic[]) => void,
  onError?: (e: Error) => void,
  max = 100,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(
        collection(d, 'publicMechanics'),
        where('approved', '==', true),
        where('isAvailable', '==', true),
        limit(max),
      ),
      (snap) => cb(
        snap.docs
          .map((s) => asMechanic(s.id, s.data()))
          .filter((m): m is PublicMechanic => m !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

export async function getPublicMechanic(id: string): Promise<PublicMechanic | null> {
  try {
    const d = requireDb();
    const snap = await getDoc(doc(d, 'publicMechanics', id));
    return snap.exists() ? asMechanic(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

/* ---------------- notifications ---------------- */

export function watchNotifications(
  uid: string,
  cb: (items: AppNotification[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collection(d, 'notifications', uid, 'items'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => cb(snap.docs.map((s) => asNotif(s.id, s.data())).filter((n): n is AppNotification => n !== null)),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

export async function markNotificationRead(uid: string, id: string): Promise<boolean> {
  try {
    const d = requireDb();
    await updateDoc(doc(d, 'notifications', uid, 'items', id), { read: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark every unread item read (one write per item; rules permit exactly
 * the {read} shape). Returns counts for honest UI copy. Pure counter
 * helper `countUnread` is unit-tested.
 */
export async function markAllNotificationsRead(uid: string, ids: string[]): Promise<{ marked: number; failed: number }> {
  let marked = 0;
  let failed = 0;
  for (const id of ids.slice(0, 50)) {
    if (await markNotificationRead(uid, id)) marked++;
    else failed++;
  }
  return { marked, failed };
}

/** Pure unread counter — tested. */
export function countUnread(items: AppNotification[]): number {
  return items.filter((n) => !n.read).length;
}

/* ---------------- profile ---------------- */

export async function getProfile(uid: string): Promise<CustomerProfile | null> {
  try {
    const d = requireDb();
    const snap = await getDoc(doc(d, 'users', uid));
    return snap.exists() ? ({ uid: snap.id, ...snap.data() } as CustomerProfile) : null;
  } catch {
    return null;
  }
}

export async function updateProfile(uid: string, patch: { displayName?: string; phone?: string | null }): Promise<boolean> {
  try {
    const d = requireDb();
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.displayName !== undefined) clean.displayName = patch.displayName.trim();
    if (patch.phone !== undefined) clean.phone = patch.phone?.trim() || null;
    await updateDoc(doc(d, 'users', uid), clean);
    return true;
  } catch {
    return false;
  }
}
