import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import type { MechanicProfile, ServiceRequest } from './types';

/**
 * M8 deterministic dispatch core (NO ML — M9–M11 own ranking models).
 *
 * Pipeline: eligibility → deterministic score → controlled batch →
 * first-valid-accept-wins → expiry/decline → bounded rematch → honest wait.
 *
 * Pure pieces (eligibility, scoring, batch picking) are unit-tested with
 * mocked data. Firestore pieces run on the Admin SDK (trusted backend).
 */

export const OFFER_WINDOW_MS = 120_000;
export const OFFER_BATCH_SIZE = 3;
export const MAX_REMATCH_ROUNDS = 5;
export const MAX_ACTIVE_JOBS = 3;
export const DEFAULT_RADIUS_KM = 25;
export const LIVE_LOCATION_MAX_AGE_MS = 5 * 60_000;

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'superseded';

export interface OfferDoc {
  requestId: string;
  customerId: string;
  mechanicId: string;
  mechanicName: string;
  createdAt: FirebaseFirestore.Timestamp | Date;
  expiresAt: FirebaseFirestore.Timestamp;
  status: OfferStatus;
  round: number;
}

const LIVE_STATUSES = ['accepted', 'on-the-way', 'arrived', 'service'];

/** Haversine km. Display + server matching alike (straight-line, not traffic). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STEM_ALIASES: Record<string, string> = { tire: 'tyre', tyres: 'tyre', tires: 'tyre' };

function stem(s: string): string {
  let out = s.toLowerCase().trim();
  if (STEM_ALIASES[out]) return STEM_ALIASES[out];
  if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
  else if (out.endsWith('s') && out.length > 3) out = out.slice(0, -1);
  return STEM_ALIASES[out] ?? out;
}

const CATEGORY_NEEDS: Record<string, string[]> = {
  'flat-tyre': ['tyre', 'general'],
  battery: ['battery', 'electrical', 'general'],
  engine: ['engine', 'general'],
  tow: ['tow', 'recovery', 'general'],
  other: ['general'],
  general: ['general'],
};

/** Specialty compatibility (same stem semantics as the client filter). Pure. */
export function isCompatible(category: string | undefined, specialties: string[] | undefined): boolean {
  if (!category) return true;
  if (!specialties || specialties.length === 0) return true;
  const need = CATEGORY_NEEDS[category] ?? ['general'];
  const got = specialties.map(stem);
  return need.some((n) => got.includes(stem(n)));
}

export interface EligibleCandidate {
  mechanic: MechanicProfile;
  km: number;
  score: number;
}

/**
 * Eligibility + deterministic scoring. Returns candidates sorted by
 * (score desc, mechanic id asc) — fully deterministic, ties broken
 * lexicographically. Pure over inputs — unit-tested.
 */
export function rankEligible(
  request: { customerLat: number; customerLng: number; problemCategory?: string; declinedBy?: string[] },
  mechanics: MechanicProfile[],
  activeByMechanic: Map<string, number>,
  nowMs: number,
): EligibleCandidate[] {
  const declined = new Set(request.declinedBy ?? []);
  const out: EligibleCandidate[] = [];
  for (const m of mechanics) {
    if (!m.approved || !m.isAvailable) continue;
    if (declined.has(m.id)) continue;
    if ((activeByMechanic.get(m.id) ?? 0) >= MAX_ACTIVE_JOBS) continue;
    if (!isCompatible(request.problemCategory, m.specialties)) continue;

    let base: { lat: number; lng: number } | null = null;
    let liveBonus = 0;
    if (m.currentLat != null && m.currentLng != null && m.locationUpdatedAt) {
      if (nowMs - m.locationUpdatedAt < LIVE_LOCATION_MAX_AGE_MS) {
        base = { lat: m.currentLat, lng: m.currentLng };
        liveBonus = 100; // fresh fix: mechanic is verifiably out and moving
      }
    }
    if (!base) {
      if (m.baseLat == null || m.baseLng == null) continue;
      base = { lat: m.baseLat, lng: m.baseLng };
    }
    const km = haversineKm(base.lat, base.lng, request.customerLat, request.customerLng);
    if (!Number.isFinite(km)) continue;
    const radius = m.serviceRadiusKm ?? DEFAULT_RADIUS_KM;
    if (km > radius) continue;

    let score = 1000 - km * 10 + liveBonus;
    if (request.problemCategory && (m.specialties ?? []).map(stem).includes(stem(request.problemCategory))) score += 200;
    else if (isCompatible(request.problemCategory, m.specialties)) score += 50;
    if (m.rating != null) score += m.rating * 20;
    if (m.reviewCount != null) score += Math.min(m.reviewCount, 50) * 2;
    out.push({ mechanic: m, km, score });
  }
  out.sort((a, b) => (b.score - a.score) || (a.mechanic.id < b.mechanic.id ? -1 : a.mechanic.id > b.mechanic.id ? 1 : 0));
  return out;
}

