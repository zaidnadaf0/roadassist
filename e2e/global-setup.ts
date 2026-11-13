/**
 * Runs ONCE before any browser opens. Fails the whole run if the environment
 * is not provably local. This is the "hard safety guard" — it is not advisory.
 */
import { assertEmulatorEnv, assertEmulatorsReachable } from './support/emulator';

export default async function globalSetup(): Promise<void> {
  assertEmulatorEnv();
  await assertEmulatorsReachable();
  // eslint-disable-next-line no-console
  console.log('[e2e] safety guard passed: emulator env + local emulators reachable');
}
