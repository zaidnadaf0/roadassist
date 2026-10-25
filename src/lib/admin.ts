import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebaseDb, firebaseFunctions } from './firebase';
import type { VerificationStatus } from './mechanic';
import type { RequestStatus } from './customer';

/**
 * M6 admin data layer. Every read requires the caller to hold the
 * `admin` custom claim (M3 rules evaluate per document); the client
 * performs NO privileged writes except through the claim-gated
 * `setMechanicApproval` callable, which re-checks authority server-side.
 */

export interface AdminUser {
  id: string;
  email?: string;
  displayName?: string;
  phone?: string | null;
  role?: string;
}

export interface AdminMechanic {
  id: string;
  name: string;
  approved: boolean;
  verificationStatus?: VerificationStatus;
  specialties?: string[];
  isAvailable?: boolean;
  rating?: number;
  reviewCount?: number;
  garageName?: string;
  serviceRadiusKm?: number;
  experienceYears?: number;
}

export interface AdminRequest {
  id: string;
  customerId: string;
  vehicleId?: string;
  problemText: string;
  problemCategory?: string;
  status: RequestStatus;
  mechanicId?: string | null;
  mechanicName?: string | null;
  amountCents?: number;
  durationMin?: number;
  rating?: number;
  cancelledBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function requireDb(): Firestore {
  const db = firebaseDb();
  if (!db) throw new Error('Backend not connected.');
  return db;
}

function asUser(id: string, raw: DocumentData | undefined): AdminUser | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<AdminUser, 'id'>) };
}
function asMechanic(id: string, raw: DocumentData | undefined): AdminMechanic | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<AdminMechanic, 'id'>) };
}
function asRequest(id: string, raw: DocumentData | undefined): AdminRequest | null {
  if (!raw) return null;
  return { id, ...(raw as Omit<AdminRequest, 'id'>) };
}

/* ---------------- users ---------------- */

export function watchAllUsers(cb: (items: AdminUser[]) => void, max = 100, onError?: (e: Error) => void): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collection(d, 'users'), orderBy('createdAt', 'desc'), limit(max)),
      (snap) => cb(snap.docs.map((s) => asUser(s.id, s.data())).filter((u): u is AdminUser => u !== null)),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

/* ---------------- mechanics ---------------- */

export function watchAllMechanics(cb: (items: AdminMechanic[]) => void, max = 200, onError?: (e: Error) => void): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collection(d, 'mechanics'), orderBy('name', 'asc'), limit(max)),
      (snap) => cb(snap.docs.map((s) => asMechanic(s.id, s.data())).filter((m): m is AdminMechanic => m !== null)),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

export type ApprovalAction = 'under_review' | 'approved' | 'suspended' | 'rejected';
export type ApprovalResult = 'ok' | 'rejected_by_server' | 'forbidden' | 'not_found' | 'error';

/**
 * Drive the M3 `setMechanicApproval` callable. Authority is re-checked
 * server-side (caller must hold the admin claim); the client only
 * forwards the operator's decision. Never writes approval state directly.
 */
export async function setMechanicApproval(uid: string, status: ApprovalAction): Promise<ApprovalResult> {
  try {
    const fns = firebaseFunctions();
    if (!fns) return 'error';
    const call = httpsCallable<{ uid: string; status: string }, { success: boolean }>(fns, 'setMechanicApproval');
    const res = await call({ uid, status });
    return res.data?.success ? 'ok' : 'rejected_by_server';
  } catch (e) {
    const code = String((e as { code?: unknown } | null)?.code ?? '');
    const msg = String((e as Error | null)?.message ?? '');
    if (code.includes('permission-denied') || code.includes('unauthenticated') || msg.includes('permission')) return 'forbidden';
    if (code.includes('not-found')) return 'not_found';
    if (code.includes('failed-precondition') || code.includes('invalid-argument')) return 'rejected_by_server';
    return 'error';
  }
}

/* ---------------- requests ---------------- */

