#!/usr/bin/env node
/**
 * Seed the LOCAL Firebase Emulator Suite with one command.
 *
 * `scripts/seed-emulator.mjs` deliberately REFUSES to run unless the emulator
 * host variables are present (that refusal is its safety property, and it is
 * preserved). This wrapper supplies those variables for 127.0.0.1 only, so a
 * human or a test harness cannot forget them and cannot point them at a
 * real project by accident.
 *
 * Usage (emulators must already be running):
 *   npm run seed:local
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(process.execPath, [join(root, 'scripts', 'seed-emulator.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Hard-coded loopback only. Never inherited from a caller.
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    SEED_PROJECT_ID: 'roadassist-9c223',
  },
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[seed:local] failed to start seed script:', err);
  process.exit(1);
});
