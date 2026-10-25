import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicOrder, rankWithML, type RankInput } from '@/lib/mlRank';

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
