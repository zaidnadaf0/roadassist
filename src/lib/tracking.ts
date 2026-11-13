import { distanceKm } from './geolocation';

/**
 * Tracking maths shared by the real portal, the admin monitor and the
 * presentation simulation.
 *
 * HONESTY CONTRACT
 * - There is no routing service in this project, so a "route" is either a
 *   straight line (real tracking) or predefined *simulated* geometry.
 * - ETA is derived from distance at a documented assumed speed. It is NOT
 *   traffic-aware, NOT navigation-grade, and never invented when coordinates
 *   are missing.
 * - A stale fix must never be presented as a live position.
 */

/** Assumed average urban speed used for the approximated ETA. */
export const ASSUMED_SPEED_KMH = 30;
/** A fix older than this is shown as stale rather than live. */
export const LOCATION_STALE_MS = 5 * 60_000;

export const ETA_DISCLAIMER =
  'Approximate ETA — straight-line distance at an assumed 30 km/h. Not live traffic and not road routing.';
export const ROUTE_DISCLAIMER = 'Straight-line representation — road routing is not available.';

export type LatLng = { lat: number; lng: number };
export type RoutePoint = [number, number];

export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

/** Kilometres between two points (haversine, display only). */
export function kmBetween(a: LatLng, b: LatLng): number {
  return distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

/** Total length of a polyline in kilometres. */
export function polylineLengthKm(route: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += distanceKm(
      { lat: route[i - 1][0], lng: route[i - 1][1] },
      { lat: route[i][0], lng: route[i][1] },
    );
  }
  return total;
}

export interface RoutePosition {
  /** Interpolated marker position. */
  position: RoutePoint;
  /** 0…1 fraction of the polyline already travelled. */
  progress: number;
  /** Kilometres still to travel. */
  remainingKm: number;
  /** Kilometres already travelled. */
  travelledKm: number;
}

/**
 * Position at `progress` (0…1) along a polyline. Linear interpolation between
 * the two surrounding vertices, which is exact enough at city scale and keeps
 * movement smooth and deterministic.
 */
export function positionAlongRoute(route: RoutePoint[], progress: number): RoutePosition {
  if (route.length === 0) {
    return { position: [0, 0], progress: 0, remainingKm: 0, travelledKm: 0 };
  }
  if (route.length === 1) {
    return { position: route[0], progress: 0, remainingKm: 0, travelledKm: 0 };
  }
  const total = polylineLengthKm(route);
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (total === 0) {
    return { position: route[route.length - 1], progress: clamped, remainingKm: 0, travelledKm: 0 };
  }
  const target = clamped * total;
  let travelled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const segment = distanceKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
    if (travelled + segment >= target || i === route.length - 1) {
      const within = segment === 0 ? 0 : Math.min(1, Math.max(0, (target - travelled) / segment));
      return {
        position: [a[0] + (b[0] - a[0]) * within, a[1] + (b[1] - a[1]) * within],
        progress: clamped,
        remainingKm: Math.max(0, total - target),
        travelledKm: Math.min(total, target),
      };
    }
    travelled += segment;
  }
  return { position: route[route.length - 1], progress: 1, remainingKm: 0, travelledKm: total };
}

/**
 * Approximate ETA in whole minutes, or null when no honest value exists.
 * Returns 0 only for a genuinely negligible remaining distance.
 */
export function etaMinutes(remainingKm: number | null | undefined, speedKmh = ASSUMED_SPEED_KMH): number | null {
  if (remainingKm == null || !Number.isFinite(remainingKm) || remainingKm < 0) return null;
  if (remainingKm <= 0.02) return 0;
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return null;
  return Math.max(1, Math.round((remainingKm / speedKmh) * 60));
}

export function formatKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** A fix older than the threshold is stale (never shown as "live"). */
export function isStale(updatedAtMs: number | null | undefined, nowMs: number, thresholdMs = LOCATION_STALE_MS): boolean {
  if (updatedAtMs == null || !Number.isFinite(updatedAtMs) || !Number.isFinite(nowMs)) return true;
  return nowMs - updatedAtMs > thresholdMs;
}

export type TravelState =
  | 'unassigned'
  | 'assigned'
  | 'travelling'
  | 'arrived'
  | 'in-service'
  | 'done'
  | 'cancelled';

/**
 * Tracking state derived from the request lifecycle. Travel ETA belongs to
 * `travelling` only — after arrival there is no journey left to estimate.
 */
export function travelState(input: {
  status: string;
  hasMechanic: boolean;
  hasFix: boolean;
}): TravelState {
  if (input.status === 'cancelled') return 'cancelled';
  if (input.status === 'completed') return 'done';
  if (!input.hasMechanic) return 'unassigned';
  if (input.status === 'requested') return 'assigned';
  if (input.status === 'accepted' || input.status === 'on-the-way') return 'travelling';
  if (input.status === 'arrived') return 'arrived';
  return 'in-service';
}
