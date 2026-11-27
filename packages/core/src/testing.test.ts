import { describe, expect, it } from 'vitest';
import { acceptBuild, applyBuild } from './development';
import { shotGroups, shotSet } from './look';
import {
  applyTest,
  expandShots,
  markStaleShots,
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
    {
      id: 'R1',
      ok: true,
      test: 'pnpm vitest sort',
      shots: [],
      seen: '',
      data: 'none',
      expected: '',
      found: '',
      note: ''
    },
    {
      id: 'R2',
      ok: true,
      test: '',
      shots: ['/shots/PROJ-7/R2-light-1400x900.png'],
      seen: 'The list sorted by zones, highest first.',
      data: 'real',
      expected: '',
      found: '',
      note: ''
    }
  ],
  writes: [],
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
    expect(item?.required).toEqual([
      'id',
      'ok',
      'test',
      'shots',
      'seen',
      'data',
      'expected',
      'found',
      'note'
    ]);
    expect(() => parseTest({ requirements: [{ id: 'R1' }] })).toThrow(/unexpected shape/);
  });

  it('keeps the evidence, and asks for approval when every requirement passes', () => {
    const f = applyTest(built, parseTest(pass));
    expect(f.evidence?.R2).toEqual({
      ok: true,
      data: 'real',
      shots: ['/shots/PROJ-7/R2-light-1400x900.png'],
      seen: 'The list sorted by zones, highest first.'
    });
    expect(f.evidence?.R1).toEqual({ ok: true, data: 'none', test: 'pnpm vitest sort' });
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
        { id: 'startDevelopment', label: 'Fix and build again' },
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
        requirements: [
          {
            id: 'R2',
            ok: true,
            test: '',
            shots: ['R2-list'],
            seen: 'ok',
            data: 'real',
            expected: '',
            found: '',
            note: ''
          }
        ],
        writes: [],
        fixes: [],
        summary: 's'
      },
      { files, sizes }
    );
    expect(f.evidence?.R2?.shots).toHaveLength(6);
  });
});

