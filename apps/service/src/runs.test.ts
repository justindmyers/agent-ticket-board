import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  // A temporary home, set before core computes its paths: the tests never touch real records.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync: mk } = require('node:fs') as typeof import('node:fs');
  process.env.ATB_HOME = mk(`${process.env.TMPDIR ?? '/tmp'}/atb-runs-`);
});

import {
  CONFIG,
  FLOWS,
  loadFlow,
  readTimeline,
  saveFlow,
  type Ticket
} from '@agent-ticket-board/core';
import { Processes } from './processes';
import {
  answers,
  BUILD_ALLOWED,
  PLAN_ALLOWED,
  PLAN_TOOLS,
  Runs,
  toolPath,
  type QueryFn
} from './runs';

const ticket = (key: string): Ticket => ({
  key,
  summary: 'Example',
  status: 'To Do',
  type: 'Story',
  priority: 'Medium',
  labels: [],
  points: null,
  updated: null
});

const plan = {
  assumptions: [],
  requirements: [{ id: 'R1', text: 'Works', check: 'A test' }],
  questions: [],
  steps: [{ text: 'Do it', covers: ['R1'] }],
  writes: []
};

const init = { type: 'system', subtype: 'init', session_id: 'sess-1' } as SDKMessage;
const success = (structured: unknown) =>
  ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    structured_output: structured,
    total_cost_usd: 0.12
  }) as SDKMessage;

/** A fake SDK query that yields the given messages, after `gate` resolves. */
function fakeQuery(messages: SDKMessage[], gate: Promise<void> = Promise.resolve()) {
  const calls: Parameters<QueryFn>[0][] = [];
  const query: QueryFn = (args) => {
    calls.push(args);
    return (async function* () {
      await gate;
      if (args.options?.abortController?.signal.aborted) {
        return;
      }
      yield* messages;
    })();
  };
  return { query, calls };
}

function runs(query: QueryFn, extra: Partial<ConstructorParameters<typeof Runs>[0]> = {}) {
  const changed: string[] = [];
  const r = new Runs({
    query,
    processes: new Processes(join(mkdtempSync(join(tmpdir(), 'atb-p-')), 'processes.json')),
    claude: '/usr/local/bin/claude',
    plugin: '/plugin',
    repo: () => '/code/example-app',
    ticket: async (k) => ticket(k),
    comments: async () => ['Keep it small.'],
    changed: (k) => changed.push(k),
    now: () => '2026-01-01T00:00:00Z',
    notify: () => undefined,
    planBase: async () => '/copies/main',
    ...extra
  });
  return { r, changed };
}

const idle = (r: Runs, timeout = 1000) =>
  vi.waitFor(() => expect(r.list()).toEqual([]), { timeout });

