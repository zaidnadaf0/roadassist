import { describe, expect, it } from 'vitest';
import {
  COARSE_DECIMALS,
  FORBIDDEN_PROJECTION_FIELDS,
  PUBLIC_PROJECTION_FIELDS,
  buildPublicProjection,
  coarsenCoord,
} from './projection';

describe('public projection contract', () => {
  it('rounds coordinates to ~1.1 km', () => {
    expect(COARSE_DECIMALS).toBe(2);
    expect(coarsenCoord(12.9716)).toBe(12.97);
    expect(coarsenCoord(-77.5946)).toBe(-77.59);
    expect(coarsenCoord(Number.NaN)).toBeNull();
    expect(coarsenCoord('12.9')).toBeNull();
  });

  it('publishes approved mechanics with safe fields only', () => {
    const proj = buildPublicProjection({
      name: '  Apex Towing ',
      approved: true,
      isAvailable: true,
      specialties: ['tow', 42],
      vehicleTypes: ['car'],
      experienceYears: 8,
      serviceRadiusKm: 25,
      rating: 4.8,
      reviewCount: 12,
      vehicleDescription: null,
      garageName: 'Apex',
      garageAddress: '12 Exact Street (PRIVATE)',
      phone: '+91-PRIVATE',
      email: 'a@private.test',
      currentLat: 12.9716,
      currentLng: 77.5946,
      locationUpdatedAt: 123,
      verificationStatus: 'approved',
      uid: 'mech-1',
      baseLat: 12.9716,
      baseLng: 77.5946,
    });
    expect(proj).not.toBeNull();
    for (const f of FORBIDDEN_PROJECTION_FIELDS) expect(proj).not.toHaveProperty(f);
    for (const key of Object.keys(proj!)) {
      expect((PUBLIC_PROJECTION_FIELDS as readonly string[])).toContain(key);
    }
    expect(proj!.baseLat).toBe(12.97);
    expect(proj!.baseLng).toBe(77.59);
    expect(proj!.specialties).toEqual(['tow']);
  });

  it('returns null for anything not publicly visible', () => {
    expect(buildPublicProjection(null)).toBeNull();
    expect(buildPublicProjection(undefined)).toBeNull();
    expect(buildPublicProjection({ approved: false, name: 'X' })).toBeNull();
    expect(buildPublicProjection({ approved: true, name: '  ' })).toBeNull();
    expect(buildPublicProjection({ approved: true })).toBeNull();
  });

  it('publishes without coordinates when the base is missing', () => {
    const proj = buildPublicProjection({ name: 'No Base', approved: true, isAvailable: false });
    expect(proj).not.toBeNull();
    expect(proj!.baseLat).toBeNull();
    expect(proj!.isAvailable).toBe(false);
  });
});
