import { createWriteStream } from 'node:fs';
import {
  createSdkMcpServer,
  tool,
  type Options,
  type Query,
  type SDKMessage,
  type SpawnedProcess
} from '@anthropic-ai/claude-agent-sdk';
import PQueue from 'p-queue';
import { z } from 'zod';
import {
  audit,
  branchName,
  CONFIG,
  ensureWorktree,
  errorData,
  FLOWS,
  loadFlow,
  markStep,
  pruneRuns,
  RunLog,
  saveFlow,
  withNextStep,
  type AgentRun,
  type Flow,
  type Ticket
} from '@agent-ticket-board/core';
import type { Processes } from './processes';
import { STAGE_SPECS, type StageId, type StageSpec } from './stages';

// Agent runs: a queue with a fixed number of slots, one run at a time for each ticket, and Stop.
// Worktrees are made one at a time (their install is heavy). Every step goes into the audit log.

export { BUILD_ALLOWED, PLAN_ALLOWED, PLAN_TOOLS, READ_ONLY_TOOLS } from './stages';

export type QueryFn = (args: {
  prompt: string;
  options?: Options;
}) => Query | AsyncIterable<SDKMessage>;

export type RunDeps = {
  query: QueryFn;
  processes: Processes;
  /** The developer's own `claude` executable. */
  claude: string;
  /** The board's guard plugin. */
  plugin: string;
  /** The target repository: planning reads it, and worktrees branch off it. */
  repo: () => string | null;
  ticket: (key: string) => Promise<Ticket>;
  comments: (key: string) => Promise<string[]>;
  /** Called after each change to a record, so the service can tell the clients. */
  changed: (key: string) => void;
  /** Makes or finds the ticket's worktree. Tests replace it. */
  worktree?: typeof ensureWorktree;
  slots?: number;
  now?: () => string;
};

/** PATH with the usual folders of command-line tools (Homebrew and /usr/local) added once. */
export function toolPath(path = '') {
  const parts = path.split(':').filter(Boolean);
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']) {
    if (!parts.includes(dir)) {
      parts.push(dir);
    }
  }
  return parts.join(':');
}

export class Runs {
  private queue: PQueue;
  /** Worktree setup runs `pnpm install`: one at a time. */
  private heavy = new PQueue({ concurrency: 1 });
  private active = new Map<string, AbortController>();
  private logs = new Map<string, RunLog>();
  private now: () => string;
  private slots: number;

  constructor(private d: RunDeps) {
    this.slots = d.slots ?? 3;
    this.queue = new PQueue({ concurrency: this.slots });
    this.now = d.now ?? (() => new Date().toISOString());
  }

  /** The tickets with a queued or running run. */
  list() {
    return [...this.active.keys()];
  }

  plan(key: string) {
    return this.start(key, 'planning');
  }

  develop(key: string) {
    return this.start(key, 'development');
  }

  /** Queues a run of one stage. Returns at once; the run updates the record as it goes. */
  async start(key: string, stage: StageId) {
    const spec = STAGE_SPECS[stage];
    if (this.active.has(key)) {
      throw new Error(`${key}: an agent run is active already.`);
    }
    if (!this.d.repo()) {
      throw new Error('Set the repository folder in Settings first: agents work in that code.');
    }
    const base = await loadFlow(key);
    const why = spec.refuse(base);
    if (why) {
      throw new Error(`${key}: ${why}`);
    }
    const ac = new AbortController();
    this.active.set(key, ac);
    const id = `${this.now().replace(/[:.]/g, '-')}-${stage}`;
    this.logs.set(key, await RunLog.open(key, id));
    await audit(key, 'service', 'run.queued', {
      run: id,
      stage,
      slots: this.slots,
      waiting: this.queue.size,
      running: this.queue.pending
    });
    await this.write(key, {
      ...spec.begin(base),
      run: { id, state: 'queued', stage, started: this.now(), model: spec.model }
    });
    this.queue
      .add(() => this.execute(key, spec, ac), { signal: ac.signal })
      .catch(() => undefined)
      .finally(() => {
        this.active.delete(key);
        this.logs.delete(key);
        void pruneRuns(key);
      });
    return FLOWS[key]!.run!;
  }