describe('Runs.plan', () => {
  it('runs a read-only, isolated session and writes the plan for approval', async () => {
    const { query, calls } = fakeQuery([init, success(plan)]);
    const { r, changed } = runs(query);
    await r.plan('PROJ-1');
    await idle(r);

    const o = calls[0]!.options!;
    expect(o).toMatchObject({
      cwd: '/copies/main',
      model: 'sonnet',
      tools: PLAN_TOOLS,
      allowedTools: PLAN_ALLOWED,
      permissionMode: 'dontAsk',
      settingSources: ['project', 'local'],
      strictMcpConfig: true,
      plugins: [{ type: 'local', path: '/plugin' }],
      pathToClaudeCodeExecutable: '/usr/local/bin/claude'
    });
    expect(calls[0]!.prompt).toContain('Keep it small.');
    // Planning may look up pull requests and tickets, but has no plain Bash and no edits.
    expect(o.allowedTools).toEqual(
      expect.arrayContaining(['Bash(gh pr view:*)', 'Bash(acli jira workitem view:*)'])
    );
    expect(o.allowedTools).not.toContain('Bash');
    expect(o.allowedTools).not.toEqual(expect.arrayContaining(['Edit']));
    expect(o.env?.PATH?.split(':')).toContain('/opt/homebrew/bin');
    expect(calls[0]!.prompt).toMatch(/gh pr diff/);

    const f = await loadFlow('PROJ-1');
    expect(f?.run).toMatchObject({ state: 'done', session: 'sess-1', cost: 0.12 });
    expect(f?.requirements).toHaveLength(1);
    expect(f?.need?.actions[0]?.id).toBe('approve');
    expect(changed.length).toBeGreaterThanOrEqual(3);

    // The audit log: the timeline, and the run's folder with what the agent got and gave.
    const types = (await readTimeline('PROJ-1')).map((e) => e.type);
    expect(types.filter((x) => x.startsWith('run.'))).toEqual([
      'run.queued',
      'run.started',
      'run.done'
    ]);
    expect(types).toContain('record');
    const runDir = join(process.env.ATB_HOME!, 'tickets', 'PROJ-1', 'runs', f!.run!.id!);
    expect(readFileSync(join(runDir, 'prompt.md'), 'utf8')).toContain('Keep it small.');
    expect(JSON.parse(readFileSync(join(runDir, 'options.json'), 'utf8'))).toMatchObject({
      model: 'sonnet',
      settingSources: ['project', 'local']
    });
    expect(readFileSync(join(runDir, 'messages.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(runDir, 'output.json'), 'utf8'))).toEqual(plan);
    expect(JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8'))).toMatchObject({
      cost: 0.12
    });
  });

  it('gives the answers to earlier questions to the re-plan', async () => {
    await saveFlow('PROJ-7', {
      stage: 'planning',
      questions: [{ q: 'Which list?', a: 'The map list' }]
    });
    const { query, calls } = fakeQuery([init, success(plan)]);
    const { r } = runs(query);
    await r.plan('PROJ-7');
    await idle(r);
    expect(calls[0]!.prompt).toContain('- Which list? Answer: The map list');
    // A re-plan after answers cannot ask again: its schema has no questions field.
    const schema = calls[0]!.options!.outputFormat!.schema as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.questions).toBeUndefined();
    expect((await loadFlow('PROJ-7'))?.questions).toEqual([]);
  });

  it('records a failed run as a problem with Try again', async () => {
    const { query } = fakeQuery([
      init,
      {
        type: 'result',
        subtype: 'error_max_budget_usd',
        is_error: true,
        total_cost_usd: 2
      } as SDKMessage
    ]);
    const { r } = runs(query);
    await r.plan('PROJ-2');
    await idle(r);
    const f = await loadFlow('PROJ-2');
    expect(f?.run).toMatchObject({ state: 'failed', cost: 2 });
    expect(f?.need).toEqual({
      kind: 'problem',
      ask: 'The planning run stopped: it reached the cost limit.',
      actions: [{ id: 'startPlanning', label: 'Try again' }]
    });
    const failed = (await readTimeline('PROJ-2')).find((e) => e.type === 'run.failed');
    expect(failed).toMatchObject({
      source: 'service',
      error: expect.stringContaining('cost limit'),
      cost: 2
    });
  });

  it('logs an unexpected plan shape with the raw output, so it can be audited', async () => {
    const { query } = fakeQuery([init, success({ ...plan, questions: ['plain text'] })]);
    const { r } = runs(query);
    await r.plan('PROJ-8');
    await idle(r);
    const f = await loadFlow('PROJ-8');
    expect(f?.run?.state).toBe('failed');
    const runDir = join(process.env.ATB_HOME!, 'tickets', 'PROJ-8', 'runs', f!.run!.id!);
    expect(JSON.parse(readFileSync(join(runDir, 'output.json'), 'utf8')).questions).toEqual([
      'plain text'
    ]);
    const failed = (await readTimeline('PROJ-8')).find((e) => e.type === 'run.failed');
    expect(failed?.error).toMatch(/unexpected shape/);
    expect(failed?.stack).toBeDefined();
  });

  it('queues a run when every slot is busy, and Stop removes it from the queue', async () => {
    let open!: () => void;
    const { query, calls } = fakeQuery([init, success(plan)], new Promise((r) => (open = r)));
    const { r } = runs(query, { slots: 1 });
    await r.plan('PROJ-3');
    await r.plan('PROJ-4');
    await vi.waitFor(() => expect(FLOWS['PROJ-3']?.run?.state).toBe('running'));
    expect(FLOWS['PROJ-4']?.run?.state).toBe('queued');

    expect(await r.stop('PROJ-4')).toBe(true);
    open();
    await idle(r);
    expect(calls).toHaveLength(1);
    expect(FLOWS['PROJ-4']?.run?.state).toBe('stopped');
    expect(FLOWS['PROJ-3']?.run?.state).toBe('done');
  });

  it('refuses a second run for the same ticket, and a run with no repository folder', async () => {
    let open!: () => void;
    const { query } = fakeQuery([init, success(plan)], new Promise((r) => (open = r)));
    const { r } = runs(query);
    await r.plan('PROJ-5');
    await expect(r.plan('PROJ-5')).rejects.toThrow(/active already/);
    open();
    await idle(r);
    await expect(runs(query, { repo: () => null }).r.plan('PROJ-6')).rejects.toThrow(
      /repository folder/
    );
  });
});

describe('Runs and the project memory', () => {
  it('gives every agent run the memory index of the main checkout, and lets it read the notes', async () => {
    const home = mkdtempSync(join(tmpdir(), 'atb-claude-'));
    const dir = join(home, 'projects', '-code-example-app', 'memory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'MEMORY.md'),
      '# Memory Index\n- [Mocks](feedback_mocks.md) — reuse mock.js'
    );
    await saveFlow('PROJ-61', { stage: 'planning' });
    const plan = {
      requirements: [{ id: 'R1', text: 'x', check: 'y' }],
      questions: [],
      assumptions: [],
      steps: [{ text: 'a', covers: ['R1'] }],
      writes: []
    };
    const { query, calls: q } = fakeQuery([init, success(plan)]);
    const { r } = runs(query, { claudeHome: home });
    await r.plan('PROJ-61');
    await idle(r);
    expect(q[0]!.prompt).toContain('- [Mocks](feedback_mocks.md) — reuse mock.js');
    expect(q[0]!.options!.additionalDirectories).toEqual([dir]);
  });
});

describe('Runs.plan without a worktree', () => {
  it("reads a fresh copy of the remote's main branch, not the developer's checkout", async () => {
    await saveFlow('PROJ-62', { stage: 'planning' });
    const { query, calls: q } = fakeQuery([init, success(plan)]);
    const { r } = runs(query);
    await r.plan('PROJ-62');
    await idle(r);
    expect(q[0]!.options!.cwd).toBe('/copies/main');
  });
  it('falls back to the checkout when the copy fails, and logs why', async () => {
    await saveFlow('PROJ-63', { stage: 'planning' });
    const { query, calls: q } = fakeQuery([init, success(plan)]);
    const { r } = runs(query, {
      planBase: async () => {
        throw new Error('git fetch: offline');
      }
    });
    await r.plan('PROJ-63');
    await idle(r);
    expect(q[0]!.options!.cwd).toBe('/code/example-app');
    expect(
      (await readTimeline('PROJ-63')).find((e) => e.type === 'plan.base.failed')
    ).toMatchObject({
      error: 'git fetch: offline'
    });
  });
});

describe('Runs.plan in a worktree', () => {
  it('plans a change in the ticket worktree, where the built code is', async () => {
    const wt = mkdtempSync(join(tmpdir(), 'atb-wt-'));
    await saveFlow('PROJ-60', {
      stage: 'planning',
      worktree: wt,
      changes: [{ text: 'Stricter', at: 'now' }],
      requirements: [{ id: 'R1', text: 'x', check: 'y' }],
      steps: [{ n: 1, text: 'Built', covers: ['R1'], state: 'done' }]
    });
    const plan = {
      requirements: [{ id: 'R1', text: 'x', check: 'y' }],
      assumptions: [],
      steps: [{ text: 'New', covers: ['R1'] }],
      writes: []
    };
    const { query, calls: q } = fakeQuery([init, success(plan)]);
    const { r } = runs(query);
    await r.plan('PROJ-60');
    await idle(r);
    expect(q[0]!.options!.cwd).toBe(wt);
    expect((await loadFlow('PROJ-60'))?.steps?.map((s) => s.state)).toEqual(['done', 'todo']);
  });
});

describe('Runs.develop', () => {
  const approved = {
    stage: 'planning' as const,
    requirements: [{ id: 'R1', text: 'Works', check: 'A test' }],
    questions: [],
    steps: [
      { n: 1, text: 'Do it', covers: ['R1'], state: 'todo' as const },
      { n: 2, text: 'Test it', covers: ['R1'], state: 'todo' as const }
    ],
    need: {
      kind: 'decision' as const,
      ask: 'Approve',
      actions: [{ id: 'approve', label: 'Approve plan and start' }]
    }
  };
  const ok = { ok: true, note: '' };
  const built = {
    steps: [
      { n: 1, done: true, check: 'pnpm vitest a', ok: true, note: '' },
      { n: 2, done: true, check: 'pnpm vitest b', ok: true, note: '' }
    ],
    gate: { typecheck: ok, lint: ok, tests: ok },
    summary: 'Done.',
    followups: []
  };
  const worktree = vi.fn(async (a: { branch: string; log: (c: string) => void }) => {
    a.log('Worktree ready\n');
    return { path: '/code/example-app-wt', branch: a.branch, made: true };
  });

  it('refuses a plan with open questions, and says why', async () => {
    await saveFlow('PROJ-20', { ...approved, questions: [{ q: 'Open?' }] });
    const { r } = runs(fakeQuery([]).query, { worktree });
    await expect(r.develop('PROJ-20')).rejects.toThrow(/1 open question/);
  });

  it('builds in the worktree with the build tools, then moves a clean result to Testing', async () => {
    await saveFlow('PROJ-21', approved);
    const { query, calls } = fakeQuery([init, success(built)]);
    const { r } = runs(query, { worktree });
    await r.develop('PROJ-21');
    await idle(r);

    expect(worktree).toHaveBeenCalledWith(
      expect.objectContaining({ repo: '/code/example-app', branch: 'feature/PROJ-21-example' })
    );
    const o = calls[0]!.options!;
    expect(o).toMatchObject({
      cwd: '/code/example-app-wt',
      model: 'opus',
      maxBudgetUsd: 8,
      tools: expect.arrayContaining(['Edit', 'Write', 'Bash']),
      allowedTools: BUILD_ALLOWED,
      permissionMode: 'dontAsk',
      settingSources: ['project', 'local'],
      strictMcpConfig: true
    });
    expect(Object.keys(o.mcpServers ?? {})).toEqual(['board']);
    expect(o.allowedTools).not.toContain('Bash');
    expect(calls[0]!.prompt).toMatch(/Do not commit/);

    const f = await loadFlow('PROJ-21');
    expect(f).toMatchObject({
      stage: 'testing',
      branch: 'feature/PROJ-21-example',
      worktree: '/code/example-app-wt'
    });
    expect(f?.need?.ask).toBe('Ready to test: 2 of 2 steps done, and the gate passed');
    const types = (await readTimeline('PROJ-21')).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['run.queued', 'worktree.wait', 'worktree.ready', 'run.done'])
    );
    const runDir = join(process.env.ATB_HOME!, 'tickets', 'PROJ-21', 'runs', f!.run!.id!);
    expect(readFileSync(join(runDir, 'worktree.log'), 'utf8')).toBe('Worktree ready\n');
  });

  it('records the step that the agent reports, live', async () => {
    await saveFlow('PROJ-22', { ...approved, stage: 'development' });
    FLOWS['PROJ-22'] = (await loadFlow('PROJ-22'))!;
    const { r } = runs(fakeQuery([]).query);
    await r.reportStep('PROJ-22', 2, 'current');
    expect((await loadFlow('PROJ-22'))?.steps?.map((s) => s.state)).toEqual(['todo', 'current']);
    expect((await readTimeline('PROJ-22')).find((e) => e.type === 'step')).toMatchObject({
      source: 'agent',
      n: 2
    });
  });

  it('logs the commands that the allowlist refused', async () => {
    await saveFlow('PROJ-23', approved);
    const refused = {
      ...(success(built) as unknown as object),
      permission_denials: [
        { tool_name: 'Bash', tool_use_id: 'x', tool_input: { command: 'rm -rf dist' } }
      ]
    } as unknown as SDKMessage;
    const { r } = runs(fakeQuery([init, refused]).query, { worktree });
    await r.develop('PROJ-23');
    await idle(r);
    const ev = (await readTimeline('PROJ-23')).find((e) => e.type === 'tools.refused');
    expect(ev?.tools).toEqual([{ tool: 'Bash', input: { command: 'rm -rf dist' } }]);
  });
});

