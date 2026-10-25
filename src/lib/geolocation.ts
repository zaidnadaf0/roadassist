import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * M7 browser geolocation layer.
 *
 * Two primitives, no more:
 * - `requestPosition()` — one-shot fix for the customer request flow.
 * - `useWatchPosition()` — throttled watcher for active mechanic jobs.
 *
 * Statuses: idle → requesting → granted | denied | unavailable | error | timeout.
 * The hook NEVER watches unless `enabled` is true, stops on unmount, and
 * throttles by distance + interval so Firestore writes stay bounded
 * (≈25 m / 5 s project requirement). Accuracy is whatever the browser
 * reports (`coords.accuracy`) — never claimed, always displayed.
 */

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'error' | 'timeout';

export interface GeoCoords {
  lat: number;
  lng: number;
  /** Meters, as reported by the browser. Null when not provided. */
  accuracy: number | null;
}

export interface GeoState {
  status: GeoStatus;
  coords: GeoCoords | null;
  error: string | null;
}

export interface WatchOptions {
  enabled: boolean;
  minDistanceM?: number;
  minIntervalMs?: number;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
export const LIVE_THROTTLE = { minDistanceM: 25, minIntervalMs: 5000 } as const;

function toCoords(p: GeolocationPosition): GeoCoords {
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null };
}

function statusForError(err: GeolocationPositionError): { status: GeoStatus; message: string } {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return { status: 'denied', message: 'Location permission was denied. Enter coordinates manually or enable permission and retry.' };
    case err.POSITION_UNAVAILABLE:
      return { status: 'unavailable', message: 'Your location is currently unavailable.' };
    case err.TIMEOUT:
      return { status: 'timeout', message: 'Location request timed out. Try again.' };
    default:
      return { status: 'error', message: err.message || 'Could not determine your location.' };
  }
}

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** One-shot position fix. Rejects never — resolves a terminal GeoState. */
export function requestPosition(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoState> {
  return new Promise((resolve) => {
    if (!supported()) {
      resolve({ status: 'unavailable', coords: null, error: 'Geolocation is not supported by this browser. Use manual coordinates.' });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ status: 'timeout', coords: null, error: 'Location request timed out. Try again.' });
      }
    }, timeoutMs + 2_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: 'granted', coords: toCoords(pos), error: null });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const mapped = statusForError(err);
        resolve({ status: mapped.status, coords: null, error: mapped.message });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/**
 * Pure throttle decision: should this fix be pushed given the last push?
 * Unit-tested; the hook and future M8 code share it.
 */
export function shouldPush(
  last: { lat: number; lng: number; at: number } | null,
  next: { lat: number; lng: number },
  at: number,
  minDistanceM: number,
  minIntervalMs: number,
): boolean {
  if (!last) return true;
  if (at - last.at < minIntervalMs) return false;
  const dLat = (next.lat - last.lat) * 111_000;
  const meanLat = ((next.lat + last.lat) / 2) * (Math.PI / 180);
  const dLng = (next.lng - last.lng) * 111_000 * Math.cos(meanLat);
  return Math.sqrt(dLat * dLat + dLng * dLng) >= minDistanceM;
}

/** Haversine distance in km (display only — not traffic-aware, not AI). */
export function distanceKm(a: GeoCoords | { lat: number; lng: number }, b: GeoCoords | { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Throttled watcher. Idle (no watchPosition) unless `enabled`. */
export function useWatchPosition(options: WatchOptions): [GeoState, () => void] {
  const { enabled, minDistanceM = LIVE_THROTTLE.minDistanceM, minIntervalMs = LIVE_THROTTLE.minIntervalMs, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const [state, setState] = useState<GeoState>({ status: 'idle', coords: null, error: null });
  const lastPushed = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const idRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (idRef.current !== null && supported()) {
      try {
        navigator.geolocation.clearWatch(idRef.current);
      } catch {
        // Non-fatal: watcher already gone.
      }
      idRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    if (!supported()) {
      setState({ status: 'unavailable', coords: null, error: 'Geolocation is not supported by this browser.' });
      return;
    }
    setState((s) => ({ ...s, status: 'requesting', error: null }));
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = toCoords(pos);
        const now = Date.now();
        if (shouldPush(lastPushed.current, coords, now, minDistanceM, minIntervalMs)) {
          lastPushed.current = { ...coords, at: now };
          setState({ status: 'granted', coords, error: null });
        }
      },
      (err) => {
        const mapped = statusForError(err);
        setState({ status: mapped.status, coords: null, error: mapped.message });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 5_000 },
    );
    idRef.current = id;
    return stop;
  }, [enabled, minDistanceM, minIntervalMs, timeoutMs, stop]);

  // Hard stop on unmount.
  useEffect(() => stop, [stop]);

  return [state, stop];
}

/** One-shot hook flavor for the request flow (requestGeo on demand). */
export function useGeolocation(): [GeoState, () => void] {
  const [state, setState] = useState<GeoState>({ status: 'idle', coords: null, error: null });
  const busy = useRef(false);

  const request = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'requesting', coords: null, error: null });
    void requestPosition().then((res) => {
      busy.current = false;
      if (res.status === 'granted') setState({ status: 'granted', coords: res.coords, error: null });
      else setState({ status: res.status, coords: null, error: res.error });
    });
  }, []);

  return [state, request];
}
