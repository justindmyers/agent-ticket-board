import { describe, expect, it } from 'vitest';
import { acceptBuild, applyBuild } from './development';
import { shotGroups, shotSet } from './look';
import {
  applyTest,
  expandShots,
  approveTestingFlow,
  canTest,
  parseTest,
  TEST_SCHEMA,
  testPrompt,
  type TestResult
} from './testing';
import type { Flow, Ticket } from './types';

const ticket: Ticket = {
  key: 'PROJ-7',
  summary: 'Sort cameras by zone count',
  status: 'In Progress',
  type: 'Story',
  priority: 'Medium',
  labels: [],
  points: 3,
  updated: null
};

const built: Flow = {
  stage: 'testing',
  worktree: '/code/example-app-wt',
  requirements: [
    { id: 'R1', text: 'A Zones sort option', check: 'Unit test' },
    { id: 'R2', text: 'Descending by default', check: 'Click path: open the list, sort by zones' }
  ],
  steps: [
    { n: 1, text: 'Add the sort key', covers: ['R1'], state: 'done' },
    {
      n: 2,
      text: 'Check it in the browser',
      covers: ['R2'],
      state: 'todo',
      note: 'Needs a dev server.'
    }
  ]
};

const pass: TestResult = {
  requirements: [
    { id: 'R1', ok: true, test: 'pnpm vitest sort', shots: [], seen: '', note: '' },
    {
      id: 'R2',
      ok: true,
      test: '',
      shots: ['/shots/PROJ-7/R2-light-1400x900.png'],
      seen: 'The list sorted by zones, highest first.',
      note: ''
    }
  ],
  fixes: [],
  summary: 'Both pass.'
};

const env = {
  url: 'http://localhost:3002/',
  session: 'kb-PROJ-7',
  shots: '/bin/node /bin/atb.cjs shots PROJ-7',
  commands: ['pnpm exec playwright-cli', '/bin/node /bin/atb.cjs shots PROJ-7']
};

describe('the way into Testing', () => {
  it('offers Start testing after a clean build', () => {
    const ok = { ok: true, note: '' };
    const f = applyBuild(
      { ...built, stage: 'development', steps: [{ ...built.steps![0]! }] },
      {
        steps: [{ n: 1, done: true, check: 'vitest', ok: true, note: '' }],
        gate: { typecheck: ok, lint: ok, tests: ok },
        summary: '',
        followups: []
      }
    );
    expect(f.need?.actions[0]).toEqual({ id: 'startTesting', label: 'Start testing' });
  });

  it('offers Start testing after Move to Testing', () => {
    const f = acceptBuild({
      ...built,
      stage: 'development',
      checks: [{ name: 'Tests', ok: true }]
    });
    expect(f.need?.actions[0]).toEqual({ id: 'startTesting', label: 'Start testing' });
  });

  it('needs a worktree and requirements', () => {
    expect(canTest(built)).toBeNull();
    expect(canTest({ ...built, worktree: undefined })).toMatch(/worktree/);
    expect(canTest({ ...built, stage: 'planning' })).toMatch(/Testing/);
  });
});

describe('testPrompt', () => {
  it('gives the live app, the browser session, the shots command and the open steps', () => {
    const p = testPrompt(ticket, built, [], env);
    expect(p).toContain('http://localhost:3002/');
    expect(p).toContain('pnpm exec playwright-cli -s=kb-PROJ-7');
    expect(p).toContain('/bin/node /bin/atb.cjs shots PROJ-7 <name>');
    expect(p).toContain(
      'R2: Descending by default. Check: Click path: open the list, sort by zones'
    );
    expect(p).toContain(
      'Step 2 (Check it in the browser) was left for Testing: Needs a dev server.'
    );
    expect(p).toMatch(/View every screenshot/);
    expect(p).toMatch(
      /run-code files run in a sandbox: no require, import, URL, setTimeout or globalThis/
    );
    expect(p).toContain('--focus="<heading text or CSS selector>"');
    expect(p).toMatch(/check that each size shows that part/);
    expect(p).toMatch(/502 or a connection error.*reload and try again/s);
    expect(p).toContain('run-code --filename .playwright-cli/');
    expect(p).toMatch(/Do not commit/);
  });
});

