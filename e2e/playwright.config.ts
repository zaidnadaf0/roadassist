import { defineConfig, devices } from '@playwright/test';

/**
 * M1.1 browser E2E — LOCAL EMULATORS ONLY.
 *
 * Discovery fix: this config lives in `e2e/`, so `testDir: '.'` resolves to
 * `e2e/` itself. The previous `testDir: './e2e'` resolved to `e2e/e2e`, which
 * matched no test at all.
 *
 * `globalSetup` is the hard safety gate (see e2e/global-setup.ts): the run
 * aborts unless the local emulators answer on 127.0.0.1 AND `.env.emulator`
 * explicitly enables emulator mode.
 *
 * Prerequisites (two terminals):
 *   npm run dev:emulators     # auth, firestore, functions, pubsub, storage
 *   npm run seed:local        # synthetic accounts + fixtures
 * then:
 *   npm run test:e2e
 *
 * Vite is started automatically in `emulator` mode, which loads .env.emulator
 * (VITE_USE_EMULATORS=true, VITE_ROADASSIST_MODE=live).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  globalSetup: './global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    // Call the local binary directly. `npx` resolves to npx.ps1 here, which
    // Playwright's shell-spawned server cannot launch on Windows (the health
    // check then times out even though Vite is healthy).
    // `cwd` is required: Playwright runs the command from the CONFIG directory
    // (e2e/), so a relative vite path would not resolve.
    // `--mode emulator` makes Vite load .env.emulator. If that file is
    // missing the app starts unconfigured (never pointed at production), and
    // globalSetup has already refused to run.
    command: 'node node_modules/vite/bin/vite.js --mode emulator --port 5173 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