/** Read all plausibly-eligible mechanics (bounded; server filters the rest). */
export async function loadCandidateMechanics(db: Firestore): Promise<MechanicProfile[]> {
  const snap = await db.collection('mechanics').where('approved', '==', true).where('isAvailable', '==', true).limit(100).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MechanicProfile, 'id'>) }));
}

/** Count of live jobs per mechanic (bounded scan; keeps batches honest). */
export async function loadActiveCounts(db: Firestore): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const snap = await db.collection('requests').where('status', 'in', ['accepted', 'on-the-way', 'arrived', 'service']).limit(100).get();
  for (const d of snap.docs) {
    const mid = (d.data() as ServiceRequest).mechanicId;
    if (typeof mid === 'string' && mid) counts.set(mid, (counts.get(mid) ?? 0) + 1);
  }
  return counts;
}

/**
 * Create one controlled offer batch. Returns the number of offers written,
 * or 0 with a reason when no batch is possible (termination conditions).
 */
export async function createOfferBatch(
  db: Firestore,
  requestId: string,
  maxBatch = OFFER_BATCH_SIZE,
): Promise<{ offers: number; stopped: string | null }> {
  const ref = db.collection('requests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) return { offers: 0, stopped: 'missing' };
  const req = { ...(snap.data() as ServiceRequest), id: snap.id };
  if (req.status !== 'requested' || req.mechanicId) return { offers: 0, stopped: 'not-open' };
  const round = (req as ServiceRequest & { rematchRound?: number }).rematchRound ?? 0;
  if (round >= MAX_REMATCH_ROUNDS) return { offers: 0, stopped: 'rounds-exhausted' };

  const [mechanics, active] = await Promise.all([loadCandidateMechanics(db), loadActiveCounts(db)]);
  const ranked = rankEligible(req, mechanics, active, Date.now()).slice(0, maxBatch);
  if (ranked.length === 0) return { offers: 0, stopped: 'no-eligible' };

  const expiresAt = Timestamp.fromMillis(Date.now() + OFFER_WINDOW_MS);
  const now = new Date();
  const result = await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(ref);
    if (!currentSnap.exists) return { offers: 0, stopped: 'missing' };
    const current = currentSnap.data() as ServiceRequest & { rematchRound?: number };
    if (current.status !== 'requested' || current.mechanicId) return { offers: 0, stopped: 'not-open' };
    if ((current.rematchRound ?? 0) !== round) return { offers: 0, stopped: 'round-changed' };

    const refs = ranked.map((c) => ref.collection('offers').doc(c.mechanic.id));
    const existing = await Promise.all(refs.map((offerRef) => tx.get(offerRef)));
    const toCreate = ranked.filter((_, index) => {
      const docSnap = existing[index];
      return !docSnap.exists || (docSnap.data() as OfferDoc).round !== round;
    });
    if (toCreate.length === 0) return { offers: 0, stopped: 'already-created' };

    // Revalidate approval/availability inside the transaction: the mechanics
    // query used for ranking ran outside the tx, so a concurrent admin edit
    // could have flipped approved/isAvailable since. Close that window here
    // (all reads precede any write; same guard acceptOfferTx uses).
    const candidateSnaps = await Promise.all(
      toCreate.map((c) => tx.get(db.collection('mechanics').doc(c.mechanic.id))),
    );
    const valid = toCreate.filter((c, i) => {
      const mech = candidateSnaps[i].exists ? (candidateSnaps[i].data() as MechanicProfile) : null;
      return !!mech && mech.approved && mech.isAvailable;
    });
    if (valid.length === 0) return { offers: 0, stopped: 'no-eligible' };

    for (const c of valid) {
      tx.set(ref.collection('offers').doc(c.mechanic.id), {
        requestId,
        customerId: current.customerId,
        mechanicId: c.mechanic.id,
        mechanicName: c.mechanic.name,
        createdAt: now,
        expiresAt,
        status: 'pending',
        round,
      } satisfies OfferDoc);
    }
    tx.update(ref, { offerExpiresAt: expiresAt, updatedAt: FieldValue.serverTimestamp() });
    return { offers: valid.length, stopped: null };
  });
  if (result.offers > 0) console.log(`[dispatch] ${requestId}: round ${round}, ${result.offers} offers`);
  return result;
}

