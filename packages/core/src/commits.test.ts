import { describe, expect, it } from 'vitest';
import {
  applyCommitPlan,
  canPlanCommits,
  changedFiles,
  commitPrompt,
  commitsDone,
  commitTitle,
  parseCommitPlan,
  planProblem,
  type CommitPlan
} from './commits';
import type { Flow, Ticket } from './types';

const ticket: Ticket = {
  key: 'PROJ-1',
  summary: 'Sort cameras',
  status: 'In Progress',
  type: 'Story',
  priority: 'Medium',
  labels: [],
  points: 3,
  updated: null
};
const flow: Flow = {
  stage: 'code-review',
  worktree: '/wt',
  codeReview: { at: 'now', summary: 'Done.', findings: [], checks: [] }
};
const commit = (o: Partial<CommitPlan['commits'][number]> = {}) => ({
  type: 'feat' as const,
  scope: 'edges',
  description: 'add a sort option',
  files: ['a.ts'],
  ...o
});
const plan = (...commits: CommitPlan['commits']): CommitPlan => ({
  commits,
  summary: 'Two topics.'
});

describe('changedFiles', () => {
  it('reads git status -z: staged, unstaged, new files and the new path of a rename', () => {
    expect(changedFiles(' M a.ts\0?? b c.ts\0R  new.ts\0old.ts\0A  d.ts\0')).toEqual([
      'a.ts',
      'b c.ts',
      'new.ts',
      'd.ts'
    ]);
  });
});

describe('commitTitle', () => {
  it('is type(scope): description (KEY)', () => {
    expect(commitTitle(commit(), 'PROJ-1')).toBe('feat(edges): add a sort option (PROJ-1)');
  });
});

describe('planProblem', () => {
  const ok = plan(commit({ files: ['a.ts'] }), commit({ type: 'test', files: ['a.test.ts'] }));

  it('accepts a plan that gives every changed file to one commit', () => {
    expect(planProblem(ok, ['a.ts', 'a.test.ts'], 'PROJ-1')).toBeNull();
  });

  it.each([
    ['an upper case title', plan(commit({ description: 'Add a sort option' })), 'lowercase'],
    ['a title over 72 characters', plan(commit({ description: 'x'.repeat(70) })), '72'],
    ['a period at the end', plan(commit({ description: 'add a sort option.' })), 'period'],
    ['a commit with no files', plan(commit({ files: [] })), 'no files']
  ])('refuses %s', (_n, p, text) => {
    expect(planProblem(p, ['a.ts'], 'PROJ-1')).toMatch(text);
  });

  it('refuses a file in two commits, a file in none, and a file that did not change', () => {
    expect(planProblem(plan(commit(), commit({ files: ['a.ts'] })), ['a.ts'], 'PROJ-1')).toMatch(
      /one commit only: a.ts/
    );
    expect(planProblem(ok, ['a.ts', 'a.test.ts', 'c.ts'], 'PROJ-1')).toMatch(/in no commit: c.ts/);
    expect(planProblem(ok, ['a.ts'], 'PROJ-1')).toMatch(
      /did not change are in the plan: a.test.ts/
    );
  });
});

describe('applyCommitPlan', () => {
  it('shows the plan and asks the developer to make it', () => {
    const f = applyCommitPlan(flow, plan(commit()), ['a.ts'], 'PROJ-1');
    expect(f.commits?.plan).toEqual([
      { title: 'feat(edges): add a sort option (PROJ-1)', files: ['a.ts'] }
    ]);
    expect(f.need?.actions.map((a) => a.id)).toEqual([
      'approveCommits',
      'startCommitPlan',
      'openWorktree'
    ]);
  });

  it('goes to the checks when nothing is left to commit', () => {
    const f = applyCommitPlan(flow, plan(), [], 'PROJ-1');
    expect(f.need?.actions[0]?.id).toBe('startGate');
  });

  it('throws the problem of a bad plan, so the run fails with a retry', () => {
    expect(() => applyCommitPlan(flow, plan(commit()), ['a.ts', 'b.ts'], 'PROJ-1')).toThrow(
      /in no commit/
    );
  });
});

describe('commitsDone', () => {
  it('counts the commits made and offers the checks', () => {
    const f = commitsDone({ ...flow, commits: { plan: [], done: [{ title: 't', sha: 'abc' }] } });
    expect(f.need?.ask).toBe('1 commit made.');
    expect(f.need?.actions[0]?.id).toBe('startGate');
  });
});

describe('canPlanCommits, parseCommitPlan and the prompt', () => {
  it('needs a review and a worktree', () => {
    expect(canPlanCommits(null)).toMatch(/review/);
    expect(canPlanCommits({ ...flow, worktree: undefined })).toMatch(/worktree/);
    expect(canPlanCommits(flow)).toBeNull();
  });
  it('rejects a bad shape', () => {
    expect(() => parseCommitPlan({ commits: [{ type: 'oops' }] })).toThrow(/unexpected shape/);
  });
  it('lists the files and bans edits, commits and staging', () => {
    const p = commitPrompt(ticket, flow, ['a.ts', 'b.ts'], ['git diff']);
    expect(p).toContain('- a.ts');
    expect(p).toContain('Never copy the Jira summary');
    expect(p).toContain('Do not edit files. Do not commit, push or stage.');
  });
});
