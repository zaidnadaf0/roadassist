import { describe, expect, it } from 'vitest';
import { nextClaims } from './admin';

/**
 * Claim-map merge semantics: setCustomUserClaims REPLACES the whole map, so
 * grant/revoke must preserve every unrelated claim. Revoke removes the key
 * via a null value (Auth semantics), never by rewriting the map to {}.
 */
describe('nextClaims (grant/revoke claim merge)', () => {
  it('grant sets admin:true and preserves other claims', () => {
    expect(nextClaims({ role: 'auditor', team: 'ops' }, true)).toEqual({ role: 'auditor', team: 'ops', admin: true });
  });

  it('grant on a claim-less account sets only admin', () => {
    expect(nextClaims(undefined, true)).toEqual({ admin: true });
  });

  it('revoke nulls admin and preserves other claims', () => {
    expect(nextClaims({ role: 'auditor', admin: true }, false)).toEqual({ role: 'auditor', admin: null });
  });

  it('revoke on a claim-less account writes only the null admin key', () => {
    expect(nextClaims(undefined, false)).toEqual({ admin: null });
    expect(nextClaims({}, false)).toEqual({ admin: null });
  });

  it('never invents or drops unknown keys on either path', () => {
    const existing = { aud: 'roadassist', exp: 1, customFlag: 'x' };
    expect(Object.keys(nextClaims(existing, true)).sort()).toEqual(['admin', 'aud', 'customFlag', 'exp'].sort());
    expect(Object.keys(nextClaims(existing, false)).sort()).toEqual(['admin', 'aud', 'customFlag', 'exp'].sort());
  });
});
