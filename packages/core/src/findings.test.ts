import { describe, expect, it } from 'vitest';
import {
  applyFix,
  canFixFindings,
  chosenFindings,
  fixPrompt,
  markFinding,
  parseFix
} from './findings';
import { applyGate } from './gate';
import type { Finding, Flow, Ticket } from './types';

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

const finding = (o: Partial<Finding>): Finding => ({
  id: 'F1',
  reviewer: 'correctness',
  file: 'a.ts',
  line: 3,
  problem: 'Wrong.',
  fix: 'Right.',
  severity: 'blocking',
  state: 'fixed',
  note: '',
  ...o
});

const flow = (findings: Finding[], need?: Flow['need']): Flow => ({
  stage: 'code-review',
  worktree: '/wt',
  codeReview: { at: 'n', summary: 's', findings, checks: [] },
  need: need ?? {
    kind: 'decision',
    ask: 'Every check passes on the change.',
    actions: [
      { id: 'startCommitPlan', label: 'Plan the commits' },
      { id: 'openWorktree', label: 'Open worktree' }
    ]
  }
});

const dropped = finding({ id: 'F2', state: 'dropped', note: 'The code does not show it.' });
const style = finding({ id: 'F3', severity: 'style', state: 'open' });
const fixed = finding({ id: 'F1' });

describe('markFinding', () => {
  it('lets the developer fix a dropped finding, and puts that first in the buttons', () => {
    const f = markFinding(flow([fixed, dropped, style]), 'F2', 'fix');
    expect(f.codeReview?.findings.find((x) => x.id === 'F2')?.decision).toBe('fix');
    expect(f.need?.actions.map((a) => a.label)).toEqual([
      'Fix 1 chosen finding',
      'Plan the commits',
      'Open worktree'
    ]);
    expect(f.need?.ask).toBe('Every check passes on the change.');
  });

  it('counts every chosen finding, and takes the button away when none is left', () => {
    let f = markFinding(flow([fixed, dropped, style]), 'F2', 'fix');
    f = markFinding(f, 'F3', 'fix');
    expect(f.need?.actions[0]?.label).toBe('Fix 2 chosen findings');
    f = markFinding(markFinding(f, 'F2', null), 'F3', null);
    expect(f.need?.actions.map((a) => a.id)).toEqual(['startCommitPlan', 'openWorktree']);
    expect(f.codeReview?.findings.every((x) => x.decision === undefined)).toBe(true);
  });

  it('does not use a dismissed finding as a reason for a problem', () => {
    const blocking = finding({ id: 'F4', state: 'open' });
    const f = markFinding(flow([blocking], undefined), 'F4', 'dismiss');
    expect(chosenFindings(f)).toEqual([]);
    expect(f.codeReview?.findings[0]?.decision).toBe('dismiss');
  });

  it('refuses a finding that is fixed, and an id that does not exist', () => {
    expect(() => markFinding(flow([fixed]), 'F1', 'fix')).toThrow(/fixed already/);
    expect(() => markFinding(flow([fixed]), 'F9', 'fix')).toThrow(/no finding F9/);
  });
});

describe('canFixFindings', () => {
  it('needs a chosen finding and a worktree', () => {
    expect(canFixFindings(flow([dropped]))).toMatch(/Choose the findings/);
    expect(canFixFindings(markFinding(flow([dropped]), 'F2', 'fix'))).toBeNull();
    expect(
      canFixFindings({ ...markFinding(flow([dropped]), 'F2', 'fix'), worktree: undefined })
    ).toMatch(/worktree/);
  });
});

describe('fixPrompt', () => {
  it('lists only the chosen findings, with why the checker dropped one', () => {
    const f = markFinding(flow([fixed, dropped, style]), 'F2', 'fix');
    const p = fixPrompt(ticket, f, ['pnpm']);
    expect(p).toContain('- F2 (correctness) a.ts:3: Wrong.');
    expect(p).toContain('The checker dropped it because: The code does not show it.');
    expect(p).not.toContain('F3');
    expect(p).not.toContain('- F1');
    expect(p).toContain('Start no new review.');
    expect(p).toContain('Do not commit, push');
  });
});

describe('applyFix', () => {
  const chosen = () =>
    markFinding(markFinding(flow([fixed, dropped, style]), 'F2', 'fix'), 'F3', 'fix');

  it('marks a fixed finding fixed, clears the choice, and keeps the others', () => {
    const f = applyFix(
      chosen(),
      parseFix({
        findings: [
          { id: 'F2', fixed: true, note: 'Guarded the empty list.' },
          { id: 'F3', fixed: true, note: '' }
        ],
        summary: 'Two fixed.'
      })
    );
    const by = (id: string) => f.codeReview?.findings.find((x) => x.id === id);
    expect(by('F2')).toMatchObject({ state: 'fixed', note: 'Guarded the empty list.' });
    expect(by('F2')?.decision).toBeUndefined();
    expect(by('F3')?.state).toBe('fixed');
    expect(by('F1')?.state).toBe('fixed');
    expect(f.codeReview?.summary).toBe('Two fixed.');
    expect(f.need?.kind).toBe('decision');
  });

  it('keeps a finding that the agent could not fix, with the reason, and a dropped one stays dropped', () => {
    const f = applyFix(
      chosen(),
      parseFix({
        findings: [
          { id: 'F2', fixed: false, note: 'The code already guards it: see line 8.' },
          { id: 'F3', fixed: false, note: 'It needs a new shared helper.' }
        ],
        summary: 'None fixed.'
      })
    );
    const by = (id: string) => f.codeReview?.findings.find((x) => x.id === id);
    expect(by('F2')).toMatchObject({
      state: 'dropped',
      note: 'The code already guards it: see line 8.'
    });
    expect(by('F3')).toMatchObject({ state: 'open', note: 'It needs a new shared helper.' });
  });

  it('rejects a bad shape', () => {
    expect(() => parseFix({ findings: 'x' })).toThrow(/unexpected shape/);
  });
});

describe('the button for the chosen findings', () => {
  it('stays after the board runs its checks, which set the next step again', () => {
    const f = markFinding(flow([fixed, dropped]), 'F2', 'fix');
    const after = applyGate(f, { ok: true, verify: true, steps: [], at: 'n' } as never);
    expect(after.need?.actions.map((a) => a.id)).toEqual([
      'startReviewFix',
      'startCommitPlan',
      'openWorktree'
    ]);
  });

  it('is not added twice', () => {
    let f = markFinding(flow([fixed, dropped, style]), 'F2', 'fix');
    f = markFinding(f, 'F3', 'fix');
    expect(f.need?.actions.filter((a) => a.id === 'startReviewFix')).toHaveLength(1);
  });
});