  /** Stops a queued or running run and kills its processes. */
  async stop(key: string) {
    const ac = this.active.get(key);
    if (!ac) {
      return false;
    }
    ac.abort();
    const left = await this.d.processes.stop(key);
    this.active.delete(key);
    await audit(key, 'developer', 'run.stopped', { run: FLOWS[key]?.run?.id, stillAlive: left });
    await this.patchRun(key, { state: 'stopped', ended: this.now() });
    // A stopped run leaves a next step (Re-plan, Start again), never a record with nothing to click.
    await this.write(key, withNextStep(FLOWS[key]!));
    return true;
  }

  /** Stops every run. For Quit. */
  async stopAll() {
    await Promise.all(this.list().map((k) => this.stop(k)));
  }

  /** The board's `step` tool: the agent reports that a plan step is current or done. */
  async reportStep(key: string, n: number, state: 'current' | 'done', note?: string) {
    await audit(key, 'agent', 'step', { n, state, ...(note ? { note } : {}) });
    await this.write(key, markStep(FLOWS[key]!, n, state));
  }

  private async execute(key: string, spec: StageSpec, ac: AbortController) {
    const log = this.logs.get(key)!;
    await this.patchRun(key, { state: 'running', started: this.now() });
    await audit(key, 'service', 'run.started', { run: FLOWS[key]?.run?.id, stage: spec.stage });
    try {
      const t = await this.d.ticket(key);
      const cwd = spec.stage === 'development' ? await this.worktree(key, t, log) : this.d.repo()!;
      const prompt = spec.prompt(t, FLOWS[key]!, await this.d.comments(key));
      const options = this.options(key, spec, cwd, ac, log);
      await log.prompt(prompt, options as Record<string, unknown>);
      for await (const m of this.d.query({ prompt, options })) {
        await log.message(m);
        if (ac.signal.aborted) {
          return;
        }
        if (m.type === 'system' && m.subtype === 'init') {
          await this.patchRun(key, { session: m.session_id });
        }
        if (m.type === 'result') {
          await this.result(key, spec, m);
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        await this.fail(key, spec, e instanceof Error ? e.message : String(e), undefined, e);
      }
    }
  }

  /** The ticket's worktree: found, or made by the configured script, one at a time. */
  private async worktree(key: string, t: Ticket, log: RunLog) {
    const f = FLOWS[key]!;
    const branch = f.branch ?? branchName(t, CONFIG.repo.branch);
    const make = this.d.worktree ?? ensureWorktree;
    await audit(key, 'service', 'worktree.wait', { branch, waiting: this.heavy.size });
    const wt = (await this.heavy.add(() =>
      make({
        repo: this.d.repo()!,
        script: CONFIG.repo.worktreeScript,
        branch,
        log: (chunk) => void log.append('worktree.log', chunk),
        spawn: (cmd, args, opts) => this.d.processes.spawn(cmd, args, opts, key, 'setup')
      })
    ))!;
    await audit(key, 'service', 'worktree.ready', { ...wt });
    await this.write(key, { ...FLOWS[key]!, branch: wt.branch, worktree: wt.path });
    return wt.path;
  }

  private options(
    key: string,
    spec: StageSpec,
    cwd: string,
    ac: AbortController,
    log: RunLog
  ): Options {
    const board =
      spec.stage === 'development'
        ? {
            mcpServers: {
              board: createSdkMcpServer({
                name: 'board',
                version: '1',
                tools: [
                  tool(
                    'step',
                    'Report a plan step: "current" before you start it, "done" after its check passes.',
                    {
                      n: z.number().int().describe('The step number in the plan'),
                      state: z.enum(['current', 'done']),
                      note: z.string().optional()
                    },
                    async (a) => {
                      await this.reportStep(key, a.n, a.state, a.note);
                      return { content: [{ type: 'text', text: `Step ${a.n} is ${a.state}.` }] };
                    }
                  )
                ]
              })
            }
          }
        : {};
    return {
      cwd,
      model: spec.model,
      tools: spec.tools,
      allowedTools: spec.allowed,
      permissionMode: 'dontAsk',
      settingSources: ['project', 'local'],
      strictMcpConfig: true,
      plugins: [{ type: 'local', path: this.d.plugin }],
      outputFormat: { type: 'json_schema', schema: spec.schema(FLOWS[key]!) },
      maxBudgetUsd: spec.budgetUsd,
      abortController: ac,
      pathToClaudeCodeExecutable: this.d.claude,
      // A service started from an editor can miss the shell PATH: add the usual tool folders for gh and acli.
      env: { ...process.env, PATH: toolPath(process.env.PATH) },
      ...board,
      spawnClaudeCodeProcess: (o) => {
        const child = this.d.processes.spawn(
          o.command,
          o.args,
          { cwd: o.cwd, env: o.env, signal: o.signal, stdio: ['pipe', 'pipe', 'pipe'] },
          key,
          'agent'
        );
        child.stderr?.pipe(createWriteStream(log.stderr, { flags: 'a' }));
        void audit(key, 'service', 'process.started', { kind: 'agent', pid: child.pid });
        return child as SpawnedProcess;
      }
    };
  }

  private async result(key: string, spec: StageSpec, m: Extract<SDKMessage, { type: 'result' }>) {
    const cost = m.total_cost_usd;
    const log = this.logs.get(key);
    await log?.output(m.subtype === 'success' ? m.structured_output : null);
    await log?.summary({
      subtype: m.subtype,
      isError: m.is_error,
      turns: m.num_turns,
      cost,
      usage: m.usage,
      session: m.session_id,
      durationMs: m.duration_ms
    });
    if (m.permission_denials?.length) {
      await audit(key, 'service', 'tools.refused', {
        tools: m.permission_denials.map((p) => ({ tool: p.tool_name, input: p.tool_input }))
      });
    }
    if (m.subtype !== 'success' || m.is_error || !m.structured_output) {
      const why =
        m.subtype === 'error_max_budget_usd'
          ? 'it reached the cost limit'
          : m.subtype.replace(/_/g, ' ');
      await this.fail(key, spec, `The ${spec.stage} run stopped: ${why}.`, cost);
      return;
    }
    try {
      const f = spec.apply(FLOWS[key]!, m.structured_output);
      await this.write(key, { ...f, run: { ...f.run!, state: 'done', ended: this.now(), cost } });
      await audit(key, 'service', 'run.done', { run: f.run?.id, cost, ...spec.counts(f) });
    } catch (e) {
      await this.fail(key, spec, e instanceof Error ? e.message : String(e), cost, e);
    }
  }

  private async fail(key: string, spec: StageSpec, error: string, cost?: number, cause?: unknown) {
    const f = FLOWS[key] ?? { stage: spec.stage };
    await audit(key, 'service', 'run.failed', {
      run: f.run?.id,
      ...(cause === undefined ? { error } : { ...errorData(cause), error }),
      ...(cost === undefined ? {} : { cost })
    });
    await this.write(key, {
      ...f,
      run: {
        ...f.run!,
        state: 'failed',
        ended: this.now(),
        error,
        ...(cost === undefined ? {} : { cost })
      },
      need: { kind: 'problem', ask: error, actions: [{ id: spec.retry, label: 'Try again' }] }
    });
  }

  private async patchRun(key: string, patch: Partial<AgentRun>) {
    const f = FLOWS[key];
    if (f?.run) {
      await this.write(key, { ...f, run: { ...f.run, ...patch } });
    }
  }

  private async write(key: string, f: Flow) {
    await saveFlow(key, f, 'service');
    this.d.changed(key);
  }
}