describe('toolPath', () => {
  it('adds the tool folders once, after the existing PATH', () => {
    expect(toolPath('/x:/opt/homebrew/bin')).toBe(
      '/x:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
    );
  });
});

describe('Runs.test', () => {
  const tested = {
    requirements: [
      {
        id: 'R1',
        ok: true,
        test: '',
        shots: ['/shots/R1-light.png'],
        seen: 'The list works.',
        note: ''
      }
    ],
    fixes: [],
    summary: 'R1 passes.'
  };

  /** A fake test browser: records each call, and is logged in unless told otherwise. */
  function fakeBrowser(o: { open?: boolean; loggedIn?: boolean[] } = {}) {
    const calls: string[] = [];
    let open = o.open ?? false;
    const logins = [...(o.loggedIn ?? [true])];
    const browser = (key: string) => ({
      isOpen: async () => open,
      open: async (
        url: string,
        keep: number[],
        writes: { method: string; path: string }[] = []
      ) => {
        calls.push(
          `open ${key} ${url} keep=${keep.join(',')}${writes.length ? ` writes=${writes.map((w) => `${w.method} ${w.path}`).join(',')}` : ''}`
        );
        open = true;
      },
      goto: async (url: string) => void calls.push(`goto ${key} ${url}`),
      runCode: async (file: string) => void calls.push(`run-code ${key} ${file}`),
      routes: async (url: string, _keep: number[], writes: { method: string; path: string }[]) =>
        void calls.push(
          `routes ${key} ${url} writes=${writes.map((w) => `${w.method} ${w.path}`).join(',')}`
        ),
      saveLogin: async () => void calls.push(`save-login ${key}`),
      waitLogin: async (url: string, _owner: number, seconds: number) => {
        calls.push(`wait-login ${key} ${url} ${seconds}`);
        return logins.length > 1 ? logins.shift()! : logins[0]!;
      },
      close: async () => {
        calls.push(`close ${key}`);
        open = false;
      }
    });
    return { calls, browser, reopen: () => (open = true) };
  }

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), 'atb-test-'));
    CONFIG.app = {
      ...CONFIG.app,
      // A tiny live app: answers on the leased port until the run stops it.
      devCommand: `node -e "require('http').createServer((q, r) => r.end('ok')).listen({port})"`,
      buildPorts: [43101, 43110],
      ownerPort: 43101,
      loginCheck: null
    };
    return { dir };
  }

  const req = [{ id: 'R1', text: 'Works', check: 'Click path' }];

  it('starts the app on a free build port, opens the browser, tests, then stops the app', async () => {
    const { dir } = setup();
    await saveFlow('PROJ-30', { stage: 'testing', worktree: dir, requirements: req });
    const goto = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command:
                'pnpm exec playwright-cli -s=atb-PROJ-30 goto http://localhost:43102/settings'
            }
          }
        ]
      }
    } as unknown as SDKMessage;
    const { query, calls: q } = fakeQuery([init, goto, success(tested)]);
    const b = fakeBrowser();
    const { r } = runs(query, { browser: b.browser, shotsCommand: '/bin/node /bin/atb.cjs shots' });
    await r.test('PROJ-30');
    await idle(r, 15_000);

    const o = q[0]!.options!;
    expect(o.cwd).toBe(dir);
    expect(o.model).toBe('sonnet');
    // The exact screenshot command of the prompt is allowed: a refused shots call loses the screenshot set.
    expect(o.allowedTools).toEqual(
      expect.arrayContaining([
        'Bash(pnpm exec playwright-cli:*)',
        'Bash(/bin/node /bin/atb.cjs shots:*)'
      ])
    );
    expect(q[0]!.prompt).toContain('http://localhost:43102/');
    expect(q[0]!.prompt).toContain('pnpm exec playwright-cli -s=atb-PROJ-30');
    expect(q[0]!.prompt).toContain('/bin/node /bin/atb.cjs shots PROJ-30 <name>');
    expect(q[0]!.prompt).toMatch(/Also search \S+app\.log for SyntaxError/);
    expect(b.calls).toEqual([
      'open PROJ-30 http://localhost:43102/ keep=43101',
      'wait-login PROJ-30 http://localhost:43102/ 5',
      'save-login PROJ-30'
    ]);
    const f = await loadFlow('PROJ-30');
    expect(f?.evidence?.R1?.ok).toBe(true);
    expect(f?.need?.actions[0]?.id).toBe('approveTesting');
    expect(f?.spent).toBeCloseTo(0.12);
    expect(f?.run?.waiting).toBeUndefined();
    expect(await answers('localhost:43102')).toBe(false);
    const records = JSON.stringify(
      (await readTimeline('PROJ-30')).filter((e) => e.type === 'record')
    );
    expect(records).toContain('Opening /settings');
    const types = (await readTimeline('PROJ-30')).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'app.ready',
        'browser.opened',
        'browser.login.done',
        'app.stopped',
        'run.done'
      ])
    );
  });

  it('loads the fake API of earlier test runs, and tells the agent to extend it', async () => {
    const { dir } = setup();
    mkdirSync(join(dir, '.playwright-cli'), { recursive: true });
    writeFileSync(join(dir, '.playwright-cli', 'mock.js'), 'async (page) => {}');
    await saveFlow('PROJ-38', { stage: 'testing', worktree: dir, requirements: req });
    const { query, calls: q } = fakeQuery([init, success(tested)]);
    const b = fakeBrowser();
    const { r } = runs(query, { browser: b.browser });
    await r.test('PROJ-38');
    await idle(r, 15_000);
    expect(b.calls).toContain(`run-code PROJ-38 ${join(dir, '.playwright-cli', 'mock.js')}`);
    expect(q[0]!.prompt).toMatch(/fake API from earlier test runs is loaded/);
  });

  it('gives the browser the writes that moving to Testing approved', async () => {
    const { dir } = setup();
    await saveFlow('PROJ-39', {
      stage: 'testing',
      worktree: dir,
      requirements: req,
      writes: [{ method: 'PUT', path: '/api/edges/:id/update-settings', why: 'R1' }]
    });
    const b = fakeBrowser();
    const { r } = runs(fakeQuery([init, success(tested)]).query, { browser: b.browser });
    await r.test('PROJ-39');
    await idle(r, 15_000);
    expect(b.calls[0]).toBe(
      'open PROJ-39 http://localhost:43102/ keep=43101 writes=PUT /api/edges/:id/update-settings'
    );
  });

  it('runs one test run at a time: the next waits for the app and browser of the first', async () => {
    const { dir } = setup();
    const dir2 = mkdtempSync(join(tmpdir(), 'atb-test-'));
    await saveFlow('PROJ-40', { stage: 'testing', worktree: dir, requirements: req });
    await saveFlow('PROJ-41', { stage: 'testing', worktree: dir2, requirements: req });
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const b = fakeBrowser();
    let first = true;
    const query = ((args: Parameters<QueryFn>[0]) => {
      const gated = first;
      first = false;
      return fakeQuery([init, success(tested)], gated ? gate : undefined).query(args);
    }) as QueryFn;
    const { r } = runs(query, { browser: b.browser });
    await r.test('PROJ-40');
    await r.test('PROJ-41');
    await vi.waitFor(
      () => expect(b.calls.some((c) => c.startsWith('save-login PROJ-40'))).toBe(true),
      {
        timeout: 15_000
      }
    );
    await new Promise((res) => setTimeout(res, 500));
    expect(b.calls.some((c) => c.includes('PROJ-41'))).toBe(false);
    release();
    await idle(r, 20_000);
    const firstDone = b.calls.indexOf('save-login PROJ-40');
    const secondStart = b.calls.findIndex((c) => c.includes('PROJ-41'));
    expect(secondStart).toBeGreaterThan(firstDone);
    expect(b.calls).toContain('save-login PROJ-41');
  });

  it('notifies and waits when the browser is not logged in', async () => {
    const { dir } = setup();
    await saveFlow('PROJ-36', { stage: 'testing', worktree: dir, requirements: req });
    const notified: string[] = [];
    const b = fakeBrowser({ loggedIn: [false, true] });
    const { r } = runs(fakeQuery([init, success(tested)]).query, {
      browser: b.browser,
      notify: (m) => notified.push(m)
    });
    await r.test('PROJ-36');
    await idle(r, 15_000);
    expect(b.calls.filter((c) => c.startsWith('wait-login'))).toEqual([
      'wait-login PROJ-36 http://localhost:43102/ 5',
      'wait-login PROJ-36 http://localhost:43102/ 600'
    ]);
    expect(notified).toEqual(['PROJ-36: log in to the browser window to test.']);
    expect((await readTimeline('PROJ-36')).map((e) => e.type)).toContain('browser.login.wait');
  });

  it('skips a build port that another app holds on localhost, and tests its own app', async () => {
    const { dir } = setup();
    // Other worktrees' dev servers on the first build ports: vite binds [::1] only, others 127.0.0.1.
    const other = createServer((_q, res) => res.end('other')).listen(43102, '::1');
    const other4 = createServer((_q, res) => res.end('other')).listen(43103, '127.0.0.1');
    await Promise.all([other, other4].map((s) => new Promise((res) => s.once('listening', res))));
    try {
      await saveFlow('PROJ-32', { stage: 'testing', worktree: dir, requirements: req });
      const { query, calls: q } = fakeQuery([init, success(tested)]);
      const b = fakeBrowser();
      const { r } = runs(query, { browser: b.browser });
      await r.test('PROJ-32');
      await idle(r, 15_000);
      expect(q[0]!.prompt).toContain('http://localhost:43104/');
      expect(b.calls[0]).toBe('open PROJ-32 http://localhost:43104/ keep=43101');
    } finally {
      other.close();
      other4.close();
    }
  });

  it('fails when the dev command does not listen on the leased port, and tests nothing', async () => {
    const { dir } = setup();
    // The command ignores {port}: whatever answers there is not this ticket's app.
    CONFIG.app.devCommand = `node -e "require('http').createServer((q, r) => r.end('ok')).listen(43150)"`;
    await saveFlow('PROJ-33', { stage: 'testing', worktree: dir, requirements: req });
    const { query, calls: q } = fakeQuery([init, success(tested)]);
    const b = fakeBrowser();
    const { r } = runs(query, { appTimeoutMs: 3000, browser: b.browser });
    await r.test('PROJ-33');
    await idle(r, 15_000);
    expect(q).toHaveLength(0);
    expect(b.calls).toEqual([]);
    expect((await loadFlow('PROJ-33'))?.need?.ask).toMatch(/did not start on port 43102/);
  });

  it('keeps the browser for the next test run, on the same port', async () => {
    const { dir } = setup();
    await saveFlow('PROJ-34', { stage: 'testing', worktree: dir, requirements: req });
    const b = fakeBrowser();
    const { r } = runs(fakeQuery([init, success(tested)]).query, { browser: b.browser });
    await r.test('PROJ-34');
    await idle(r, 15_000);
    await saveFlow('PROJ-34', { ...(await loadFlow('PROJ-34'))!, need: undefined });
    await r.test('PROJ-34');
    await idle(r, 15_000);
    expect(b.calls).toEqual([
      'open PROJ-34 http://localhost:43102/ keep=43101',
      'wait-login PROJ-34 http://localhost:43102/ 5',
      'save-login PROJ-34',
      'routes PROJ-34 http://localhost:43102/ writes=',
      'goto PROJ-34 http://localhost:43102/',
      'wait-login PROJ-34 http://localhost:43102/ 5',
      'save-login PROJ-34'
    ]);
    expect((await loadFlow('PROJ-34'))?.testPort).toBe(43102);
  });

  it('closes the browser on Stop', async () => {
    const { dir } = setup();
    await saveFlow('PROJ-37', { stage: 'testing', worktree: dir, requirements: req });
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const b = fakeBrowser();
    const { r } = runs(fakeQuery([init, success(tested)], gate).query, { browser: b.browser });
    await r.test('PROJ-37');
    await vi.waitFor(() => expect(b.calls.some((c) => c.startsWith('wait-login'))).toBe(true), {
      timeout: 15_000
    });
    await r.stop('PROJ-37');
    release();
    await idle(r, 15_000);
    expect(b.calls.at(-1)).toBe('close PROJ-37');
  });

  it('counts the cost of a session once, also when it returns two results', async () => {
    const { dir } = setup();
    await saveFlow('PROJ-35', { stage: 'testing', worktree: dir, requirements: req, spent: 1 });
    const second = { ...(success(tested) as object), total_cost_usd: 0.2 } as unknown as SDKMessage;
    const b = fakeBrowser();
    const { r } = runs(fakeQuery([init, success(tested), second]).query, { browser: b.browser });
    await r.test('PROJ-35');
    await idle(r, 15_000);
    expect((await loadFlow('PROJ-35'))?.spent).toBeCloseTo(1.2);
  });

  it('says what to start when the login service does not answer, and starts nothing', async () => {
    const { dir } = setup();
    CONFIG.app.loginCheck = 'localhost:43199';
    await saveFlow('PROJ-31', { stage: 'testing', worktree: dir, requirements: req });
    const b = fakeBrowser();
    const { r } = runs(fakeQuery([]).query, { browser: b.browser });
    await r.test('PROJ-31');
    await idle(r);
    const f = await loadFlow('PROJ-31');
    expect(f?.need?.ask).toBe(
      'The login service at localhost:43199 does not answer. Start it, then test again.'
    );
    expect(f?.need?.actions[0]?.id).toBe('startTesting');
    expect(b.calls).toEqual([]);
  });
});

