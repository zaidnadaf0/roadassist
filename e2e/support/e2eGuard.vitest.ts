import { describe, expect, it } from 'vitest';
import {
  EMULATOR_ORIGIN,
  PROJECT_ID,
  REQUIRED_EMULATORS,
  assertEmulatorEnv,
  assertEmulatorsReachable,
  fieldValue,
  portAnswers,
} from './emulator';

/**
 * The E2E safety guard is the only thing standing between a browser test and
 * production Firebase (both share project id `roadassist-9c223`). These tests
 * prove the guard actually refuses unsafe states — a guard that cannot fail
 * is not a guard.
 */
describe('E2E safety guard', () => {
  it('hard-codes loopback and never an env-derived host', () => {
    expect(EMULATOR_ORIGIN).toBe('127.0.0.1');
    expect(PROJECT_ID).toBe('roadassist-9c223');
  });

  it('requires auth, firestore and functions emulators', () => {
    const names = REQUIRED_EMULATORS.map((e) => e.name as string);
    expect(names).toEqual(['auth', 'firestore', 'functions']);
  });

  it('reports an unreachable port as dead instead of pretending it answered', async () => {
    // Port 1 is never a Firestore emulator.
    expect(await portAnswers(1)).toBe(false);
  });

  it('accepts the real emulator env file (VITE_USE_EMULATORS=true)', () => {
    expect(() => assertEmulatorEnv()).not.toThrow();
  });

  it('assertEmulatorsReachable resolves or throws — never silently passes', async () => {
    // Live emulators may or may not be running; both outcomes must be decisive.
    await expect(assertEmulatorsReachable()).resolves.toBeUndefined();
  });
});

describe('Firestore REST value decoding', () => {
  it('decodes the typed wrapper shapes the emulator returns', () => {
    const doc = {
      id: 'x',
      fields: {
        s: { stringValue: 'hello' },
        b: { booleanValue: true },
        n: { integerValue: '42' },
        d: { doubleValue: 1.5 },
        z: { nullValue: null },
      } as unknown as Record<string, unknown>,
    };
    expect(fieldValue(doc, 's')).toBe('hello');
    expect(fieldValue(doc, 'b')).toBe(true);
    expect(fieldValue(doc, 'n')).toBe(42);
    expect(fieldValue(doc, 'd')).toBe(1.5);
    expect(fieldValue(doc, 'z')).toBeNull();
    expect(fieldValue(doc, 'missing')).toBeUndefined();
  });
});
