import { describe, expect, it } from 'vitest';
import { withNextStep } from './next-step';
import type { Flow } from './types';

const open = { id: 'openWorktree', label: 'Open worktree' };
const approved: Flow = {
  stage: 'testing',
  approved: '2026-01-01T00:00:00Z',
  need: { kind: 'decision', ask: 'Approved for code review.', actions: [open] }
};

describe('withNextStep for an approved change', () => {
  it('offers the review when an old approval has only "Open worktree"', () => {
    const f = withNextStep(approved);
    expect(f.need?.actions.map((a) => a.id)).toEqual(['startCodeReview', 'openWorktree']);
    expect(f.need?.ask).toBe('Approved for code review.');
  });

  it('adds nothing twice, and nothing once the review ran or runs', () => {
    const once = withNextStep(approved);
    expect(withNextStep(once)).toEqual(once);
    expect(
      withNextStep({ ...approved, codeReview: { at: 'n', summary: '', findings: [], checks: [] } })
    ).toEqual({
      ...approved,
      codeReview: { at: 'n', summary: '', findings: [], checks: [] }
    });
    const running = {
      ...approved,
      run: { state: 'running' as const, stage: 'code-review' as const, started: 'n', model: 'opus' }
    };
    expect(withNextStep(running)).toEqual(running);
  });
});
