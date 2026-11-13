import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M2 supply-chain guard: no Firebase secret material may ever appear in
 * source. Config travels via `.env.local` (gitignored) only.
 *
 * - API keys are matched by their full 39-char shape (`AIza` + 35 chars),
 *   so doc comments that merely name the prefix do not trip the guard.
 * - This file itself is excluded from the foreign-project scan: it must
 *   name what it hunts. It is the single allowed holder of those strings.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'lib' || name === 'dist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const SELF = 'noSecrets.test.ts';
const KEY_RE = /AIza[0-9A-Za-z\-_]{35}/;

// Every first-party source tree that could hold a pasted credential — not
// just the SPA (scripts and Cloud Functions handle credentials by design).
const ROOTS = [import.meta.dirname, join(import.meta.dirname, '..', 'functions', 'src'), join(import.meta.dirname, '..', 'emulator'), join(import.meta.dirname, '..', 'scripts')];

describe('no secrets in source', () => {
  const files = ROOTS.flatMap((root) => walk(root));

  it('scans a non-trivial source tree', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('contains no Firebase API key material', () => {
    const hits = files.filter((f) => KEY_RE.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('references no foreign Firebase project', () => {
    const hits = files
      .filter((f) => !f.endsWith(SELF))
      .filter((f) => readFileSync(f, 'utf8').includes('mechist-e0eba'));
    expect(hits).toEqual([]);
  });
});
