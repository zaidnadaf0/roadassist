import { describe, expect, it } from 'vitest';
import {
  ASSUMED_SPEED_KMH,
  etaMinutes,
  formatKm,
  isStale,
  isValidCoord,
  polylineLengthKm,
  positionAlongRoute,
  travelState,
  type RoutePoint,
} from '@/lib/tracking';

/** A short straight north-south line: ~2.22 km (0.02° latitude). */
const ROUTE: RoutePoint[] = [
  [12.9600, 77.5900],
  [12.9700, 77.5900],
  [12.9800, 77.5900],
];

describe('route geometry', () => {
  it('measures a polyline in kilometres', () => {
    const km = polylineLengthKm(ROUTE);
    expect(km).toBeGreaterThan(2.1);
    expect(km).toBeLessThan(2.4);
  });

  it('returns the start, middle and end positions', () => {
    const start = positionAlongRoute(ROUTE, 0);
    const mid = positionAlongRoute(ROUTE, 0.5);
    const end = positionAlongRoute(ROUTE, 1);

    expect(start.position[0]).toBeCloseTo(12.96, 4);
    expect(start.travelledKm).toBeCloseTo(0, 5);
    expect(start.remainingKm).toBeCloseTo(polylineLengthKm(ROUTE), 3);

    expect(mid.position[0]).toBeCloseTo(12.97, 3);
    expect(mid.progress).toBe(0.5);

    expect(end.position[0]).toBeCloseTo(12.98, 4);
    expect(end.remainingKm).toBeCloseTo(0, 5);
  });

  it('interpolates between vertices (never jumps)', () => {
    const points = Array.from({ length: 21 }, (_, i) => positionAlongRoute(ROUTE, i / 20).position[0]);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1]);
      expect(points[i] - points[i - 1]).toBeLessThan(0.002);
    }
  });

  it('decreases remaining distance monotonically', () => {
    let previous = Infinity;
    for (let p = 0; p <= 1; p += 0.1) {
      const { remainingKm } = positionAlongRoute(ROUTE, p);
      expect(remainingKm).toBeLessThanOrEqual(previous + 1e-9);
      previous = remainingKm;
    }
  });

  it('clamps out-of-range and degenerate input', () => {
    expect(positionAlongRoute(ROUTE, -5).progress).toBe(0);
    expect(positionAlongRoute(ROUTE, 5).progress).toBe(1);
    expect(positionAlongRoute([], 0.5).position).toEqual([0, 0]);
    expect(positionAlongRoute([[12.97, 77.59]], 0.5).remainingKm).toBe(0);
    expect(positionAlongRoute([[12.97, 77.59], [12.97, 77.59]], 0.5).progress).toBe(0.5);
  });
});

describe('ETA is derived, never invented', () => {
  it('converts distance at the documented assumed speed', () => {
    expect(etaMinutes(5)).toBe(Math.round((5 / ASSUMED_SPEED_KMH) * 60));
    expect(etaMinutes(2.22)).toBe(4);
  });

  it('returns 0 only for a negligible distance', () => {
    expect(etaMinutes(0)).toBe(0);
    expect(etaMinutes(0.01)).toBe(0);
    expect(etaMinutes(0.5)).toBe(1);
  });

  it('returns null when there is no honest value', () => {
    expect(etaMinutes(null)).toBeNull();
    expect(etaMinutes(undefined)).toBeNull();
    expect(etaMinutes(Number.NaN)).toBeNull();
    expect(etaMinutes(-2)).toBeNull();
    expect(etaMinutes(5, 0)).toBeNull();
  });

  it('formats distances without pretending precision', () => {
    expect(formatKm(0.42)).toBe('420 m');
    expect(formatKm(3.44)).toBe('3.4 km');
    expect(formatKm(null)).toBeNull();
  });
});

describe('staleness and travel state', () => {
  it('flags old or missing fixes as stale', () => {
    const now = Date.UTC(2026, 10, 2, 10, 0, 0);
    expect(isStale(now - 60_000, now)).toBe(false);
    expect(isStale(now - 6 * 60_000, now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
    expect(isStale(Number.NaN, now)).toBe(true);
  });

  it('derives the tracking state from the lifecycle', () => {
    expect(travelState({ status: 'requested', hasMechanic: false, hasFix: false })).toBe('unassigned');
    expect(travelState({ status: 'requested', hasMechanic: true, hasFix: false })).toBe('assigned');
    expect(travelState({ status: 'accepted', hasMechanic: true, hasFix: true })).toBe('travelling');
    expect(travelState({ status: 'on-the-way', hasMechanic: true, hasFix: true })).toBe('travelling');
    expect(travelState({ status: 'arrived', hasMechanic: true, hasFix: true })).toBe('arrived');
    expect(travelState({ status: 'service', hasMechanic: true, hasFix: true })).toBe('in-service');
    expect(travelState({ status: 'completed', hasMechanic: true, hasFix: true })).toBe('done');
    expect(travelState({ status: 'cancelled', hasMechanic: true, hasFix: true })).toBe('cancelled');
  });

  it('validates coordinates before they reach Leaflet', () => {
    expect(isValidCoord(12.97, 77.59)).toBe(true);
    expect(isValidCoord(91, 0)).toBe(false);
    expect(isValidCoord(0, 181)).toBe(false);
    expect(isValidCoord(Number.NaN, 0)).toBe(false);
    expect(isValidCoord(null, 0)).toBe(false);
  });
});