describe('markStaleShots', () => {
  const f = {
    stage: 'testing' as const,
    requirements: [
      { id: 'R1', text: 'x', check: 'y' },
      { id: 'R2', text: 'x', check: 'y' }
    ],
    evidence: {
      R1: { ok: true, shots: ['/s/R1-a-light-1400x900.png'], seen: 'ok' },
      R2: { ok: true, shots: ['/s/R2-b-light-1400x900.png'], seen: 'ok' }
    }
  };
  const passing = {
    ...f,
    need: {
      kind: 'decision' as const,
      ask: 'Tested: 2 of 2 requirements pass, with evidence.',
      actions: [
        { id: 'approveTesting', label: 'Approve for code review' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    }
  };
  it('keeps every pass, says which shots are older and what changed, and still offers Approve first', () => {
    const out = markStaleShots(
      passing,
      { '/s/R1-a-light-1400x900.png': 100, '/s/R2-b-light-1400x900.png': 300 },
      { file: 'EdgeUpgradeButton.tsx', at: 200 }
    );
    expect(out.evidence).toBe(passing.evidence);
    expect(out.need?.kind).toBe('decision');
    expect(out.need?.detail).toBe(
      'The screenshots of R1 are older than the last change, in EdgeUpgradeButton.tsx. If that change can affect them, test again. Otherwise approve.'
    );
    expect(out.need?.actions.map((a) => a.id)).toEqual([
      'approveTesting',
      'startTesting',
      'openWorktree'
    ]);
  });
  it('leaves a ticket that has failing requirements alone: it already offers Test again', () => {
    const failing = { ...passing, need: { ...passing.need, kind: 'problem' as const } };
    expect(
      markStaleShots(failing, { '/s/R1-a-light-1400x900.png': 1 }, { file: 'x.ts', at: 9 })
    ).toBe(failing);
  });
  it('changes nothing when every shot is newer', () => {
    const out = markStaleShots(
      passing,
      { '/s/R1-a-light-1400x900.png': 300, '/s/R2-b-light-1400x900.png': 300 },
      { file: 'x.ts', at: 200 }
    );
    expect(out).toBe(passing);
  });
});

describe('what to do about a failing requirement', () => {
  const miss = { ...pass, requirements: [pass.requirements[0]!] };

  it('sends a requirement that was tested and failed back to the code, with Test again second', () => {
    const f = applyTest(built, {
      ...pass,
      requirements: [
        pass.requirements[0]!,
        { ...pass.requirements[1]!, ok: false, note: 'Upgrade is enabled for a Failed edge.' }
      ]
    });
    expect(f.need?.actions.map((a) => a.label)).toEqual([
      'Fix and build again',
      'Test again',
      'Open worktree'
    ]);
  });

  it('offers only a test run when a requirement has no evidence at all', () => {
    const f = applyTest(built, miss);
    expect(f.need?.actions.map((a) => a.label)).toEqual(['Test again', 'Open worktree']);
  });
});

describe('a failing requirement says what, in plain words', () => {
  const failing = {
    ...pass,
    requirements: [
      pass.requirements[0]!,
      {
        ...pass.requirements[1]!,
        ok: false,
        expected: 'Upgrade is enabled only when the edge state is Ready.',
        found: 'Edge E (state Update Failed) has an enabled Upgrade button.',
        note: 'The helper allows a retry.'
      }
    ]
  };

  it('keeps expected and found in the evidence, only for a failing requirement', () => {
    const f = applyTest(built, failing);
    expect(f.evidence?.R2).toMatchObject({
      expected: 'Upgrade is enabled only when the edge state is Ready.',
      found: 'Edge E (state Update Failed) has an enabled Upgrade button.'
    });
    expect(f.evidence?.R1).not.toHaveProperty('expected');
  });

  it('puts expected and found in the banner, not the code note', () => {
    const f = applyTest(built, failing);
    expect(f.need?.detail).toBe(
      'R2: Expected: Upgrade is enabled only when the edge state is Ready. Found: Edge E (state Update Failed) has an enabled Upgrade button.'
    );
  });

  it('asks the agent for plain words, with no function names', () => {
    const p = testPrompt(ticket, built, [], {
      url: 'http://localhost:3001',
      session: 's',
      shots: 'atb shots',
      mocked: false,
      commands: ['pnpm']
    });
    expect(p).toContain('`expected`');
    expect(p).toContain('`found`');
    expect(p).toContain('no function or file names');
  });
});

describe('where the evidence came from', () => {
  const withWrites: Flow = {
    ...built,
    writes: [
      { method: 'PUT', path: '/api/edges/:id/update-settings', why: 'R2' },
      { method: 'POST', path: '/api/edges/:id/upgrade-request', why: 'R2' }
    ]
  };
  const result = (data: 'real' | 'fake' | 'none', writes: TestResult['writes']): TestResult => ({
    ...pass,
    requirements: [
      { ...pass.requirements[0]!, data: 'none' },
      { ...pass.requirements[1]!, data }
    ],
    writes
  });

  it('keeps the data source of each requirement in the evidence', () => {
    const f = applyTest(withWrites, result('fake', []));
    expect(f.evidence?.R1?.data).toBe('none');
    expect(f.evidence?.R2?.data).toBe('fake');
  });

  it('records the result of each approved write', () => {
    const f = applyTest(
      withWrites,
      result('real', [
        { method: 'PUT', path: '/api/edges/:id/update-settings', made: true, result: '200 saved' },
        {
          method: 'POST',
          path: '/api/edges/:id/upgrade-request',
          made: false,
          result: 'No real edge exists.'
        }
      ])
    );
    expect(f.writeRuns).toEqual([
      { method: 'PUT', path: '/api/edges/:id/update-settings', made: true, result: '200 saved' },
      {
        method: 'POST',
        path: '/api/edges/:id/upgrade-request',
        made: false,
        result: 'No real edge exists.'
      }
    ]);
  });

  it('keeps the pass, and says in the decision which requirements used fake data and which writes were not made', () => {
    const f = applyTest(
      withWrites,
      result('fake', [
        { method: 'PUT', path: '/api/edges/:id/update-settings', made: false, result: 'Faked.' }
      ])
    );
    expect(f.need?.kind).toBe('decision');
    expect(f.need?.actions[0]?.id).toBe('approveTesting');
    expect(f.need?.detail).toBe(
      'Fake data: R2. Approved writes not made against the backend: PUT /api/edges/:id/update-settings, POST /api/edges/:id/upgrade-request.'
    );
  });

  it('adds no note when everything ran against the real backend', () => {
    const f = applyTest(
      withWrites,
      result('real', [
        { method: 'PUT', path: '/api/edges/:id/update-settings', made: true, result: '200' },
        { method: 'POST', path: '/api/edges/:id/upgrade-request', made: true, result: '200' }
      ])
    );
    expect(f.need?.detail).toBeUndefined();
  });

  it('asks for the data source and the write results in the prompt', () => {
    const p = testPrompt(ticket, withWrites, [], {
      url: 'http://localhost:3001',
      session: 's',
      shots: 'atb shots',
      mocked: false,
      commands: ['pnpm']
    });
    expect(p).toContain('Report each approved write in `writes`');
    expect(p).toContain('Never count a faked answer as made.');
    expect(p).toContain('Set `data` to fake');
  });
});
