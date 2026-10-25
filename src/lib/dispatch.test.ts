import { describe, expect, it } from 'vitest';
import { offerCountdown } from '@/lib/dispatch';

describe('offerCountdown (display only — backend decides)', () => {
  it('formats mm:ss and clamps at zero', () => {
    expect(offerCountdown(125_000, 5_000)).toBe('2:00');
    expect(offerCountdown(65_000, 5_000)).toBe('1:00');
    expect(offerCountdown(5_000, 5_000)).toBe('0:00');
    expect(offerCountdown(1_000, 5_000)).toBe('0:00');
  });

  it('returns null without an expiry', () => {
    expect(offerCountdown(null)).toBeNull();
  });
});
