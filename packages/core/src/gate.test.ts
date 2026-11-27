import { describe, expect, it } from 'vitest';
import { applyGate, expandCommand, isTestFile, shellQuote } from './gate';
import type { Gate } from './types';

describe('expandCommand', () => {
  const lists = { changed: ['src/a b.ts', "it's.ts"], tests: ['src/a.test.ts'] };

  it('fills the file lists, quoted for the shell', () => {
    expect(expandCommand('eslint {changed}', lists)).toEqual({
      run: `eslint 'src/a b.ts' 'it'\\''s.ts'`
    });
    expect(expandCommand('vitest run --maxWorkers=2 {tests}', lists)).toEqual({
      run: "vitest run --maxWorkers=2 'src/a.test.ts'"
    });
  });

  it('leaves a command with no list as it is', () => {
    expect(expandCommand('pnpm check:types', lists)).toEqual({ run: 'pnpm check:types' });
  });

  it('skips a command whose list is empty, and says which', () => {
    expect(expandCommand('vitest {tests}', { changed: ['a.ts'], tests: [] })).toEqual({
      skip: 'No changed test files.'
    });
    expect(expandCommand('eslint {changed}', { changed: [], tests: [] })).toEqual({
      skip: 'No changed files.'
    });
  });

  it('gives only the files under a folder, with the folder cut off', () => {
    const l = {
      changed: [],
      tests: ['apps/nq/src/a.test.ts', 'libs/shared/b.test.ts', 'apps/nq/c.spec.ts']
    };
    expect(expandCommand('vitest {tests:apps/nq/}', l)).toEqual({
      run: "vitest 'src/a.test.ts' 'c.spec.ts'"
    });
    expect(expandCommand('vitest {tests:libs/shared/}', l)).toEqual({ run: "vitest 'b.test.ts'" });
  });

  it('skips a package with no changed tests, and names the folder', () => {
    expect(
      expandCommand('vitest {tests:apps/aims/}', { changed: [], tests: ['apps/nq/a.test.ts'] })
    ).toEqual({
      skip: 'No changed test files in apps/aims/.'
    });
  });

  it('fills {atb} with the board command', () => {
    expect(
      expandCommand('x | {atb} diff-scope', { changed: [], tests: [] }, 'node /b/atb.cjs')
    ).toEqual({
      run: 'x | node /b/atb.cjs diff-scope'
    });
  });

  it('does not read $ patterns in a file name as replacement patterns', () => {
    expect(expandCommand('x {changed}', { changed: ['$&.ts'], tests: [] })).toEqual({
      run: "x '$&.ts'"
    });
  });
});

describe('isTestFile', () => {
  it('knows test and spec files', () => {
    expect(isTestFile('a/b.test.tsx')).toBe(true);
    expect(isTestFile('a/b.spec.ts')).toBe(true);
    expect(isTestFile('a/__tests__/x.ts')).toBe(true);
    expect(isTestFile('a/b.ts')).toBe(false);
  });
  it('quotes', () => expect(shellQuote('a')).toBe("'a'"));
});

describe('applyGate', () => {
  const base = { stage: 'code-review' as const };
  const ok: Gate = { at: 'now', ok: true, merged: true, steps: [{ name: 'lint', ok: true }] };

  it('asks for the next step when every step passes', () => {
    const f = applyGate(base, ok);
    expect(f.need).toMatchObject({ kind: 'decision', ask: 'Every check passes after the merge.' });
    expect(f.gate).toBe(ok);
  });

  it('is a problem with a retry, and the first lines of output, at the failed step', () => {
    const f = applyGate(base, {
      ...ok,
      ok: false,
      steps: [
        { name: 'lint', ok: true },
        { name: 'pnpm check:types', ok: false, note: 'TS2322' }
      ]
    });
    expect(f.need).toMatchObject({
      kind: 'problem',
      ask: 'pnpm check:types failed.',
      detail: 'TS2322'
    });
    expect(f.need?.actions[0]).toEqual({ id: 'startGate', label: 'Prepare the push again' });
  });

  it('sends a failure before the commits back to the agent with its output', () => {
    const f = applyGate(base, {
      at: 'now',
      ok: false,
      merged: false,
      verify: true,
      steps: [{ name: 'lint', ok: false, note: 'no-unused-vars' }]
    });
    expect(f.need?.actions.map((a) => a.id)).toEqual([
      'startCodeReview',
      'startVerify',
      'openWorktree'
    ]);
  });
});
