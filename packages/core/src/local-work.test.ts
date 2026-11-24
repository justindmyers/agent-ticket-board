import { describe, expect, it } from 'vitest';
import type { Run } from './detect';
import { findLocalWork, localLabel } from './local-work';

const WORKTREES = [
  'worktree /code/app',
  'HEAD aaa',
  'branch refs/heads/main',
  '',
  'worktree /code/app-wt/proj-12',
  'HEAD bbb',
  'branch refs/heads/feat/PROJ-12-sort-cameras',
  '',
  'worktree /code/app-wt/detached',
  'HEAD ccc',
  'detached',
  ''
].join('\n');

const BRANCHES = [
  'main',
  'feat/PROJ-12-sort-cameras',
  'fix/proj-7-back-button',
  'feat/PROJ-120-other'
].join('\n');

const fake =
  (calls: string[][] = []): Run =>
  async (_cmd, args, cwd) => {
    calls.push([cwd ?? '', ...args]);
    if (args[0] === 'worktree') {
      return WORKTREES;
    }
    if (args[0] === 'for-each-ref') {
      return BRANCHES;
    }
    if (args[0] === 'status') {
      return cwd === '/code/app-wt/proj-12' ? ' M a.ts\n?? b.ts\n M c.ts\n' : '';
    }
    throw new Error('unexpected ' + args.join(' '));
  };

describe('findLocalWork', () => {
  it('finds the branch and the changed files in its worktree', async () => {
    const work = await findLocalWork('/code/app', ['PROJ-12', 'PROJ-7', 'PROJ-9'], fake());
    expect(work['PROJ-12']).toEqual({
      branch: 'feat/PROJ-12-sort-cameras',
      worktree: '/code/app-wt/proj-12',
      changed: 3
    });
  });

  it('finds a branch with no worktree, and ignores letter case', async () => {
    const work = await findLocalWork('/code/app', ['PROJ-7'], fake());
    expect(work['PROJ-7']).toEqual({
      branch: 'fix/proj-7-back-button',
      worktree: null,
      changed: 0
    });
  });

  it('does not match a longer key that starts with the same digits', async () => {
    const work = await findLocalWork('/code/app', ['PROJ-1', 'PROJ-9'], fake());
    expect(work).toEqual({});
  });

  it('reads status only for the worktrees of the asked tickets', async () => {
    const calls: string[][] = [];
    await findLocalWork('/code/app', ['PROJ-7'], fake(calls));
    expect(calls.some((c) => c[1] === 'status')).toBe(false);
  });

  it('gives no local work when there is no repo or git fails', async () => {
    expect(await findLocalWork(null, ['PROJ-12'], fake())).toEqual({});
    const broken: Run = async () => {
      throw new Error('not a git repository');
    };
    expect(await findLocalWork('/code/app', ['PROJ-12'], broken)).toEqual({});
  });
});

describe('localLabel', () => {
  it.each([
    [
      { branch: 'b', worktree: '/wt/proj-12-sort', changed: 3 },
      'Worktree proj-12-sort, 3 changed files'
    ],
    [{ branch: 'b', worktree: '/wt/x', changed: 1 }, 'Worktree x, 1 changed file'],
    [{ branch: 'b', worktree: '/wt/x', changed: 0 }, 'Worktree x, no changes to commit'],
    [{ branch: 'b', worktree: null, changed: 0 }, 'Branch b, no worktree']
  ])('describes %o', (work, text) => {
    expect(localLabel(work)).toBe(text);
  });
});
