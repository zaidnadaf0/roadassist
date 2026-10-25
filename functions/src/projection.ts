/**
 * M3 public mechanic projection (pure, dependency-free).
 *
 * Single definition of what customer-facing code may see of a mechanic.
 * Consumed by the `onMechanicWrite` trigger, the backfill script, and
 * unit tests. `baseLat`/`baseLng` here are COARSE (2 decimals ≈ 1.1 km);
 * exact coordinates never leave `mechanics/{uid}`.
 */

export const COARSE_DECIMALS = 2;

export function coarsenCoord(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** COARSE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export const PUBLIC_PROJECTION_FIELDS = [
  'name',
  'approved',
  'isAvailable',
  'specialties',
  'vehicleTypes',
  'experienceYears',
  'serviceRadiusKm',
  'rating',
  'reviewCount',
  'vehicleDescription',
  'garageName',
  'baseLat',
  'baseLng',
  'updatedAt',
] as const;

export const FORBIDDEN_PROJECTION_FIELDS = [
  'phone',
  'email',
  'garageAddress',
  'currentLat',
  'currentLng',
  'locationUpdatedAt',
  'verificationStatus',
  'uid',
] as const;

export interface MechanicSourceDoc {
  name?: unknown;
  approved?: unknown;
  isAvailable?: unknown;
  specialties?: unknown;
  vehicleTypes?: unknown;
  experienceYears?: unknown;
  serviceRadiusKm?: unknown;
  rating?: unknown;
  reviewCount?: unknown;
  vehicleDescription?: unknown;
  garageName?: unknown;
  baseLat?: unknown;
  baseLng?: unknown;
  // Private/operational fields the projection must strip (typed so tests
  // and callers handle real snapshots without casts).
  phone?: unknown;
  email?: unknown;
  garageAddress?: unknown;
  currentLat?: unknown;
  currentLng?: unknown;
  locationUpdatedAt?: unknown;
  verificationStatus?: unknown;
  uid?: unknown;
}

export type PublicMechanicProjection = Record<string, unknown>;

/**
 * Build the customer-safe projection. Returns null when the doc must NOT
 * be public (anything but approved === true with a valid name) — the
 * caller then deletes any stale `publicMechanics/{uid}` doc.
 */
export function buildPublicProjection(raw: MechanicSourceDoc | null | undefined): PublicMechanicProjection | null {
  if (!raw || raw.approved !== true) return null;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return null;

  const out: PublicMechanicProjection = {
    name: raw.name.trim(),
    approved: true,
    isAvailable: raw.isAvailable === true,
  };
  if (Array.isArray(raw.specialties)) out.specialties = raw.specialties.filter((s) => typeof s === 'string');
  if (Array.isArray(raw.vehicleTypes)) out.vehicleTypes = raw.vehicleTypes.filter((s) => typeof s === 'string');
  if (typeof raw.experienceYears === 'number' && Number.isFinite(raw.experienceYears)) out.experienceYears = raw.experienceYears;
  if (typeof raw.serviceRadiusKm === 'number' && Number.isFinite(raw.serviceRadiusKm)) out.serviceRadiusKm = raw.serviceRadiusKm;
  if (typeof raw.rating === 'number' && Number.isFinite(raw.rating)) out.rating = raw.rating;
  if (typeof raw.reviewCount === 'number' && Number.isFinite(raw.reviewCount)) out.reviewCount = raw.reviewCount;
  if (typeof raw.vehicleDescription === 'string') out.vehicleDescription = raw.vehicleDescription;
  else if (raw.vehicleDescription == null) out.vehicleDescription = null;
  if (typeof raw.garageName === 'string') out.garageName = raw.garageName;
  out.baseLat = coarsenCoord(raw.baseLat);
  out.baseLng = coarsenCoord(raw.baseLng);
  return out;
}
