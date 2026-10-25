import { describe, expect, it } from 'vitest';
import { haversineKm, isCompatible, rankEligible, type EligibleCandidate } from './dispatch';
import type { MechanicProfile } from './types';

function mech(over: Partial<MechanicProfile> & { id: string }): MechanicProfile {
  return {
    name: over.id,
    approved: true,
    isAvailable: true,
    specialties: ['general'],
    baseLat: 12.9716,
    baseLng: 77.5946,
    ...over,
  } as MechanicProfile;
}

const REQ = { customerLat: 12.9716, customerLng: 77.5946, problemCategory: 'tow', declinedBy: [] as string[] };

describe('haversineKm', () => {
  it('is zero for identical points and sane at city scale', () => {
    expect(haversineKm(12.97, 77.59, 12.97, 77.59)).toBe(0);
    const d = haversineKm(12.9716, 77.5946, 12.9352, 77.6245);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(8);
  });
});

describe('isCompatible', () => {
  it('matches stems across pluralization and US/UK spelling', () => {
    expect(isCompatible('flat-tyre', ['tires'])).toBe(true);
    expect(isCompatible('battery', ['batteries'])).toBe(true);
    expect(isCompatible('tow', ['recovery'])).toBe(true);
    expect(isCompatible('engine', ['tow'])).toBe(false);
  });

  it('treats generalists and empty categories as compatible', () => {
    expect(isCompatible('engine', [])).toBe(true);
    expect(isCompatible(undefined, ['tow'])).toBe(true);
  });
});

describe('rankEligible (deterministic, no ML)', () => {
  const NOW = 1_000_000;

  it('excludes unapproved, unavailable, declined, and overloaded mechanics', () => {
    const list = rankEligible(
      { ...REQ, declinedBy: ['declined'] },
      [
        mech({ id: 'ok', specialties: ['tow'] }),
        mech({ id: 'unapproved', specialties: ['tow'], approved: false }),
        mech({ id: 'offline', specialties: ['tow'], isAvailable: false }),
        mech({ id: 'declined', specialties: ['tow'] }),
        mech({ id: 'busy', specialties: ['tow'] }),
      ],
      new Map([['busy', 3]]),
      NOW,
    );
    expect(list.map((c: EligibleCandidate) => c.mechanic.id)).toEqual(['ok']);
  });

  it('excludes wrong specialties and out-of-radius mechanics', () => {
    const list = rankEligible(
      { ...REQ, declinedBy: ['declined'] },
      [
        mech({ id: 'wrong-spec', specialties: ['battery'], serviceRadiusKm: 50 }),
        mech({ id: 'far', specialties: ['tow'], baseLat: 13.5, baseLng: 78.0, serviceRadiusKm: 5 }),
        mech({ id: 'no-loc', specialties: ['tow'], baseLat: undefined, baseLng: undefined }),
      ],
      new Map(),
      NOW,
    );
    expect(list).toEqual([]);
  });

  it('prefers closer mechanics and breaks ties lexicographically', () => {
    const list = rankEligible(
      REQ,
      [
        mech({ id: 'b-far', specialties: ['tow'], baseLat: 12.98, baseLng: 77.6 }),
        mech({ id: 'a-near', specialties: ['tow'] }),
        mech({ id: 'c-tie', specialties: ['tow'] }),
      ],
      new Map(),
      NOW,
    );
    expect(list[0].mechanic.id).toBe('a-near');
    // a-near and c-tie share coords+rating → id order decides, deterministically.
    expect(list.map((c) => c.mechanic.id)).toEqual(['a-near', 'c-tie', 'b-far']);
    const again = rankEligible(
      REQ,
      [
        mech({ id: 'b-far', specialties: ['tow'], baseLat: 12.98, baseLng: 77.6 }),
        mech({ id: 'a-near', specialties: ['tow'] }),
        mech({ id: 'c-tie', specialties: ['tow'] }),
      ],
      new Map(),
      NOW,
    );
    expect(again.map((c) => c.mechanic.id)).toEqual(list.map((c) => c.mechanic.id));
  });

  it('rewards specialty match, rating, and fresh live positions', () => {
    const list = rankEligible(
      REQ,
      [
        mech({ id: 'plain', specialties: ['tow'] }),
        mech({ id: 'rated', specialties: ['tow'], rating: 4.9, reviewCount: 40 }),
        mech({ id: 'live', specialties: ['tow'], baseLat: 13.0, baseLng: 77.65, currentLat: 12.9716, currentLng: 77.5946, locationUpdatedAt: NOW - 60_000 }),
        mech({ id: 'stale', specialties: ['tow'], baseLat: 12.9716, baseLng: 77.5946, currentLat: 13.5, currentLng: 78.0, locationUpdatedAt: NOW - 600_000 }),
      ],
      new Map(),
      NOW,
    );
    expect(list[0].mechanic.id).toBe('rated');
    expect(list.map((c) => c.mechanic.id)).toEqual(['rated', 'live', 'plain', 'stale']);
    // Stale live fix is ignored in favor of the base (same spot as plain).
    // Stale live fix is ignored in favor of the base (same spot as plain).
    expect(list.find((c) => c.mechanic.id === 'stale')?.km).toBeCloseTo(0, 3);
  });
});