describe('Runs.review', () => {
  const tested = (wt: string) => ({
    stage: 'testing' as const,
    worktree: wt,
    approved: '2026-01-01T00:00:00Z',
    requirements: [{ id: 'R1', text: 'Works', check: 'A test' }]
  });
  const reviewed = {
    findings: [
      {
        reviewer: 'correctness',
        file: 'a.ts',
        line: 3,
        problem: 'Unhandled empty list',
        fix: 'Guard it',
        severity: 'blocking',
        state: 'fixed',
        note: ''
      }
    ],
    checks: [{ name: 'check:types', ok: true, note: '' }],
    summary: 'One fix.'
  };

  it('refuses a change that the developer has not approved', async () => {
    await saveFlow('PROJ-60', { ...tested('/wt'), approved: undefined });
    const { r } = runs(fakeQuery([]).query);
    await expect(r.review('PROJ-60')).rejects.toThrow(/approve/);
  });

  it('reviews in the worktree with reviewers that cannot edit, then records the findings', async () => {
    const wt = mkdtempSync(join(tmpdir(), 'atb-wt-'));
    await saveFlow('PROJ-61', tested(wt));
    const { query, calls } = fakeQuery([init, success(reviewed)]);
    const { r } = runs(query);
    await r.review('PROJ-61');
    await idle(r);

    const o = calls[0]!.options!;
    expect(o).toMatchObject({
      cwd: wt,
      model: 'opus',
      permissionMode: 'dontAsk',
      settingSources: ['project', 'local'],
      strictMcpConfig: true
    });
    expect(Object.keys(o.agents ?? {})).toEqual(['correctness', 'code-style']);
    expect(o.allowedTools).toContain('Agent');

    const f = await loadFlow('PROJ-61');
    expect(f?.stage).toBe('code-review');
    expect(f?.codeReview?.findings[0]).toMatchObject({ id: 'F1', state: 'fixed' });
    expect(f?.need?.kind).toBe('decision');
    expect(f?.run).toMatchObject({ state: 'done', stage: 'code-review' });
  });

  it('does not count the checks that the agent reports: it plans the commits next', async () => {
    const wt = mkdtempSync(join(tmpdir(), 'atb-wt-'));
    await saveFlow('PROJ-62', tested(wt));
    const bad = { ...reviewed, checks: [{ name: 'eslint', ok: false, note: 'Not run' }] };
    const { r } = runs(fakeQuery([init, success(bad)]).query);
    await r.review('PROJ-62');
    await idle(r);
    const f = await loadFlow('PROJ-62');
    expect(f?.need?.kind).toBe('decision');
    expect(f?.need?.actions[0]?.id).toBe('startCommitPlan');
  });
});

