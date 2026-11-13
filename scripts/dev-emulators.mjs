#!/usr/bin/env node
/**
 * RoadAssist local emulator launcher.
 *
 * Why this exists (each point was verified by inspection, not assumed):
 *
 *  1. The Functions emulator executes COMPILED code: `functions/package.json`
 *     sets `main: lib/index.js` and `emulators:start` does NOT rebuild it.
 *     Only `emulators:exec`'s `predeploy` path rebuilds on deploy. A stale
 *     `functions/lib/` therefore makes the emulator run OLD dispatch code
 *     while you believe you are testing `functions/src`. We build first.
 *
 *  2. `--only auth,firestore,functions` (the command in the older demo notes)
 *     makes Firebase IGNORE `scheduledOfferSweep` outright:
 *       "function ignored because the pubsub emulator does not exist"
 *     With no sweep there is no offer expiry and no rematch, so those
 *     behaviours cannot be exercised locally. We always include pubsub.
 *
 *  3. Refusing to start on an occupied port prevents two suites (or a stale
 *     run) silently sharing 8080/9099 and corrupting each other's data.
 *
 * Usage:
 *   npm run dev:emulators      (build + start auth,firestore,functions,pubsub,storage)
 *   npm run seed:local         (in a second terminal, once emulators are up)
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ID = 'roadassist-9c223';

/** pubsub is load-bearing: without it `scheduledOfferSweep` is disabled. */
const ONLY = ['auth', 'firestore', 'functions', 'pubsub', 'storage'];

const PORTS = [
  ['auth', 9099],
  ['firestore', 8080],
  ['functions', 5001],
  ['pubsub', 8085],
  ['storage', 9199],
  ['ui', 4000],
];

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function assertPortsFree() {
  const busy = [];
  for (const [name, port] of PORTS) {
    if (!(await isPortFree(port))) busy.push(`${name}:${port}`);
  }
  if (busy.length > 0) {
    console.error(
      `\nREFUSING to start: port(s) already in use -> ${busy.join(', ')}\n` +
        'Another emulator or dev server may still be running. Stop it first.\n',
    );
    process.exit(1);
  }
}

function buildFunctions() {
  console.log('[dev:emulators] Building functions (the emulator runs lib/, not src/) ...');
  const result = spawnSync('npm', ['--prefix', 'functions', 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('\n[dev:emulators] Functions build FAILED. Not starting emulators.\n');
    process.exit(result.status ?? 1);
  }
  console.log('[dev:emulators] Functions build OK.');
}

async function main() {
  await assertPortsFree();
  buildFunctions();

  console.log(`\n[dev:emulators] Starting emulators: ${ONLY.join(', ')} (project ${PROJECT_ID})`);
  console.log('[dev:emulators] In another terminal: npm run seed:local\n');

  const child = spawn(
    'npx',
    [
      'firebase',
      'emulators:start',
      '--only',
      ONLY.join(','),
      '--project',
      PROJECT_ID,
    ],
    { cwd: root, stdio: 'inherit', shell: true },
  );

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error('[dev:emulators] failed:', err);
  process.exit(1);
});
