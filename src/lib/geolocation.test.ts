import { describe, expect, it, vi } from 'vitest';
import { distanceKm, requestPosition, shouldPush } from '@/lib/geolocation';

describe('push throttle (25 m / 5 s contract)', () => {
  const base = { lat: 12.9716, lng: 77.5946, at: 1_000_000 };

  it('pushes the first fix unconditionally', () => {
    expect(shouldPush(null, { lat: 12.9716, lng: 77.5946 }, 1_000_000, 25, 5_000)).toBe(true);
  });

  it('suppresses fixes inside the time window', () => {
    expect(shouldPush(base, { lat: 12.98, lng: 77.6 }, 1_002_000, 25, 5_000)).toBe(false);
  });

  it('suppresses fixes inside the distance window', () => {
    expect(shouldPush(base, { lat: 12.97165, lng: 77.59465 }, 1_010_000, 25, 5_000)).toBe(false);
  });

  it('pushes fixes past both thresholds', () => {
    expect(shouldPush(base, { lat: 12.975, lng: 77.6 }, 1_010_000, 25, 5_000)).toBe(true);
  });
});

describe('distance display (Haversine, straight-line only)', () => {
  it('measures Bengaluru-scale distances sanely', () => {
    const d = distanceKm({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9352, lng: 77.6245 });
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(8);
  });

  it('is zero for identical points', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });
});

describe('one-shot requestPosition', () => {
  function mockGeolocation(impl: Partial<Geolocation>) {
    Object.defineProperty(globalThis, 'navigator', { value: { geolocation: impl }, configurable: true });
  }

  it('resolves granted with coordinates on success', async () => {
    mockGeolocation({
      getCurrentPosition: (ok) =>
        ok({ coords: { latitude: 12.97, longitude: 77.59, accuracy: 20 } } as GeolocationPosition),
    } as Geolocation);
    const res = await requestPosition(5_000);
    expect(res.status).toBe('granted');
    expect(res.coords).toMatchObject({ lat: 12.97, lng: 77.59, accuracy: 20 });
    expect(res.error).toBeNull();
  });

  it('maps denial to an honest message (never throws)', async () => {
    const err = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as unknown as GeolocationPositionError;
    mockGeolocation({ getCurrentPosition: (_ok, fail) => fail?.(err) } as Geolocation);
    const res = await requestPosition(5_000);
    expect(res.status).toBe('denied');
    expect(res.coords).toBeNull();
    expect(res.error).toMatch(/denied/i);
  });

  it('reports unsupported browsers instead of crashing', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    const res = await requestPosition(50);
    expect(res.status).toBe('unavailable');
    expect(res.coords).toBeNull();
    vi.unstubAllGlobals();
  });
});
