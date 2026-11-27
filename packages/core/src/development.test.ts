import { describe, expect, it } from 'vitest';
import {
  acceptBuild,
  applyBuild,
  BUILD_SCHEMA,
  buildPrompt,
  canDevelop,
  markStep,
  parseBuild,
  type BuildResult
} from './development';
import type { Flow, Ticket } from './types';

const ticket: Ticket = {
  key: 'PROJ-7',
  summary: 'Sort cameras by zone count',
  status: 'To Do',
  type: 'Story',
  priority: 'Medium',
  labels: [],
  points: 3,
  updated: null
};

const planned: Flow = {
  stage: 'planning',
  requirements: [
    { id: 'R1', text: 'A Zones sort option', check: 'Unit test' },
    { id: 'R2', text: 'Descending by default', check: 'Click path' }
  ],
  questions: [],
  answered: [{ q: 'Which list?', a: 'The map list' }],
  steps: [
    { n: 1, text: 'Add the sort key', covers: ['R1', 'R2'], state: 'todo' },
    { n: 2, text: 'Add the menu option', covers: ['R1'], state: 'todo' }
  ],
  need: {
    kind: 'decision',
    ask: 'Approve',
    actions: [{ id: 'approve', label: 'Approve plan and start' }]
  }
};

const ok = { ok: true, note: '' };
const result: BuildResult = {
  steps: [
    { n: 1, done: true, check: 'pnpm vitest sort.test.ts', ok: true, note: '' },
    { n: 2, done: true, check: 'pnpm vitest menu.test.ts', ok: true, note: '' }
  ],
  gate: { typecheck: ok, lint: ok, tests: ok },
  summary: 'Added the Zones sort.',
  followups: []
};

describe('canDevelop', () => {
  it('needs a plan with steps and no open questions', () => {
    expect(canDevelop(planned)).toBeNull();
    expect(canDevelop(null)).toMatch(/no plan/);
    expect(canDevelop({ ...planned, questions: [{ q: 'Open?' }] })).toMatch(/1 open question/);
    expect(canDevelop({ ...planned, steps: [] })).toMatch(/no steps/);
  });
});

describe('buildPrompt', () => {
  it('has the plan, the answers, the folder rules and the step tool', () => {
    const p = buildPrompt(ticket, planned, ['Keep it small.']);
    expect(p).toContain('PROJ-7: Sort cameras by zone count');
    expect(p).toContain('R1. A Zones sort option (check: Unit test)');
    expect(p).toContain('1. Add the sort key [R1, R2]');
    expect(p).toContain('- Which list? Answer: The map list');
    expect(p).toContain('Keep it small.');
    expect(p).toMatch(/mcp__board__step/);
    expect(p).toMatch(/Do not commit/);
    expect(buildPrompt(ticket, planned, [], ['pnpm', 'git status'])).toContain(
      'Shell commands that you may run: pnpm; git status. Anything else is refused.'
    );
  });
});