describe('Runs.gate', () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  const reviewed = (worktree: string) => ({
    stage: 'code-review' as const,
    worktree,
    approved: '2026-01-01T00:00:00Z',
    codeReview: { at: 'now', summary: 'Done.', findings: [], checks: [] }
  });
  /** A worktree whose origin has the same main: nothing to merge. */
  const worktree = () => {
    const root = mkdtempSync(join(tmpdir(), 'atb-gate-'));
    git(root, 'init', '--bare', '-b', 'main', 'origin.git');
    git(root, 'clone', join(root, 'origin.git'), 'wt');
    const wt = join(root, 'wt');
    writeFileSync(join(wt, 'a.txt'), 'a\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'base');
    git(wt, 'push', 'origin', 'HEAD:main');
    return wt;
  };

  it('needs a finished review and checks in the config, and says which is missing', async () => {
    const { r } = runs(fakeQuery([]).query);
    await saveFlow('PROJ-70', { stage: 'testing', worktree: '/nope' });
    await expect(r.gate('PROJ-70')).rejects.toThrow(/after a build or a review/);
    await saveFlow('PROJ-71', reviewed(worktree()));
    CONFIG.repo.checks = [];
    await expect(r.gate('PROJ-71')).rejects.toThrow(/Settings/);
  });

  it('runs the configured checks in the worktree without an agent, and records the steps', async () => {
    CONFIG.repo.checks = ['echo ok > ran.txt'];
    const wt = worktree();
    await saveFlow('PROJ-72', reviewed(wt));
    const query = vi.fn();
    const { r } = runs(query as unknown as QueryFn);
    const run = await r.gate('PROJ-72');
    expect(run).toMatchObject({ task: 'gate', stage: 'code-review', state: 'running' });
    await vi.waitFor(async () => expect((await loadFlow('PROJ-72'))?.run?.state).toBe('done'), {
      timeout: 5000
    });
    const f = await loadFlow('PROJ-72');
    expect(query).not.toHaveBeenCalled();
    expect(f?.gate?.ok).toBe(true);
    expect(f?.gate?.steps.map((s) => s.name)).toEqual([
      'Clean worktree',
      'Fetch origin/main',
      'echo ok > ran.txt',
      'Merge origin/main'
    ]);
    expect(readFileSync(join(wt, 'ran.txt'), 'utf8')).toBe('ok\n');
    expect(f?.need?.kind).toBe('decision');
    CONFIG.repo.checks = [];
  });

  it('records a failing check as a problem with its output and a retry', async () => {
    CONFIG.repo.checks = ['echo broken >&2; exit 3'];
    await saveFlow('PROJ-73', reviewed(worktree()));
    const { r } = runs(fakeQuery([]).query);
    await r.gate('PROJ-73');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-73'))?.run?.state).toBe('failed'), {
      timeout: 5000
    });
    const f = await loadFlow('PROJ-73');
    expect(f?.need).toMatchObject({ kind: 'problem', detail: expect.stringContaining('broken') });
    expect(f?.need?.actions[0]?.id).toBe('startGate');
    CONFIG.repo.checks = [];
  });
});

