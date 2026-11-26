import { describe, expect, it } from 'vitest';
import {
  applyReview,
  canReview,
  parseReview,
  reviewPrompt,
  REVIEW_SCHEMA,
  type ReviewResult
} from './review';
import type { Flow, Ticket } from './types';

const ticket: Ticket = {
  key: 'PROJ-7',
  summary: 'Sort cameras',
  status: 'In Progress',
  type: 'Story',
  priority: 'Medium',
  labels: [],
  points: 3,
  updated: null
};

const approved: Flow = {
  stage: 'testing',
  worktree: '/code/wt',
  approved: '2026-01-01T00:00:00Z',
  requirements: [{ id: 'R1', text: 'A sort option', check: 'Unit test' }]
};

const finding = (o: Partial<ReviewResult['findings'][number]> = {}) => ({
  reviewer: 'correctness',
  file: 'a.ts',
  line: 3,
  problem: 'Wrong',
  fix: 'Right',
  severity: 'blocking' as const,
  state: 'fixed' as const,
  note: '',
  ...o
});

const result = (o: Partial<ReviewResult> = {}): ReviewResult => ({
  findings: [],
  checks: [{ name: 'check:types', ok: true, note: '' }],
  summary: 'Done.',
  ...o
});

describe('canReview', () => {
  it('needs the approval and a worktree', () => {
    expect(canReview(null)).toMatch(/approve/);
    expect(canReview({ ...approved, approved: undefined })).toMatch(/approve/);
    expect(canReview({ ...approved, worktree: undefined })).toMatch(/worktree/);
    expect(canReview(approved)).toBeNull();
  });
});

describe('parseReview', () => {
  it('accepts the schema shape and rejects others', () => {
    expect(parseReview(result()).summary).toBe('Done.');
    expect(() => parseReview({ findings: 'x' })).toThrow(/unexpected shape/);
    expect(JSON.stringify(REVIEW_SCHEMA)).toContain('findings');
  });
});

describe('applyReview', () => {
  const at = '2026-01-02T00:00:00Z';

  it('numbers the findings and asks for the next step when all is fixed and the checks pass', () => {
    const f = applyReview(
      approved,
      result({
        findings: [
          finding(),
          finding({ state: 'dropped', note: 'Not in source' }),
          finding({ severity: 'style', state: 'open' })
        ]
      }),
      at
    );
    expect(f.codeReview?.findings.map((x) => x.id)).toEqual(['F1', 'F2', 'F3']);
    expect(f.need?.kind).toBe('decision');
    expect(f.need?.ask).toBe('Review done: 1 fixed, 1 dropped, 1 style note.');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['startCommitPlan', 'openWorktree']);
  });

  it('never blocks on an open style finding', () => {
    const f = applyReview(
      approved,
      result({ findings: [finding({ severity: 'style', state: 'open' })] }),
      at
    );
    expect(f.need?.kind).toBe('decision');
  });

  it('is a problem with a retry when a blocking finding is open', () => {
    const f = applyReview(approved, result({ findings: [finding({ state: 'open' })] }), at);
    expect(f.need?.kind).toBe('problem');
    expect(f.need?.ask).toBe('1 finding is not fixed.');
    expect(f.need?.actions[0]).toEqual({ id: 'startCodeReview', label: 'Review again' });
  });

  it('ignores the checks that the agent reports: it can fail to run them, and the board runs them', () => {
    const f = applyReview(
      approved,
      result({ checks: [{ name: 'check:types', ok: false, note: 'Not run: the guard failed' }] }),
      at
    );
    expect(f.need?.kind).toBe('decision');
    expect(f.need?.detail).not.toMatch(/check/i);
  });
});

describe('reviewPrompt', () => {
  it('gives the failed checks of the board to the agent, to fix first', () => {
    const f: Flow = {
      ...approved,
      gate: {
        at: 'n',
        ok: false,
        merged: false,
        verify: true,
        steps: [
          { name: 'lint', ok: true },
          { name: 'pnpm check:types', ok: false, note: 'TS2322 in a.ts(3,1)' }
        ]
      }
    };
    const p = reviewPrompt(ticket, f, [], []);
    expect(p).toContain('# Checks that failed');
    expect(p).toContain('- pnpm check:types\nTS2322 in a.ts(3,1)');
    expect(p).not.toContain('- lint');
    expect(reviewPrompt(ticket, approved, [], [])).not.toContain('# Checks that failed');
  });

  it('names the reviewers, the checking step and the ban on commits', () => {
    const p = reviewPrompt(
      ticket,
      approved,
      ['Please check the empty state'],
      ['pnpm', 'git diff']
    );
    expect(p).toContain('PROJ-7');
    expect(p).toContain('.claude/agents');
    expect(p).toContain('Reviewers never edit files');
    expect(p).toContain('vitest run --maxWorkers=2');
    expect(p).toContain('Do not commit, push or merge');
    expect(p).toContain('Please check the empty state');
    expect(p).toContain('pnpm; git diff');
  });
});