describe('BUILD_SCHEMA and parseBuild', () => {
  it('is draft-07 and requires the steps, the gate and the summary', () => {
    expect(BUILD_SCHEMA.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(BUILD_SCHEMA.required).toEqual(['steps', 'gate', 'summary', 'followups']);
    expect(parseBuild(result)).toEqual(result);
    expect(() => parseBuild({ steps: 'x' })).toThrow(/unexpected shape/);
  });
});

describe('markStep', () => {
  it('marks one step current or done, and keeps the others', () => {
    const f = markStep(planned, 2, 'current');
    expect(f.steps?.map((s) => s.state)).toEqual(['todo', 'current']);
    expect(() => markStep(planned, 9, 'done')).toThrow(/no step 9/);
  });
});

describe('applyBuild', () => {
  it('moves a finished build with a clean gate to Testing, ready to test', () => {
    const f = applyBuild({ ...planned, stage: 'development' }, result);
    expect(f.stage).toBe('testing');
    expect(f.steps?.map((s) => s.state)).toEqual(['done', 'done']);
    expect(f.checks).toEqual([
      { name: 'Type check', ok: true },
      { name: 'Lint', ok: true },
      { name: 'Tests', ok: true }
    ]);
    expect(f.review).toBe('Added the Zones sort.');
    expect(f.need).toEqual({
      kind: 'decision',
      ask: 'Ready to test: 2 of 2 steps done, and the gate passed',
      actions: [
        { id: 'startTesting', label: 'Start testing' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    });
  });

  it('stays in Development with a problem when a step is not done or the gate fails', () => {
    const f = applyBuild(
      { ...planned, stage: 'development' },
      {
        ...result,
        steps: [
          result.steps[0]!,
          { n: 2, done: false, check: '', ok: null, note: 'Blocked by a type error' }
        ],
        gate: { ...result.gate, typecheck: { ok: false, note: '2 errors in menu.ts' } }
      }
    );
    expect(f.stage).toBe('development');
    expect(f.steps?.map((s) => s.state)).toEqual(['done', 'todo']);
    expect(f.checks?.[0]).toEqual({ name: 'Type check', ok: false, note: '2 errors in menu.ts' });
    expect(f.need).toEqual({
      kind: 'problem',
      ask: 'Step 2 is not done. The gate failed: type check.',
      detail: 'Blocked by a type error',
      actions: [
        { id: 'startDevelopment', label: 'Try again' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    });
  });
});

describe('an unfinished build', () => {
  const ok = { ok: true, note: '' };
  const partial: BuildResult = {
    steps: [
      { n: 1, done: true, check: 'vitest', ok: true, note: '' },
      {
        n: 2,
        done: false,
        check: 'browser',
        ok: true,
        note: 'The browser check needs a dev server.'
      }
    ],
    gate: { typecheck: ok, lint: ok, tests: ok },
    summary: 'Most of it.',
    followups: []
  };

  it('says which step is not done and why, and keeps the note on the step', () => {
    const f = applyBuild({ ...planned, stage: 'development' }, partial);
    expect(f.need?.ask).toBe('Step 2 is not done.');
    expect(f.need?.detail).toBe('The browser check needs a dev server.');
    expect(f.steps?.[1]).toMatchObject({
      state: 'todo',
      note: 'The browser check needs a dev server.'
    });
  });

  it('puts the notes of several open steps in the detail, one for each step', () => {
    const f = applyBuild(
      { ...planned, stage: 'development' },
      { ...partial, steps: [{ ...partial.steps[1]!, n: 1 }, partial.steps[1]!] }
    );
    expect(f.need?.ask).toBe('Steps 1 and 2 are not done.');
    expect(f.need?.detail).toBe(
      'Step 1: The browser check needs a dev server. Step 2: The browser check needs a dev server.'
    );
  });

  it('offers Move to Testing when the gate passed, first', () => {
    const f = applyBuild({ ...planned, stage: 'development' }, partial);
    expect(f.need?.actions.map((a) => a.id)).toEqual([
      'toTesting',
      'startDevelopment',
      'openWorktree'
    ]);
  });

  it('does not offer Move to Testing when the gate failed', () => {
    const f = applyBuild(
      { ...planned, stage: 'development' },
      { ...partial, gate: { ...partial.gate, tests: { ok: false, note: '2 failed' } } }
    );
    expect(f.need?.ask).toBe('Step 2 is not done. The gate failed: tests.');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['startDevelopment', 'openWorktree']);
  });

  it('moves to Testing on request, and leaves the open steps for the tester', () => {
    const f = acceptBuild(applyBuild({ ...planned, stage: 'development' }, partial));
    expect(f.stage).toBe('testing');
    expect(f.need?.ask).toBe('Ready to test: 1 of 2 steps done. Check step 2 in Testing.');
    expect(() =>
      acceptBuild({ ...planned, stage: 'development', checks: [{ name: 'Tests', ok: false }] })
    ).toThrow(/gate/);
  });
});

describe('applyBuild after a change', () => {
  it('keeps built steps done when the build reports only the new steps', () => {
    const f = {
      stage: 'development' as const,
      requirements: [{ id: 'R1', text: 'x', check: 'y' }],
      steps: [
        { n: 1, text: 'Built', covers: ['R1'], state: 'done' as const },
        { n: 2, text: 'New', covers: ['R1'], state: 'todo' as const }
      ]
    };
    const ok = { ok: true, note: '' };
    const out = applyBuild(f, {
      steps: [{ n: 2, done: true, check: 't', ok: true, note: '' }],
      gate: { typecheck: ok, lint: ok, tests: ok },
      summary: 's'
    } as never);
    expect(out.steps?.map((s) => s.state)).toEqual(['done', 'done']);
    expect(out.need?.ask).toMatch(/Ready to test: 2 of 2 steps done/);
  });
});

describe('the build prompt after a failed Testing', () => {
  it("gives the failed requirements with the tester's note, and nothing for passing ones", () => {
    const f: Flow = {
      stage: 'development',
      requirements: [
        { id: 'R1', text: 'Sorts', check: 'x' },
        { id: 'R6', text: 'Upgrade only when Ready', check: 'y' }
      ],
      evidence: {
        R1: { ok: true },
        R6: {
          ok: false,
          expected: 'Upgrade only when Ready.',
          found: 'Edge E (Update Failed) can upgrade.',
          note: 'The helper allows a retry.'
        }
      }
    };
    const p = buildPrompt(
      {
        key: 'PROJ-1',
        summary: 's',
        status: 'x',
        type: 'Story',
        priority: 'x',
        labels: [],
        points: null,
        updated: null
      },
      f,
      []
    );
    expect(p).toContain('# Requirements that failed in Testing');
    expect(p).toContain(
      "- R6: Upgrade only when Ready\n  Result: Expected: Upgrade only when Ready. Found: Edge E (Update Failed) can upgrade. Tester's note: The helper allows a retry."
    );
    expect(p.split('# Requirements that failed in Testing')[1]).not.toContain('- R1');
  });
});