describe('Runs.commitPlan and Runs.commit', () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  /** A repository with one commit and two changed files. */
  const repo = () => {
    const wt = mkdtempSync(join(tmpdir(), 'atb-commit-'));
    git(wt, 'init', '-b', 'main');
    writeFileSync(join(wt, 'base.txt'), 'base\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'base');
    writeFileSync(join(wt, 'a.ts'), 'a\n');
    writeFileSync(join(wt, 'a.test.ts'), 'a\n');
    return wt;
  };
  const reviewed = (worktree: string) => ({
    stage: 'code-review' as const,
    worktree,
    codeReview: { at: 'now', summary: 'Done.', findings: [], checks: [] }
  });
  const plan = {
    commits: [
      { type: 'feat', scope: 'edges', description: 'add a', files: ['a.ts'] },
      { type: 'test', scope: 'edges', description: 'cover a', files: ['a.test.ts'] }
    ],
    summary: 'Two topics.'
  };

  it('plans with a read-only agent that cannot stage or commit, and shows the plan', async () => {
    const wt = repo();
    await saveFlow('PROJ-80', reviewed(wt));
    const { query, calls } = fakeQuery([init, success(plan)]);
    const { r } = runs(query);
    await r.commitPlan('PROJ-80');
    await idle(r);
    const o = calls[0]!.options!;
    expect(o).toMatchObject({ cwd: wt, model: 'sonnet', maxBudgetUsd: 1 });
    expect(o.allowedTools?.some((t) => /git (add|commit|push)/.test(t))).toBe(false);
    expect(o.tools).not.toContain('Edit');
    expect(calls[0]!.prompt).toContain('- a.ts');
    const f = await loadFlow('PROJ-80');
    expect(f?.run).toMatchObject({ task: 'commit-plan', state: 'done', stage: 'code-review' });
    expect(f?.commits?.plan.map((c) => c.title)).toEqual([
      'feat(edges): add a (PROJ-80)',
      'test(edges): cover a (PROJ-80)'
    ]);
  });

  it('fails the run with a retry when the plan leaves a changed file out', async () => {
    const wt = repo();
    await saveFlow('PROJ-81', reviewed(wt));
    const half = { ...plan, commits: plan.commits.slice(0, 1) };
    const { r } = runs(fakeQuery([init, success(half)]).query);
    await r.commitPlan('PROJ-81');
    await idle(r);
    const f = await loadFlow('PROJ-81');
    expect(f?.need).toMatchObject({ kind: 'problem', ask: expect.stringContaining('a.test.ts') });
    expect(f?.need?.actions[0]?.id).toBe('startCommitPlan');
  });

  it('makes each planned commit in order, with the hooks, and offers the checks', async () => {
    const wt = repo();
    await saveFlow('PROJ-82', reviewed(wt));
    const { r } = runs(fakeQuery([init, success(plan)]).query);
    await r.commitPlan('PROJ-82');
    await idle(r);
    await r.commit('PROJ-82');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-82'))?.run?.task).toBe('commit'));
    await vi.waitFor(async () => expect((await loadFlow('PROJ-82'))?.run?.state).toBe('done'), {
      timeout: 8000
    });
    expect(git(wt, 'log', '--format=%s', '-3').trim().split('\n')).toEqual([
      'test(edges): cover a (PROJ-82)',
      'feat(edges): add a (PROJ-82)',
      'base'
    ]);
    expect(git(wt, 'status', '--porcelain')).toBe('');
    const f = await loadFlow('PROJ-82');
    expect(f?.commits?.done).toHaveLength(2);
    expect(f?.need?.actions[0]?.id).toBe('startGate');
  });

  it('stops at a commit that a hook refuses, keeps the commits made, and says which failed', async () => {
    const wt = repo();
    mkdirSync(join(wt, '.git', 'hooks'), { recursive: true });
    writeFileSync(
      join(wt, '.git', 'hooks', 'commit-msg'),
      '#!/bin/sh\ngrep -q "^test" "$1" && { echo "hook says no" >&2; exit 1; }\nexit 0\n',
      { mode: 0o755 }
    );
    await saveFlow('PROJ-83', reviewed(wt));
    const { r } = runs(fakeQuery([init, success(plan)]).query);
    await r.commitPlan('PROJ-83');
    await idle(r);
    await r.commit('PROJ-83');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-83'))?.run?.state).toBe('failed'), {
      timeout: 8000
    });
    const f = await loadFlow('PROJ-83');
    expect(f?.need).toMatchObject({
      kind: 'problem',
      ask: 'The commit failed: test(edges): cover a (PROJ-83)',
      detail: expect.stringContaining('hook says no')
    });
    expect(f?.commits?.done.map((c) => c.title)).toEqual(['feat(edges): add a (PROJ-83)']);
    expect(git(wt, 'log', '--format=%s', '-1').trim()).toBe('feat(edges): add a (PROJ-83)');
  });
});

