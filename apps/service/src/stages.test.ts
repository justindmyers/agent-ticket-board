import { describe, expect, it } from 'vitest';
import { STAGE_SPECS } from './stages';

describe('the development stage', () => {
  it('keeps the built steps of a plan revised for a change: the build makes only the new ones', () => {
    const f = STAGE_SPECS.development.begin({
      stage: 'planning',
      changes: [{ text: 'Stricter', at: 'now', planned: true }],
      steps: [
        { n: 1, text: 'Built', covers: ['R1'], state: 'done' },
        { n: 2, text: 'New', covers: ['R1'], state: 'todo' },
        { n: 3, text: 'Was current', covers: ['R1'], state: 'current' }
      ]
    });
    expect(f.steps?.map((s) => s.state)).toEqual(['done', 'todo', 'todo']);
  });
});

describe('the code review stage', () => {
  const spec = STAGE_SPECS['code-review'];

  it('refuses a ticket that the developer has not approved', () => {
    expect(spec.refuse({ stage: 'testing', worktree: '/wt' })).toMatch(/approve/);
    expect(spec.refuse({ stage: 'testing', worktree: '/wt', approved: 'now' })).toBeNull();
  });

  it('moves the record to Code review and clears the need', () => {
    const f = spec.begin({
      stage: 'testing',
      approved: 'now',
      need: { kind: 'decision', ask: 'Approved.', actions: [] }
    });
    expect(f.stage).toBe('code-review');
    expect(f.need).toBeUndefined();
    expect(f.approved).toBe('now');
  });

  it('gives the run the board reviewers and the subagent tool, and no commit or push command', () => {
    expect(Object.keys(spec.agents ?? {})).toEqual(['correctness', 'code-style']);
    expect(spec.tools).toContain('Agent');
    expect(spec.allowed.some((a) => /git (commit|push|merge)/.test(a))).toBe(false);
  });

  it('lets the reviewers read and never write', () => {
    for (const a of Object.values(spec.agents ?? {})) {
      expect(a.tools.some((t) => /^(Edit|Write)$/.test(t))).toBe(false);
    }
  });
});
