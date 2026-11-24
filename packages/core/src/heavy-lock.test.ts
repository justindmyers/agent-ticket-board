import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireHeavy, releaseHeavy } from './heavy-lock';
import { isHeavy } from './look';

describe('isHeavy', () => {
  it('finds type checks, lint, tests and builds', () => {
    for (const c of [
      'pnpm --filter nq check:types',
      'pnpm exec tsc --noEmit',
      'pnpm --filter nq test:once src/a.test.tsx',
      'npx vitest run src/a.test.ts',
      'pnpm --filter nq lint',
      'pnpm exec eslint src',
      'pnpm build'
    ]) {
      expect(isHeavy(c), c).toBe(true);
    }
  });
  it('leaves light commands alone', () => {
    for (const c of [
      'git status',
      'pnpm exec playwright-cli -s=x snapshot',
      'ls src',
      'gh pr view 12',
      'cat lint.md'
    ]) {
      expect(isHeavy(c), c).toBe(false);
    }
  });
});

describe('the heavy-command lock', () => {
  const dir = () => join(mkdtempSync(join(tmpdir(), 'atb-lock-')), 'heavy.lock');

  it('lets one owner in at a time, and the next one in after the release', async () => {
    const lock = dir();
    expect(await acquireHeavy(lock, 'a', { waitMs: 0 })).toBe(true);
    expect(await acquireHeavy(lock, 'b', { waitMs: 0 })).toBe(false);
    const b = acquireHeavy(lock, 'b', { waitMs: 3000, pollMs: 50 });
    releaseHeavy(lock, 'a');
    expect(await b).toBe(true);
  });
  it('does not release the lock of another owner', async () => {
    const lock = dir();
    await acquireHeavy(lock, 'a', { waitMs: 0 });
    releaseHeavy(lock, 'b');
    expect(await acquireHeavy(lock, 'c', { waitMs: 0 })).toBe(false);
  });
  it('takes over a lock that is older than the stale limit: its owner crashed', async () => {
    const lock = dir();
    await acquireHeavy(lock, 'a', { waitMs: 0 });
    expect(await acquireHeavy(lock, 'b', { waitMs: 0, staleMs: 0 })).toBe(true);
  });
});
