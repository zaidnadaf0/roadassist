import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER, isValidLatLng, safeLatLng } from '@/lib/mapProvider';

describe('isValidLatLng', () => {
  it('accepts finite in-range coordinates', () => {
    expect(isValidLatLng(12.9716, 77.5946)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(true);
    expect(isValidLatLng(-90, -180)).toBe(true);
    expect(isValidLatLng(90, 180)).toBe(true);
  });

  it('rejects missing, non-finite, and out-of-range values', () => {
    expect(isValidLatLng(undefined, 0)).toBe(false);
    expect(isValidLatLng(0, undefined)).toBe(false);
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng(0, Infinity)).toBe(false);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, -181)).toBe(false);
    expect(isValidLatLng('12.9', 0)).toBe(false);
    expect(isValidLatLng(null, null)).toBe(false);
  });
});

describe('safeLatLng', () => {
  it('returns the tuple for valid input and null otherwise', () => {
    expect(safeLatLng(12.9, 77.5)).toEqual([12.9, 77.5]);
    expect(safeLatLng(NaN, 77.5)).toBeNull();
    expect(safeLatLng(12.9, 999)).toBeNull();
  });

  it('keeps DEFAULT_CENTER itself valid (fallback sanity)', () => {
    expect(safeLatLng(DEFAULT_CENTER[0], DEFAULT_CENTER[1])).toEqual(DEFAULT_CENTER);
  });
});
