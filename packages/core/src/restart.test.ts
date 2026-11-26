import { describe, expect, it } from 'vitest';
import { lessonsText, startOver } from './restart';
import type { Flow } from './types';

const built: Flow = {
  stage: 'code-review',
  worktree: '/wt',
  branch: 'feature/PROJ-1-x',
  requirements: [{ id: 'R1', text: 'A sort option', check: 'Unit test' }],
  assumptions: ['The hub sends no idle phase'],
  answered: [{ q: 'Which page?', a: 'Both' }],
  steps: [{ n: 1, text: 'Do it', covers: ['R1'], state: 'done' }],
  checks: [{ name: 'lint', ok: true }],
  evidence: { R1: { ok: false, note: 'The list does not sort.' } },
  approved: 'now',
  spent: 12.5,
  gate: { at: 'n', ok: false, merged: false, steps: [] },
  commits: { plan: [], done: [] },
  codeReview: {
    at: 'n',
    summary: 's',
    checks: [],
    findings: [
      {
        id: 'F1',
        reviewer: 'correctness',
        file: 'a.ts',
        line: 3,
        problem: 'Stale PUT.',
        fix: 'Use the saved value.',
        severity: 'blocking',
        state: 'fixed',
        note: ''
      },
      {
        id: 'F2',
        reviewer: 'correctness',
        file: 'b.ts',
        line: 1,
        problem: 'Speculative.',
        fix: 'None.',
        severity: 'blocking',
        state: 'dropped',
        note: ''
      },
      {
        id: 'F3',
        reviewer: 'code-style',
        file: 'c.ts',
        line: 2,
        problem: 'Naming.',
        fix: 'Rename.',
        severity: 'style',
        state: 'open',
        note: ''
      }
    ]
  },
  run: { state: 'done', stage: 'code-review', started: 'n', model: 'opus' },
  need: { kind: 'decision', ask: 'x', actions: [] }
};

describe('lessonsText', () => {
  it('lists the defects that the review fixed, and the requirements that failed, not the dropped ones', () => {
    const t = lessonsText(built);
    expect(t).toContain('- a.ts:3: Stale PUT. Fix: Use the saved value.');
    expect(t).toContain('- R1 did not pass in Testing: The list does not sort.');
    expect(t).not.toContain('Speculative');
    expect(t).not.toContain('Naming');
    expect(t).toContain('No finding about style or standards may remain after Development.');
  });
});

describe('startOver', () => {
  it('goes back to Planning with the plan, the answers and the cost, and nothing that the build made', () => {
    const f = startOver(built);
    expect(f.stage).toBe('planning');
    expect(f.requirements).toEqual(built.requirements);
    expect(f.assumptions).toEqual(built.assumptions);
    expect(f.answered).toEqual(built.answered);
    expect(f.spent).toBe(12.5);
    for (const gone of [
      'steps',
      'checks',
      'evidence',
      'approved',
      'gate',
      'commits',
      'codeReview',
      'run',
      'worktree',
      'branch'
    ] as const) {
      expect(f[gone]).toBeUndefined();
    }
    expect(f.need?.actions[0]).toEqual({ id: 'startPlanning', label: 'Re-plan' });
  });
});