export function watchAllRequests(
  cb: (items: AdminRequest[]) => void,
  status: RequestStatus | 'all' = 'all',
  max = 50,
  onError?: (e: Error) => void,
): Unsubscribe | null {
  try {
    const d = requireDb();
    const q =
      status === 'all'
        ? query(collection(d, 'requests'), orderBy('createdAt', 'desc'), limit(max))
        : query(
            collection(d, 'requests'),
            where('status', '==', status),
            orderBy('createdAt', 'desc'),
            limit(max),
          );
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((s) => asRequest(s.id, s.data())).filter((r): r is AdminRequest => r !== null)),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

export async function listAllRequestsOnce(status: RequestStatus | 'all' = 'all', max = 200): Promise<AdminRequest[]> {
  const d = requireDb();
  const q =
    status === 'all'
      ? query(collection(d, 'requests'), orderBy('createdAt', 'desc'), limit(max))
      : query(collection(d, 'requests'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((s) => asRequest(s.id, s.data())).filter((r): r is AdminRequest => r !== null);
}

export interface AdminOfferRow {
  requestId: string;
  mechanicId: string;
  status: string;
  round?: number | null;
}

export interface AdminAuditEvent {
  id: string;
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt?: unknown;
}

function asOfferRow(requestId: string, raw: DocumentData | undefined): AdminOfferRow | null {
  if (!raw || typeof raw.mechanicId !== 'string' || typeof raw.status !== 'string') return null;
  return {
    requestId,
    mechanicId: raw.mechanicId,
    status: raw.status,
    round: typeof raw.round === 'number' ? raw.round : null,
  };
}

/** All offers across requests (claim-admin reads; bounded, window-labeled in UI). */
export function watchAllOffers(cb: (items: AdminOfferRow[]) => void, max = 200, onError?: (e: Error) => void): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collectionGroup(d, 'offers'), limit(max)),
      (snap) =>
        cb(
          snap.docs
            .map((s) => asOfferRow(s.ref.parent.parent?.id ?? '', s.data()))
            .filter((o): o is AdminOfferRow => o !== null),
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

export function watchAuditEvents(cb: (items: AdminAuditEvent[]) => void, max = 100, onError?: (e: Error) => void): Unsubscribe | null {
  try {
    const d = requireDb();
    return onSnapshot(
      query(collection(d, 'auditEvents'), orderBy('createdAt', 'desc'), limit(max)),
      (snap) => cb(snap.docs.map((s) => ({ id: s.id, ...(s.data() as Omit<AdminAuditEvent, 'id'>) }))),
      (err) => {
        cb([]);
        onError?.(err as Error);
      },
    );
  } catch {
    return null;
  }
}

/* ---------------- dashboard stats (honest windowed counts) ---------------- */

export interface DashboardStats {
  windowSize: number;
  byStatus: Partial<Record<RequestStatus, number>>;
  active: number;
  completed: number;
  cancelled: number;
  totalUsers: number | null;
  mechanicsTotal: number | null;
  mechanicsPending: number | null;
  mechanicsApproved: number | null;
  mechanicsSuspended: number | null;
}

/**
 * Aggregate a bounded recent window client-side. Counts are labelled with
 * their window in the UI — never presented as all-time totals. Pure — tested.
 */
export function computeStats(
  requests: AdminRequest[],
  users: AdminUser[] | null,
  mechanics: AdminMechanic[] | null,
): DashboardStats {
  const byStatus: Partial<Record<RequestStatus, number>> = {};
  for (const r of requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const active =
    (byStatus.requested ?? 0) + (byStatus.accepted ?? 0) + (byStatus['on-the-way'] ?? 0) + (byStatus.arrived ?? 0) + (byStatus.service ?? 0);
  let mechanicsPending = 0;
  let mechanicsApproved = 0;
  let mechanicsSuspended = 0;
  if (mechanics) {
    for (const m of mechanics) {
      if (m.verificationStatus === 'pending' || m.verificationStatus === 'under_review') mechanicsPending++;
      if (m.approved && m.verificationStatus !== 'suspended') mechanicsApproved++;
      if (m.verificationStatus === 'suspended') mechanicsSuspended++;
    }
  }
  return {
    windowSize: requests.length,
    byStatus,
    active,
    completed: byStatus.completed ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    totalUsers: users ? users.length : null,
    mechanicsTotal: mechanics ? mechanics.length : null,
    mechanicsPending: mechanics ? mechanicsPending : null,
    mechanicsApproved: mechanics ? mechanicsApproved : null,
    mechanicsSuspended: mechanics ? mechanicsSuspended : null,
  };
}