export type AcceptOutcome = 'accepted' | 'expired' | 'alreadyTaken' | 'ineligible' | 'no-offer';

/**
 * Transactional first-win accept. Validates, in order: request open +
 * unassigned, MY offer pending + unexpired (server time), mechanic still
 * eligible (approved + available), not declined. Then assigns + marks all
 * other pending offers superseded. Exactly one concurrent caller can win:
 * the transaction re-reads committed state, so the loser sees mechanicId set.
 */
export async function acceptOfferTx(
  db: Firestore,
  requestId: string,
  mechanicId: string,
  nowMs: number,
): Promise<AcceptOutcome> {
  return db.runTransaction(async (tx) => {
    // ALL reads first: Firestore transactions forbid reads-after-writes.
    const reqRef = db.collection('requests').doc(requestId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) return 'alreadyTaken' as const;
    const req = reqSnap.data() as ServiceRequest;
    if (req.status !== 'requested' || req.mechanicId) return 'alreadyTaken' as const;

    const offerRef = reqRef.collection('offers').doc(mechanicId);
    const offerSnap = await tx.get(offerRef);
    if (!offerSnap.exists) return 'no-offer' as const;
    const offer = offerSnap.data() as OfferDoc;
    if (offer.status !== 'pending') return offer.status === 'accepted' ? ('alreadyTaken' as const) : ('expired' as const);
    const expMs = offer.expiresAt instanceof Timestamp ? offer.expiresAt.toMillis() : 0;
    if (expMs <= nowMs) return 'expired' as const;
    if ((req.declinedBy ?? []).includes(mechanicId)) return 'ineligible' as const;

    const mechSnap = await tx.get(db.collection('mechanics').doc(mechanicId));
    const mech = (mechSnap.exists ? mechSnap.data() : null) as MechanicProfile | null;
    if (!mech || !mech.approved || !mech.isAvailable) return 'ineligible' as const;

    const activeSnap = await tx.get(
      db.collection('requests')
        .where('mechanicId', '==', mechanicId)
        .where('status', 'in', LIVE_STATUSES)
        .limit(MAX_ACTIVE_JOBS),
    );
    if (activeSnap.size >= MAX_ACTIVE_JOBS) return 'ineligible' as const;

    const others = await tx.get(reqRef.collection('offers').where('status', '==', 'pending'));

    // ...then all writes.
    tx.update(reqRef, {
      status: 'accepted',
      mechanicId,
      mechanicName: mech.name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(offerRef, { status: 'accepted', updatedAt: FieldValue.serverTimestamp() });
    for (const d of others.docs) {
      if (d.id !== mechanicId) tx.update(d.ref, { status: 'superseded', updatedAt: FieldValue.serverTimestamp() });
    }
    return 'accepted' as const;
  });
}

export type DeclineOutcome = 'declined' | 'alreadyTaken' | 'expired' | 'ineligible' | 'error';

/** Decline my offer (marks offer + appends request declinedBy atomically). */
export async function declineOfferTx(db: Firestore, requestId: string, mechanicId: string): Promise<DeclineOutcome> {
  try {
    return await db.runTransaction(async (tx) => {
      const reqRef = db.collection('requests').doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) return 'alreadyTaken' as const;
      const req = reqSnap.data() as ServiceRequest;
      if (req.status !== 'requested' || req.mechanicId) return 'alreadyTaken' as const;

      const offerRef = reqRef.collection('offers').doc(mechanicId);
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists) return 'alreadyTaken' as const;
      const offer = offerSnap.data() as OfferDoc;
      if (offer.status !== 'pending') return 'alreadyTaken' as const;

      // Server-side offer expiry: declining an expired offer is meaningless —
      // it must be aged out by sweep/rematch, not excluded via declinedBy.
      const expMs = offer.expiresAt instanceof Timestamp ? offer.expiresAt.toMillis() : 0;
      if (expMs <= Date.now()) return 'expired' as const;

      // Mechanic approval must still hold (mirrors acceptOfferTx's guard).
      const mechSnap = await tx.get(db.collection('mechanics').doc(mechanicId));
      const mech = (mechSnap.exists ? mechSnap.data() : null) as MechanicProfile | null;
      if (!mech || !mech.approved) return 'ineligible' as const;

      const list = Array.isArray(req.declinedBy) ? req.declinedBy : [];
      tx.update(offerRef, { status: 'declined', updatedAt: FieldValue.serverTimestamp() });
      if (!list.includes(mechanicId)) {
        tx.update(reqRef, { declinedBy: [...list, mechanicId], updatedAt: FieldValue.serverTimestamp() });
      }
      return 'declined' as const;
    });
  } catch {
    return 'error' as const;
  }
}

