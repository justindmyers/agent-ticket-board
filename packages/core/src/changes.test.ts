import { describe, expect, it } from 'vitest';
import { pendingChanges, requestChange } from './changes';
import { applyPlan, isFinalPlan, planNeed, planPrompt } from './planning';
import { restingNeed } from './next-step';
import type { Flow } from './types';

const t = {
  key: 'PROJ-9',
  summary: 'Versions',
  status: 'In Progress',
  type: 'Story',
  priority: 'Low',
  labels: [],
  points: 1,
  updated: null,
  description: ''
};
const tested: Flow = {
  stage: 'testing',
  requirements: [
    { id: 'R1', text: 'A version field', check: 'Type a version' },
    { id: 'R2', text: 'A save button', check: 'Click save' }
  ],
  steps: [
    { n: 1, text: 'Add the field', covers: ['R1'], state: 'done' },
    { n: 2, text: 'Add the button', covers: ['R2'], state: 'done' }
  ],
  answered: [{ q: 'Which API?', a: 'v2' }],
  run: { state: 'done', stage: 'testing', started: '2026-11-24T10:00:00Z', model: 'sonnet' }
};

describe('requestChange', () => {
  it('sends a built ticket back to Planning with the change, and keeps what is built', () => {
    const f = requestChange(tested, 'The version field should be stricter', '2026-11-24T11:00:00Z');
    expect(f.stage).toBe('planning');
    expect(f.need).toBeUndefined();
    expect(pendingChanges(f)).toEqual([
      { text: 'The version field should be stricter', at: '2026-11-24T11:00:00Z' }
    ]);
    expect(f.steps).toEqual(tested.steps);
  });
  it('keeps a ticket in Planning as it is: a comment there is a note for the re-plan', () => {
    const f = requestChange({ stage: 'planning' }, 'x', 'now');
    expect(f.changes).toBeUndefined();
  });
  it('refuses while an agent runs, and refuses an empty change', () => {
    expect(() =>
      requestChange({ ...tested, run: { ...tested.run!, state: 'running' } }, 'x', 'now')
    ).toThrow(/Stop the run first/);
    expect(() => requestChange(tested, '  ', 'now')).toThrow(/Write what to change/);
  });
});

describe('a change re-plan', () => {
  const f = requestChange(tested, 'The version field should be stricter', 'now');

  it('tells the agent what is built and asks for the new steps only', () => {
    const p = planPrompt(t as never, [], f.questions, f.answered, [], f);
    expect(p).toContain('# Changes the developer asked for after the build');
    expect(p).toContain('- The version field should be stricter');
    expect(p).toContain('1. Add the field [R1] (built)');
    expect(p).toMatch(/Return only the steps that are still to do/);
    expect(p).toMatch(/When the developer asks a question, answer it in an assumption/);
  });
  it('has no questions: the developer sees the assumptions when approving', () => {
    expect(isFinalPlan(f)).toBe(true);
  });
  it('keeps the built steps and numbers the new steps after them', () => {
    const out = applyPlan(f, {
      requirements: [
        {
          id: 'R1',
          text: 'A version field that takes x.y.z only',
          check: 'Type 1.2 and see an error'
        },
        { id: 'R2', text: 'A save button', check: 'Click save' }
      ],
      questions: [],
      assumptions: ['Strict means semantic versions only'],
      steps: [{ text: 'Validate the version format', covers: ['R1'] }],
      writes: []
    });
    expect(out.steps?.map((s) => [s.n, s.text, s.state])).toEqual([
      [1, 'Add the field', 'done'],
      [2, 'Add the button', 'done'],
      [3, 'Validate the version format', 'todo']
    ]);
    expect(pendingChanges(out)).toEqual([]);
    expect(out.need?.ask).toBe('Approve the plan: 2 requirements, 3 steps');
  });
  it('asks for a re-plan when the change is not planned yet, for example after a failed run', () => {
    expect(planNeed(f).actions[0]?.id).toBe('replan');
    expect(planNeed(f).ask).toBe('Plan your change: re-plan');
    expect(
      restingNeed({ ...f, run: { ...tested.run!, state: 'failed', stage: 'planning' } })?.ask
    ).toBe('Plan your change: re-plan');
  });
});