describe('Runs.verify', () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });

  it('runs the checks on the uncommitted change, with its files, and merges nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'atb-verify-'));
    git(root, 'init', '--bare', '-b', 'main', 'origin.git');
    git(root, 'clone', join(root, 'origin.git'), 'wt');
    const wt = join(root, 'wt');
    writeFileSync(join(wt, 'a.txt'), 'a\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'base');
    git(wt, 'push', 'origin', 'HEAD:main');
    git(wt, 'fetch', 'origin');
    writeFileSync(join(wt, 'a.txt'), 'changed\n');
    writeFileSync(join(wt, 'new.ts'), 'new\n');
    CONFIG.repo.checks = ['echo {changed} > seen.txt'];
    await saveFlow('PROJ-95', {
      stage: 'code-review',
      worktree: wt,
      codeReview: { at: 'now', summary: 'Done.', findings: [], checks: [] }
    });
    const { r } = runs(fakeQuery([]).query);
    await r.verify('PROJ-95');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-95'))?.run?.state).toBe('done'), {
      timeout: 8000
    });
    const f = await loadFlow('PROJ-95');
    expect(readFileSync(join(wt, 'seen.txt'), 'utf8').trim()).toBe('a.txt new.ts');
    expect(f?.gate).toMatchObject({ ok: true, verify: true, merged: false });
    expect(f?.gate?.steps.map((s) => s.name)).toEqual(['echo {changed} > seen.txt']);
    expect(f?.need?.actions[0]?.id).toBe('startCommitPlan');
    CONFIG.repo.checks = [];
  });
});

