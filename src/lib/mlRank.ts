/**
 * M11 ML display-ordering seam.
 *
 * Tries the ML ranking service (1.2 s timeout) for *display ordering only*
 * (directory sort, suggestion order). NEVER used for assignment, offers, or
 * any dispatch decision — M8 deterministic dispatch remains authoritative,
 * and the server-side Functions→ML call is future work.
 *
 * On ANY failure (timeout, HTTP error, malformed output, unreachable):
 * falls back to the deterministic M8-style ordering. Outcomes are logged
 * via the returned `source` field (callers surface nothing internal).
 */

export const ML_TIMEOUT_MS = 1200;

export interface RankInput {
  id: string;
  distanceKm: number | null;
  serviceMatch: boolean;
  rating: number | null;
  reviewCount: number | null;
  problemCategory: string;
  vehicleType: string;
}

export interface RankOutcome {
  orderedIds: string[];
  source: 'ml' | 'fallback';
  reason?: string;
}

function apiBase(): string | null {
  const url = import.meta.env.VITE_ML_API_URL as string | undefined;
  return url && url.trim() ? url.trim().replace(/\/$/, '') : null;
}

/** Deterministic M8-style ordering (the fallback). Pure — tested. */
export function deterministicOrder(items: RankInput[]): string[] {
  const score = (c: RankInput): number => {
    const km = c.distanceKm ?? 25;
    const rating = c.rating ?? 0;
    const reviews = Math.min(c.reviewCount ?? 0, 50);
    return 1000 - km * 10 + (c.serviceMatch ? 200 : 0) + rating * 20 + reviews * 2;
  };
  return [...items]
    .sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => c.id);
}

/** Feature payload subset available client-side (history aggregates stay server-side). */
function toCandidate(c: RankInput) {
  return {
    mechanic_id: c.id,
    distance_km: c.distanceKm ?? 25,
    service_match: c.serviceMatch ? 1 : 0,
    rating: c.rating,
    review_count: c.reviewCount,
    problem_category: c.problemCategory,
    vehicle_type: c.vehicleType,
  };
}

/** ML-first ordering with guaranteed fallback. Never throws. */
export async function rankWithML(items: RankInput[], fetchFn: typeof fetch = fetch): Promise<RankOutcome> {
  const fallback = (): RankOutcome => ({ orderedIds: deterministicOrder(items), source: 'fallback' });
  const base = apiBase();
  if (!base || items.length === 0) return { ...fallback(), reason: base ? 'empty' : 'unconfigured' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ML_TIMEOUT_MS);
  try {
    const res = await fetchFn(`${base}/rank-mechanics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidates: items.map(toCandidate) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ...fallback(), reason: `http-${res.status}` };
    const body = (await res.json()) as { ranked?: { mechanic_id: string }[] };
    const ids = (body.ranked ?? []).map((r) => r.mechanic_id).filter((id) => items.some((c) => c.id === id));
    if (ids.length !== items.length) return { ...fallback(), reason: 'malformed' };
    return { orderedIds: ids, source: 'ml' };
  } catch {
    return { ...fallback(), reason: 'timeout-or-network' };
  } finally {
    clearTimeout(timer);
  }
}
