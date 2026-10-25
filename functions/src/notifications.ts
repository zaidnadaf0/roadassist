import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { ServiceRequest } from './types';

/**
 * M12 server-authoritative notifications.
 *
 * Inbox contract (M3 schema `notifications/{uid}/items/{id}`):
 *   { id, type, title(<=120), body?(<=500), requestId?, path?, createdAt(ms), read:false }
 * Clients can read their own inbox and flip `read` only (rules-enforced);
 * creation is server-only (`allow create: if false`, Admin SDK bypasses).
 *
 * IDEMPOTENCY: every event maps to a DETERMINISTIC document ID
 * (`notif_{requestId}_{event}` / `notif_{uid}_{kind}`) and each producer
 * existence-checks before writing, so trigger retries, double-fires, and
 * overlapping transitions never duplicate an item. Pure ID mapping is
 * unit-tested; double-put is emulator-tested.
 */

export type InboxType =
  | 'request_created'
  | 'offer_received'
  | 'job_accepted'
  | 'job_enroute'
  | 'job_arrived'
  | 'job_service'
  | 'job_completed'
  | 'request_cancelled'
  | 'approval_decided';

export interface Notice {
  type: InboxType;
  title: string;
  body?: string;
  requestId?: string;
  path?: string;
}

/** Deterministic doc ID for an event. Pure — tested. */
export function noticeId(requestId: string, event: string): string {
  const safe = event.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `notif_${requestId}_${safe}`;
}

function shortRef(requestId: string): string {
  return `#${requestId.slice(-6).toUpperCase()}`;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * Event map: (before, after) request transition → notices to emit.
 * Pure over plain data — unit-tested without Firestore.
 */
export function noticesForTransition(
  before: ServiceRequest | null,
  after: ServiceRequest,
): { toUid: string; event: string; notice: Notice }[] {
  const ref = shortRef(after.id);
  const out: { toUid: string; event: string; notice: Notice }[] = [];
  const category = after.problemCategory ?? 'service request';

  if (!before) {
    out.push({
      toUid: after.customerId,
      event: 'created',
      notice: {
        type: 'request_created',
        title: 'Request received',
        body: `Your ${category} request ${ref} is open. Nearby mechanics are being notified.`,
        requestId: after.id,
        path: `/track/${after.id}`,
      },
    });
    return out;
  }

  if (before.status === after.status) return out;
  const mechName = after.mechanicName ?? 'Your mechanic';

  switch (after.status) {
    case 'accepted':
      if (after.mechanicId) {
        out.push({
          toUid: after.customerId,
          event: `accepted_${after.mechanicId}`,
          notice: {
            type: 'job_accepted',
            title: 'Mechanic accepted',
            body: `${mechName} accepted your ${category} request ${ref}.`,
            requestId: after.id,
            path: `/track/${after.id}`,
          },
        });
      }
      break;
    case 'on-the-way':
      out.push({
        toUid: after.customerId,
        event: 'on-the-way',
        notice: {
          type: 'job_enroute',
          title: 'Mechanic is on the way',
          body: `${mechName} is heading to you${after.etaMin != null ? ` (ETA ~${after.etaMin} min)` : ''}.`,
          requestId: after.id,
          path: `/track/${after.id}`,
        },
      });
      break;
    case 'arrived':
      out.push({
        toUid: after.customerId,
        event: 'arrived',
        notice: {
          type: 'job_arrived',
          title: 'Mechanic has arrived',
          body: `${mechName} is at your location for ${ref}.`,
          requestId: after.id,
          path: `/track/${after.id}`,
        },
      });
      break;
    case 'service':
      out.push({
        toUid: after.customerId,
        event: 'service',
        notice: {
          type: 'job_service',
          title: 'Service started',
          body: `Work has started on your ${category} request ${ref}.`,
          requestId: after.id,
          path: `/track/${after.id}`,
        },
      });
      break;
    case 'completed':
      out.push({
        toUid: after.customerId,
        event: 'completed',
        notice: {
          type: 'job_completed',
          title: 'Service completed',
          body: `Your ${category} request ${ref} is complete. Please rate the service.`,
          requestId: after.id,
          path: `/track/${after.id}`,
        },
      });
      break;
    case 'cancelled': {
      const reason = after.cancellationReason ? ` Reason: ${after.cancellationReason}` : '';
      const cancelledByCustomer = after.cancelledBy === 'customer' || after.cancelledBy === after.customerId;
      if (!cancelledByCustomer) {
        out.push({
          toUid: after.customerId,
          event: 'cancelled',
          notice: {
            type: 'request_cancelled',
            title: 'Request cancelled',
            body: `Your ${category} request ${ref} was cancelled.${reason}`,
            requestId: after.id,
            path: `/history/${after.id}`,
          },
        });
      }
      const assigned = after.mechanicId ?? before.mechanicId;
      if (assigned) {
        out.push({
          toUid: assigned,
          event: `cancelled_${assigned}`,
          notice: {
            type: 'request_cancelled',
            title: 'Job cancelled',
            body: `${ref} was cancelled.${reason}`,
            requestId: after.id,
            path: `/mechanic/requests`,
          },
        });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/** Offer-created notice for the addressed mechanic. Pure data in, notice out. */
export function noticeForOffer(requestId: string, category: string | undefined, round: number): Notice {
  return {
    type: 'offer_received',
    title: 'New job offer',
    body: `A ${category ?? 'service'} request needs you (offer round ${round + 1}). Open it before it expires.`,
    requestId,
    path: `/m/job/${requestId}`,
  };
}

/** Approval-decision notice for the mechanic. */
export function noticeForApproval(status: string): Notice {
  if (status === 'approved') {
    return {
      type: 'approval_decided',
      title: 'Workshop approved',
      body: 'Your workshop is verified. Go online to start receiving offers.',
      path: '/m',
    };
  }
  if (status === 'suspended') {
    return {
      type: 'approval_decided',
      title: 'Workshop suspended',
      body: 'Your workshop is temporarily paused. Contact operations for details.',
      path: '/m/profile',
    };
  }
  return {
    type: 'approval_decided',
    title: 'Application update',
    body: `Your workshop application is now: ${status}. Contact operations if you have questions.`,
    path: '/m/profile',
  };
}

/**
 * Idempotent put: deterministic ID + existence check. Safe under retries.
 * Logs (not throws) on failure — notifications must never break dispatch.
 * The optional `db` override exists for tests (named-app handles); callers
 * omit it and use the default Admin SDK app.
 */
export async function putNotification(
  toUid: string,
  event: string,
  notice: Notice,
  db?: Firestore,
): Promise<boolean> {
  try {
    const store = db ?? getFirestore();
    const id = noticeId(notice.requestId ?? toUid, event);
    const ref = store.collection('notifications').doc(toUid).collection('items').doc(id);
    if ((await ref.get()).exists) return true;
    await ref.set({
      id,
      type: notice.type,
      title: clip(notice.title, 120),
      ...(notice.body ? { body: clip(notice.body, 500) } : {}),
      ...(notice.requestId ? { requestId: notice.requestId } : {}),
      ...(notice.path ? { path: notice.path } : {}),
      createdAt: Date.now(),
      read: false,
    });
    console.log(`[notify] ${id} -> ${toUid}`);
    return true;
  } catch (err) {
    console.error(`[notify] put failed for ${toUid}/${event}:`, err);
    return false;
  }
}