/**
 * Rematch driver: expire stale pending offers for one request, then open
 * the next batch if the request is still open. Termination: non-open
 * request, rounds exhausted, or no eligible mechanics (request waits
 * honestly — no new lifecycle state invented).
 */
export async function rematchRequest(db: Firestore, requestId: string): Promise<{ offers: number; stopped: string | null }> {
  const reqRef = db.collection('requests').doc(requestId);
  const snap = await reqRef.get();
  if (!snap.exists) return { offers: 0, stopped: 'missing' };
  const req = snap.data() as ServiceRequest & { rematchRound?: number };
  if (req.status !== 'requested' || req.mechanicId) return { offers: 0, stopped: 'not-open' };
  const currentRound = req.rematchRound ?? 0;
  if (currentRound >= MAX_REMATCH_ROUNDS) return { offers: 0, stopped: 'rounds-exhausted' };

  const [mechanics, active] = await Promise.all([loadCandidateMechanics(db), loadActiveCounts(db)]);
  const ranked = rankEligible(req, mechanics, active, Date.now()).slice(0, OFFER_BATCH_SIZE);
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const expiresAt = Timestamp.fromMillis(nowMs + OFFER_WINDOW_MS);
  const pendingQuery = reqRef.collection('offers').where('status', '==', 'pending');

  return db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(reqRef);
    if (!currentSnap.exists) return { offers: 0, stopped: 'missing' };
    const current = currentSnap.data() as ServiceRequest & { rematchRound?: number };
    if (current.status !== 'requested' || current.mechanicId) return { offers: 0, stopped: 'not-open' };
    // The round read before candidate selection is the operation's idempotency
    // token. Concurrent sweep/decline attempts can advance it only once.
    if ((current.rematchRound ?? 0) !== currentRound) return { offers: 0, stopped: 'round-changed' };

    const pending = await tx.get(pendingQuery);
    const live = pending.docs.some((d) => {
      const offer = d.data() as OfferDoc;
      return offer.expiresAt instanceof Timestamp && offer.expiresAt.toMillis() > nowMs;
    });
    if (live) return { offers: 0, stopped: 'offers-pending' };

    const nextRound = currentRound + 1;

    // Revalidate approval/availability inside the transaction (ranking read the
    // mechanics snapshot outside the tx). All reads precede any write.
    const candidateSnaps = await Promise.all(
      ranked.map((c) => tx.get(db.collection('mechanics').doc(c.mechanic.id))),
    );
    const eligibleRanked = ranked.filter((c, i) => {
      const mech = candidateSnaps[i].exists ? (candidateSnaps[i].data() as MechanicProfile) : null;
      return !!mech && mech.approved && mech.isAvailable;
    });

    const offerRefs = eligibleRanked.map((c) => reqRef.collection('offers').doc(c.mechanic.id));
    const targetOffers = await Promise.all(offerRefs.map((offerRef) => tx.get(offerRef)));
    const candidateIds = new Set(eligibleRanked.map((c) => c.mechanic.id));
    for (const d of pending.docs) {
      if (d.data().expiresAt instanceof Timestamp && d.data().expiresAt.toMillis() <= nowMs && !candidateIds.has(d.id)) {
        tx.update(d.ref, { status: 'expired', updatedAt: FieldValue.serverTimestamp() });
      }
    }

    let created = 0;
    for (let i = 0; i < eligibleRanked.length; i++) {
      const candidate = eligibleRanked[i];
      const priorOffer = targetOffers[i];
      if (priorOffer.exists && (priorOffer.data() as OfferDoc).round === nextRound) continue;
      tx.set(offerRefs[i], {
        requestId,
        customerId: current.customerId,
        mechanicId: candidate.mechanic.id,
        mechanicName: candidate.mechanic.name,
        createdAt: now,
        expiresAt,
        status: 'pending',
        round: nextRound,
      } satisfies OfferDoc);
      created++;
    }
    tx.update(reqRef, {
      rematchRound: nextRound,
      ...(eligibleRanked.length > 0 ? { offerExpiresAt: expiresAt } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { offers: created, stopped: eligibleRanked.length > 0 ? null : 'no-eligible' };
  });
}

/** Expire a single stale offer (used by the sweep for targeted cleanup). */
export async function expireStaleOffers(db: Firestore, requestId: string, nowMs: number): Promise<number> {
  const reqRef = db.collection('requests').doc(requestId);
  return db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) return 0;
    const pending = await tx.get(reqRef.collection('offers').where('status', '==', 'pending'));
    let n = 0;
    for (const d of pending.docs) {
      const offer = d.data() as OfferDoc;
      const expMs = offer.expiresAt instanceof Timestamp ? offer.expiresAt.toMillis() : 0;
      if (expMs <= nowMs) {
        tx.update(d.ref, { status: 'expired', updatedAt: FieldValue.serverTimestamp() });
        n++;
      }
    }
    return n;
  });
}