describe('a clean review leads to the checks', () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  const worktree = () => {
    const root = mkdtempSync(join(tmpdir(), 'atb-chain-'));
    git(root, 'init', '--bare', '-b', 'main', 'origin.git');
    git(root, 'clone', join(root, 'origin.git'), 'wt');
    const wt = join(root, 'wt');
    writeFileSync(join(wt, 'a.txt'), 'a\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'base');
    git(wt, 'push', 'origin', 'HEAD:main');
    git(wt, 'fetch', 'origin');
    writeFileSync(join(wt, 'a.txt'), 'changed\n');
    return wt;
  };
  const clean = {
    findings: [],
    checks: [{ name: 'check:types', ok: false, note: 'Not run' }],
    summary: 'Nothing found.'
  };
  const tested = (wt: string) => ({
    stage: 'testing' as const,
    worktree: wt,
    approved: 'now',
    requirements: [{ id: 'R1', text: 'Works', check: 'A test' }]
  });

  it('runs the board checks by itself, and offers the commits when they pass', async () => {
    CONFIG.repo.checks = ['true'];
    await saveFlow('PROJ-96', tested(worktree()));
    const { r } = runs(fakeQuery([init, success(clean)]).query);
    await r.review('PROJ-96');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-96'))?.gate?.ok).toBe(true), {
      timeout: 8000
    });
    await vi.waitFor(async () => expect((await loadFlow('PROJ-96'))?.run?.task).toBe('verify'));
    const f = await loadFlow('PROJ-96');
    expect(f?.need?.actions.map((a) => a.id)).toEqual(['startCommitPlan', 'openWorktree']);
    CONFIG.repo.checks = [];
  });

  it('offers a fix, with the output given to the next review, when a check fails', async () => {
    CONFIG.repo.checks = ['echo "TS2322 in a.ts" >&2; exit 1'];
    await saveFlow('PROJ-97', tested(worktree()));
    const { query, calls } = fakeQuery([init, success(clean)]);
    const { r } = runs(query);
    await r.review('PROJ-97');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-97'))?.need?.kind).toBe('problem'), {
      timeout: 8000
    });
    const f = await loadFlow('PROJ-97');
    expect(f?.need?.actions[0]).toEqual({ id: 'startCodeReview', label: 'Fix and review again' });
    expect(f?.need?.detail).toContain('TS2322 in a.ts');
    await vi.waitFor(() => expect(r.list()).toEqual([]));
    await r.review('PROJ-97');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.prompt).toContain('# Checks that failed');
    expect(calls[1]!.prompt).toContain('TS2322 in a.ts');
    CONFIG.repo.checks = [];
  });
});

describe('a build goes through the board checks before Testing', () => {
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  const repo = () => {
    const root = mkdtempSync(join(tmpdir(), 'atb-build-'));
    git(root, 'init', '--bare', '-b', 'main', 'origin.git');
    git(root, 'clone', join(root, 'origin.git'), 'wt');
    const wt = join(root, 'wt');
    writeFileSync(join(wt, 'a.txt'), 'a\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'base');
    git(wt, 'push', 'origin', 'HEAD:main');
    git(wt, 'fetch', 'origin');
    writeFileSync(join(wt, 'a.txt'), 'changed\n');
    return wt;
  };
  const approved = {
    stage: 'planning' as const,
    requirements: [{ id: 'R1', text: 'Works', check: 'A test' }],
    questions: [],
    steps: [{ n: 1, text: 'Do it', covers: ['R1'], state: 'todo' as const }]
  };
  const ok = { ok: true, note: '' };
  // The agent says that its own gate passed. The board does not take its word.
  const built = {
    steps: [{ n: 1, done: true, check: 'pnpm vitest a', ok: true, note: '' }],
    gate: { typecheck: ok, lint: ok, tests: ok },
    summary: 'Done.',
    followups: []
  };

  it('moves to Testing when the board checks pass', async () => {
    CONFIG.repo.checks = ['true'];
    const wt = repo();
    await saveFlow('PROJ-98', approved);
    const { r } = runs(fakeQuery([init, success(built)]).query, {
      worktree: async (a) => ({ path: wt, branch: a.branch, made: false })
    });
    await r.develop('PROJ-98');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-98'))?.gate?.ok).toBe(true), {
      timeout: 8000
    });
    const f = await loadFlow('PROJ-98');
    expect(f?.stage).toBe('testing');
    expect(f?.need?.actions[0]?.id).toBe('startTesting');
    CONFIG.repo.checks = [];
  });

  it('stays in Development with the output when a check fails, and the next build gets it', async () => {
    CONFIG.repo.checks = ['echo "prettier: a.tsx is not formatted" >&2; exit 1'];
    const wt = repo();
    await saveFlow('PROJ-99', approved);
    const { query, calls } = fakeQuery([init, success(built)]);
    const { r } = runs(query, {
      worktree: async (a) => ({ path: wt, branch: a.branch, made: false })
    });
    await r.develop('PROJ-99');
    await vi.waitFor(async () => expect((await loadFlow('PROJ-99'))?.need?.kind).toBe('problem'), {
      timeout: 8000
    });
    const f = await loadFlow('PROJ-99');
    expect(f?.stage).toBe('development');
    expect(f?.need?.actions[0]).toEqual({ id: 'startDevelopment', label: 'Fix and build again' });
    expect(f?.need?.detail).toContain('a.tsx is not formatted');
    await vi.waitFor(() => expect(r.list()).toEqual([]));
    await r.develop('PROJ-99');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.prompt).toContain('# Checks that failed');
    expect(calls[1]!.prompt).toContain('a.tsx is not formatted');
    CONFIG.repo.checks = [];
  });
});
