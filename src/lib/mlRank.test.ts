import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicOrder, explainMechanic, rankWithML, type RankInput } from '@/lib/mlRank';

const ITEMS: RankInput[] = [
  { id: 'far', distanceKm: 15, serviceMatch: true, rating: 4.9, reviewCount: 200, problemCategory: 'tow', vehicleType: 'car' },
  { id: 'near', distanceKm: 1, serviceMatch: true, rating: 4.2, reviewCount: 10, problemCategory: 'tow', vehicleType: 'car' },
  { id: 'mid', distanceKm: 5, serviceMatch: false, rating: 4.8, reviewCount: 50, problemCategory: 'tow', vehicleType: 'car' },
];

describe('deterministicOrder (M8 fallback)', () => {
  it('ranks near + matched first, deterministically', () => {
    // near 1294 > far 1248 (rating+reviews) > mid 1046 (no match bonus).
    expect(deterministicOrder(ITEMS)).toEqual(['near', 'far', 'mid']);
    expect(deterministicOrder(ITEMS)).toEqual(deterministicOrder([...ITEMS].reverse()));
  });
});

describe('rankWithML (never throws, always falls back)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back when unconfigured (no VITE_ML_API_URL here)', async () => {
    const out = await rankWithML(ITEMS);
    expect(out.source).toBe('fallback');
    expect(out.orderedIds).toEqual(deterministicOrder(ITEMS));
  });

  it('falls back on network failure', async () => {
    vi.stubEnv('VITE_ML_API_URL', 'http://ml.test');
    const boom = vi.fn(async () => {
      throw new Error('down');
    });
    const out = await rankWithML(ITEMS, boom as unknown as typeof fetch);
    expect(out.source).toBe('fallback');
    expect(out.reason).toBe('timeout-or-network');
  });

  it('falls back on HTTP errors and malformed bodies', async () => {
    vi.stubEnv('VITE_ML_API_URL', 'http://ml.test');
    const http500 = vi.fn(async () => new Response('x', { status: 500 }));
    expect((await rankWithML(ITEMS, http500 as unknown as typeof fetch)).source).toBe('fallback');
    const partial = vi.fn(
      async () => Response.json({ ranked: [{ mechanic_id: 'near' }] }),
    );
    const out = await rankWithML(ITEMS, partial as unknown as typeof fetch);
    expect(out.source).toBe('fallback');
    expect(out.reason).toBe('malformed');
  });

  it('accepts ML ordering while filtering unknown ids', async () => {
    vi.stubEnv('VITE_ML_API_URL', 'http://ml.test');
    const ok = vi.fn(async () =>
      Response.json({ ranked: [{ mechanic_id: 'mid' }, { mechanic_id: 'ghost' }, { mechanic_id: 'near' }, { mechanic_id: 'far' }] }),
    );
    // 'ghost' is dropped; every returned id is known → accepted.
    const out = await rankWithML(ITEMS, ok as unknown as typeof fetch);
    expect(out.source).toBe('ml');
    expect(out.orderedIds).toEqual(['mid', 'near', 'far']);
  });
});

describe('explainMechanic (factual highlights, not model explainability)', () => {
  it('returns empty object for mechanic with no data', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: null, serviceMatch: false, rating: null, reviewCount: null,
      problemCategory: 'other', vehicleType: 'car',
    });
    expect(out).toEqual({});
  });

  it('includes distance when available', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: 2.5, serviceMatch: false, rating: null, reviewCount: null,
      problemCategory: 'other', vehicleType: 'car',
    });
    expect(out.distance).toBe('2.5 km away');
  });

  it('reports sub-km distance as <1 km away', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: 0.5, serviceMatch: false, rating: null, reviewCount: null,
      problemCategory: 'other', vehicleType: 'car',
    });
    expect(out.distance).toBe('<1 km away');
  });

  it('includes service match when true', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: null, serviceMatch: true, rating: null, reviewCount: null,
      problemCategory: 'tow', vehicleType: 'car',
    });
    expect(out.serviceMatch).toBe('supports your service category');
  });

  it('omits service match when false', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: null, serviceMatch: false, rating: null, reviewCount: null,
      problemCategory: 'tow', vehicleType: 'car',
    });
    expect(out.serviceMatch).toBeUndefined();
  });

  it('includes rating and review count', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: null, serviceMatch: false, rating: 4.7, reviewCount: 98,
      problemCategory: 'other', vehicleType: 'car',
    });
    expect(out.rating).toBe('★ 4.7');
    expect(out.reviews).toBe('50 reviews');
  });

  it('caps review count display at 50', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: null, serviceMatch: false, rating: null, reviewCount: 200,
      problemCategory: 'other', vehicleType: 'car',
    });
    expect(out.reviews).toBe('50 reviews');
  });

  it('omits rating and reviews when null or zero', () => {
    const out = explainMechanic({
      id: 'm1', distanceKm: null, serviceMatch: false, rating: null, reviewCount: null,
      problemCategory: 'other', vehicleType: 'car',
    });
    expect(out.rating).toBeUndefined();
    expect(out.reviews).toBeUndefined();
  });
});
