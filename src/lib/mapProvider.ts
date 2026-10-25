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