/**
 * Close every still-pending offer after acceptance or cancellation. The normal accept
 * path supersedes siblings inside acceptOfferTx, so this is a no-op there —
 * it exists for out-of-band transitions (e.g. claim-admin writes) that would
 * otherwise leave phantom pending offers live in mechanic queues.
 */
export async function supersedePendingOffers(db: Firestore, requestId: string): Promise<number> {
  const reqRef = db.collection('requests').doc(requestId);
  return db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) return 0;
    const status = (reqSnap.data() as ServiceRequest).status;
    if (status !== 'accepted' && status !== 'cancelled') return 0;
    const pending = await tx.get(reqRef.collection('offers').where('status', '==', 'pending'));
    for (const d of pending.docs) {
      tx.update(d.ref, { status: 'superseded', updatedAt: FieldValue.serverTimestamp() });
    }
    return pending.size;
  });
}

/**
 * Per-request sweep step for one open, unassigned request: expire stale
 * pending offers and rematch — including the stranded case where the request
 * has NO offers at all (no eligible mechanic at creation, or the initial
 * batch failed). A request with live pending offers is left alone, and the
 * rematch budget (rematchRound) still bounds how long a permanently
 * unmatched request keeps polling.
 */
export async function sweepRequest(
  db: Firestore,
  requestId: string,
  nowMs: number,
): Promise<{ expired: number; rematched: boolean }> {
  const ref = db.collection('requests').doc(requestId);
  const initial = await ref.get();
  if (!initial.exists) return { expired: 0, rematched: false };
  const initialRequest = initial.data() as ServiceRequest;
  if (initialRequest.status !== 'requested' || initialRequest.mechanicId) return { expired: 0, rematched: false };
  const expired = await expireStaleOffers(db, requestId, nowMs);
  if (expired > 0) {
    await rematchRequest(db, requestId);
    return { expired, rematched: true };
  }
  const snap = await ref.get();
  const round = (snap.exists ? (snap.data() as ServiceRequest & { rematchRound?: number }).rematchRound : 0) ?? 0;
  if (round >= MAX_REMATCH_ROUNDS) return { expired: 0, rematched: false };
  const pending = await ref.collection('offers').where('status', '==', 'pending').limit(1).get();
  if (pending.empty) {
    await rematchRequest(db, requestId);
    return { expired: 0, rematched: true };
  }
  return { expired: 0, rematched: false };
}
