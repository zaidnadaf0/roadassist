import { describe, expect, it } from 'vitest';
import { fnv1a, formatInr, formatUtc, requestRef, shortRef, toMillis } from '@/lib/reference';

/**
 * Regression guard for the clipped-identifier defect (`#MPLETE`, `#ORY-02`,
 * `#ENDING`): a reference must be derived from the whole id, never a tail.
 */
describe('requestRef (never a tail slice)', () => {
  const ids = ['emul-req-complete', 'emul-req-history-02', 'demo-request-pending', 'emul-req-accepted'];

  it('renders a complete, prefixed code instead of the last characters of the id', () => {
    expect(requestRef('emul-req-complete')).toMatch(/^RA-[0-9A-Z]{6}$/);
    expect(requestRef('emul-req-complete')).not.toContain('MPLETE');
    expect(requestRef('emul-req-history-02')).not.toContain('ORY');
    expect(requestRef('demo-request-pending')).not.toContain('ENDING');
  });

  it('is deterministic and stable across calls', () => {
    for (const id of ids) expect(requestRef(id)).toBe(requestRef(id));
  });

  it('distinguishes ids that share a six-character tail', () => {
    // The old slice(-6) collapsed these into the same "#MPLETE".
    expect(requestRef('emul-req-complete')).not.toBe(requestRef('abc-req-complete'));
    expect(requestRef('emul-req-complete')).not.toBe(requestRef('emul-req-not-complete'));
  });

  it('handles missing ids without inventing a reference', () => {
    expect(requestRef(null)).toBe('RA-——');
    expect(requestRef('')).toBe('RA-——');
    expect(shortRef(undefined)).toBe('—');
  });
});

describe('hash helpers', () => {
  it('fnv1a is a stable unsigned 32-bit value', () => {
    expect(fnv1a('roadassist')).toBe(fnv1a('roadassist'));
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBeGreaterThanOrEqual(0);
    expect(fnv1a('a')).toBeLessThanOrEqual(0xffffffff);
  });

  it('shortRef honours the requested width', () => {
    expect(shortRef('evt-1', 8)).toHaveLength(8);
    expect(shortRef('evt-1', 4)).toHaveLength(4);
  });
});

describe('time and money formatting never fabricate values', () => {
  it('toMillis handles Timestamp-like objects, millis and ISO strings only', () => {
    expect(toMillis({ toMillis: () => 1234 })).toBe(1234);
    expect(toMillis(1234)).toBe(1234);
    expect(toMillis('2026-11-02T10:00:00.000Z')).toBe(Date.UTC(2026, 10, 2, 10));
    expect(toMillis(null)).toBeNull();
    expect(toMillis('not-a-date')).toBeNull();
    expect(toMillis(Number.NaN)).toBeNull();
    expect(toMillis({})).toBeNull();
  });

  it('formatUtc returns null for unknown values so callers can show "—"', () => {
    expect(formatUtc(null)).toBeNull();
    expect(formatUtc(undefined)).toBeNull();
    expect(formatUtc('2026-11-02T10:00:00.000Z')).toContain('2026');
  });

  it('formatInr is null-safe', () => {
    expect(formatInr(49900)).toBe('₹499');
    expect(formatInr(1250000)).toBe('₹12,500');
    expect(formatInr(null)).toBe('—');
  });
});
