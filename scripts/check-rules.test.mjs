import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Linter regression tests: exercise the real `check-rules.mjs` against the
 * real `firestore.rules`, plus a negative test proving the linter bites.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const linter = join(repoRoot, 'scripts', 'check-rules.mjs');
const rulesFile = join(repoRoot, 'firestore.rules');

function runLinter(targetFile) {
  return spawnSync(process.execPath, [linter, targetFile], { cwd: repoRoot, encoding: 'utf8', timeout: 15_000 });
}

describe('check-rules.mjs — M3 invariants', () => {
  it('script exists at the expected path', () => {
    expect(existsSync(linter)).toBe(true);
  });

  it('real firestore.rules passes 36/36', () => {
    const res = runLinter(rulesFile);
    if (res.status !== 0) {
      throw new Error(`linter exited ${res.status}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`);
    }
    expect(res.stdout).toMatch(/38\/38 checks passed/);
    for (const i of [...Array.from({ length: 36 }, (_, index) => index + 1), 37, 38]) {
      expect(res.stdout).toContain(`OK    R${String(i).padStart(3, '0')}`);
    }
  });

  it('a deliberately weakened rules file fails the linter', () => {
    const real = readFileSync(rulesFile, 'utf8');
    const broken = real
      .replace('allow create: if false;', 'allow create: if true;')
      .replace(
        'allow read: if isSignedIn() && (isSelf(uid) || isClaimAdmin());',
        'allow read: if true;',
      );
    expect(broken).not.toBe(real);
    const dir = mkdtempSync(join(tmpdir(), 'roadassist-rules-'));
    const tmpFile = join(dir, 'broken.rules');
    try {
      writeFileSync(tmpFile, broken, 'utf8');
      const res = runLinter(tmpFile);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toMatch(/FAIL {2}R016/);
      expect(res.stdout).toMatch(/FAIL {2}R030/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a missing rules file exits with code 2', () => {
    const res = runLinter(join(tmpdir(), `definitely-not-a-real-file-${Date.now()}.rules`));
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/rules file not found/);
  });
});
