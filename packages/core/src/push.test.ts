import { describe, expect, it } from 'vitest';
import {
  approvalProblem,
  planPushFlow,
  pushArgs,
  pushedFlow,
  pushProblem,
  webUrl,
  type PushFacts
} from './push';
import type { Flow } from './types';

describe('webUrl', () => {
  it('never puts the credentials of a remote into the address', () => {
    expect(webUrl('https://user:secret-token@github.com/org/repo.git')).not.toMatch(/secret|user/);
  });

  it.each([
    ['https://github.com/org/repo.git', 'https://github.com/org/repo'],
    ['https://github.com/org/repo', 'https://github.com/org/repo'],
    ['https://user:token@github.com/org/repo.git', 'https://github.com/org/repo'],
    ['https://token@github.com/org/repo.git', 'https://github.com/org/repo'],
    ['git@github.com:org/repo.git', 'https://github.com/org/repo'],
    ['ssh://git@github.com/org/repo.git', 'https://github.com/org/repo'],
    ['https://github.com/org/my.repo-name.git\n', 'https://github.com/org/my.repo-name'],
    ['https://gitlab.com/org/repo.git', null],
    ['https://github.com.evil.example/org/repo.git', null],
    ['not a url', null]
  ])('%s -> %s', (remote, want) => {
    expect(webUrl(remote)).toBe(want);
  });
});

describe('pushArgs', () => {
  it('is always HEAD:<branch>, never bare, never forced', () => {
    expect(pushArgs('feature/x')).toEqual(['push', 'origin', 'HEAD:feature/x']);
  });
});

describe('pushProblem', () => {
  const ok: PushFacts = {
    branch: 'feature/x',
    base: 'main',
    dirty: '',
    head: 'h1',
    gate: { at: 'n', ok: true, merged: false, steps: [], head: 'h1' },
    commits: [{ sha: 's', short: 's', title: 't' }]
  };
  it('accepts a clean branch whose commit the checks passed', () => {
    expect(pushProblem(ok)).toBeNull();
  });
  it.each([
    ['a detached head', { branch: null }, /on no branch/],
    ['a branch name with a shell character', { branch: 'a;rm -rf' }, /does not accept/],
    ['the base branch', { branch: 'main' }, /is the base branch/],
    ['a dirty tree', { dirty: ' M a.ts' }, /Commit or discard/],
    ['no gate', { gate: undefined }, /have not passed/],
    ['a failed gate', { gate: { ...ok.gate!, ok: false } }, /have not passed/],
    ['a verify-only gate', { gate: { ...ok.gate!, verify: true as const } }, /have not passed/],
    ['a commit that is not the checked one', { head: 'h2' }, /changed after the checks/],
    ['no commit to push', { commits: [] }, /Nothing to push/]
  ] as [string, Partial<PushFacts>, RegExp][])('refuses %s', (_n, over, why) => {
    expect(pushProblem({ ...ok, ...over })).toMatch(why);
  });
});

describe('approvalProblem', () => {
  const f = (push?: Partial<NonNullable<Flow['push']>>): Flow => ({
    stage: 'ship',
    ...(push
      ? {
          push: { branch: 'b', head: 'h', commits: [], command: 'c', dryRun: '', at: 'n', ...push }
        }
      : {})
  });
  it('needs the preview, the same branch and the same commit, and one push only', () => {
    expect(approvalProblem(f(), 'b', 'h')).toMatch(/Preview the push first/);
    expect(approvalProblem(f({}), 'b', 'h')).toBeNull();
    expect(approvalProblem(f({}), 'other', 'h')).toMatch(/Update the push preview/);
    expect(approvalProblem(f({}), 'b', 'h2')).toMatch(/Update the push preview/);
    expect(approvalProblem(f({ pushedAt: 'n' }), 'b', 'h')).toMatch(/pushed already/);
  });
});

describe('pushedFlow', () => {
  it('offers the pull request next, not a note that the board cannot make one', () => {
    const f = pushedFlow(
      {
        stage: 'ship',
        push: {
          branch: 'feature/X-1',
          head: 'abc1234567',
          commits: [],
          command: 'c',
          dryRun: '',
          at: 'n'
        }
      },
      'now'
    );
    expect(f.push?.pushedAt).toBe('now');
    expect(f.need?.ask).toBe('Pushed feature/X-1 to origin (abc1234).');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['showPr', 'openWorktree']);
    expect(f.need?.detail).not.toMatch(/does not make/);
  });
});

describe('planPushFlow', () => {
  it('asks for the approval and offers nothing else to press but the worktree', () => {
    const f = planPushFlow(
      { stage: 'ship' },
      { branch: 'feature/X-1', head: 'h', commits: [], dryRun: 'ok' },
      'now'
    );
    expect(f.need?.actions.map((a) => a.id)).toEqual(['approvePush', 'openWorktree']);
  });
});