describe('the test answer', () => {
  it('requires evidence fields for each requirement', () => {
    const item = TEST_SCHEMA.properties.requirements.items;
    expect(item?.required).toEqual(['id', 'ok', 'test', 'shots', 'seen', 'note']);
    expect(() => parseTest({ requirements: [{ id: 'R1' }] })).toThrow(/unexpected shape/);
  });

  it('keeps the evidence, and asks for approval when every requirement passes', () => {
    const f = applyTest(built, parseTest(pass));
    expect(f.evidence?.R2).toEqual({
      ok: true,
      shots: ['/shots/PROJ-7/R2-light-1400x900.png'],
      seen: 'The list sorted by zones, highest first.'
    });
    expect(f.evidence?.R1).toEqual({ ok: true, test: 'pnpm vitest sort' });
    expect(f.need).toEqual({
      kind: 'decision',
      ask: 'Tested: 2 of 2 requirements pass, with evidence.',
      actions: [
        { id: 'approveTesting', label: 'Approve for code review' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    });
  });

  it('names the requirements that fail, with the reasons in the detail', () => {
    const r = {
      ...pass,
      requirements: [
        pass.requirements[0]!,
        { ...pass.requirements[1]!, ok: false, note: 'Sorted ascending' }
      ]
    };
    const f = applyTest(built, r);
    expect(f.need).toMatchObject({
      kind: 'problem',
      ask: 'R2 does not pass.',
      detail: 'R2: Sorted ascending.',
      actions: [
        { id: 'startTesting', label: 'Test again' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    });
  });

  it('records the approval', () => {
    const f = approveTestingFlow(applyTest(built, parseTest(pass)), '2026-01-05T10:00:00Z');
    expect(f.approved).toBe('2026-01-05T10:00:00Z');
    expect(f.need?.ask).toBe('Approved for code review.');
  });
});

describe('screenshot sets', () => {
  const dir = '/home/t/PROJ-7/shots';
  const files = ['R2-list', 'R3-details'].flatMap((n) =>
    ['light', 'dark'].flatMap((s) =>
      ['390x844', '1400x900', '3440x1440'].map((z) => `${dir}/${n}-${s}-${z}.png`)
    )
  );
  const sizes = ['1400x900', '3440x1440', '390x844'];

  it('reads the set name from a name or from any of its files', () => {
    expect(shotSet('R2-list')).toBe('R2-list');
    expect(shotSet('/x/R2-list-dark-390x844.png')).toBe('R2-list');
  });
  it('attaches every file of each set that the agent names: sizes in the config order, light then dark', () => {
    expect(expandShots(['R2-list'], files, sizes).map((p) => p.split('/').pop())).toEqual([
      'R2-list-light-1400x900.png',
      'R2-list-dark-1400x900.png',
      'R2-list-light-3440x1440.png',
      'R2-list-dark-3440x1440.png',
      'R2-list-light-390x844.png',
      'R2-list-dark-390x844.png'
    ]);
  });
  it('takes a set once, also when the agent gives two of its files, and keeps a path it cannot match', () => {
    const got = expandShots(
      ['/a/R2-list-light-1400x900.png', 'R2-list-dark-390x844.png', '/b/other.png'],
      files,
      sizes
    );
    expect(got).toHaveLength(7);
    expect(got.at(-1)).toBe('/b/other.png');
  });
  it('groups the shots of a requirement by set, for the clients', () => {
    expect(
      shotGroups(expandShots(['R2-list', 'R3-details'], files, sizes)).map((g) => [
        g.set,
        g.shots.length
      ])
    ).toEqual([
      ['R2-list', 6],
      ['R3-details', 6]
    ]);
  });
  it('applies the sets of each requirement', () => {
    const f = applyTest(
      { stage: 'testing', requirements: [{ id: 'R2', text: 'x', check: 'y' }] },
      {
        requirements: [{ id: 'R2', ok: true, test: '', shots: ['R2-list'], seen: 'ok', note: '' }],
        fixes: [],
        summary: 's'
      },
      { files, sizes }
    );
    expect(f.evidence?.R2?.shots).toHaveLength(6);
  });
});
