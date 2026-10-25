import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Emulator-only suite (`npm run test:emulator`, executed under
 * `firebase emulators:exec`). Deliberately separate from the default
 * `vitest.config.ts` so `npm test` never requires a live emulator.
 *
 * The `firebase-admin` alias below is load-bearing: the repo carries two
 * installed copies (root for scripts/tests, functions/ for deployment),
 * and Admin-SDK classes (Timestamp/FieldValue) are prototype-compared.
 * Without unification, seeds written by the test and validated by
 * functions/src/dispatch.ts fail `instanceof` checks (dual-package hazard).
 */
export default defineConfig({
  resolve: {
    // Exact subpath entries (prefix matching is off for string finds).
    alias: {
      'firebase-admin/app': path.resolve(import.meta.dirname, './node_modules/firebase-admin/lib/app/index.js'),
      'firebase-admin/firestore': path.resolve(import.meta.dirname, './node_modules/firebase-admin/lib/firestore/index.js'),
      'firebase-admin': path.resolve(import.meta.dirname, './node_modules/firebase-admin/lib/index.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['emulator/**/*.test.ts'],
    testTimeout: 60_000,
    sequence: { shuffle: false },
  },
});
