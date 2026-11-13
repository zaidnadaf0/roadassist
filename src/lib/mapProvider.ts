/**
 * M7 map provider seam.
 *
 * Single Leaflet + OpenStreetMap tile stack (no token, no paid provider).
 * To swap providers later (e.g. Geoapify tiles), change ONLY this module:
 * `TILE_URL`/`ATTRIBUTION` (+ optional `VITE_MAP_TILE_URL` override).
 * Nothing else in the app knows the provider.
 */

export const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ??
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];
export const DEFAULT_ZOOM = 11;
export const FOCUS_ZOOM = 14;

/**
 * True when both values are finite numbers inside WGS-84 bounds. Firestore
 * documents are client-untrusted for map purposes: a malformed or missing
 * coordinate must never reach Leaflet as NaN. Pure — unit-tested.
 */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

/** `[lat, lng]` when valid, otherwise null — the safe form for map props. Pure. */
export function safeLatLng(lat: unknown, lng: unknown): [number, number] | null {
  return isValidLatLng(lat, lng) ? [lat as number, lng as number] : null;
}
