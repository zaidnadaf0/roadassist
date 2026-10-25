import { describe, expect, it } from 'vitest';
import { isAllowedTransition, isApprovableStatus } from './approval';

describe('mechanic approval transitions', () => {
  it('accepts only the five lifecycle states', () => {
    for (const s of ['pending', 'under_review', 'approved', 'suspended', 'rejected']) {
      expect(isApprovableStatus(s)).toBe(true);
    }
    expect(isApprovableStatus('approved!')).toBe(false);
    expect(isApprovableStatus(null)).toBe(false);
  });

  it('allows the review pipeline and suspend/resume', () => {
    expect(isAllowedTransition('pending', 'under_review')).toBe(true);
    expect(isAllowedTransition('under_review', 'approved')).toBe(true);
    expect(isAllowedTransition('approved', 'suspended')).toBe(true);
    expect(isAllowedTransition('suspended', 'approved')).toBe(true);
    expect(isAllowedTransition('approved', 'approved')).toBe(true);
  });

  it('forces rejected mechanics through re-review', () => {
    expect(isAllowedTransition('approved', 'rejected')).toBe(true);
    expect(isAllowedTransition('rejected', 'approved')).toBe(false);
    expect(isAllowedTransition('rejected', 'under_review')).toBe(true);
    expect(isAllowedTransition(undefined, 'approved')).toBe(true);
  });
});
