import { mkdtempSync, readFileSync } from 'node:fs';
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

import { FLOWS, loadFlow, readTimeline, saveFlow, type Ticket } from '@agent-ticket-board/core';
import { Processes } from './processes';
import { BUILD_ALLOWED, PLAN_ALLOWED, PLAN_TOOLS, Runs, toolPath, type QueryFn } from './runs';

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
  steps: [{ text: 'Do it', covers: ['R1'] }]
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
    ...extra
  });
  return { r, changed };
}

const idle = (r: Runs) => vi.waitFor(() => expect(r.list()).toEqual([]));

describe('Runs.plan', () => {
  it('runs a read-only, isolated session and writes the plan for approval', async () => {
    const { query, calls } = fakeQuery([init, success(plan)]);
    const { r, changed } = runs(query);
    await r.plan('PROJ-1');
    await idle(r);

    const o = calls[0]!.options!;
    expect(o).toMatchObject({
      cwd: '/code/example-app',
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
