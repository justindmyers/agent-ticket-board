import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
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
  activityText,
  applyGate,
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
  withoutNeed,
  type AgentRun,
  type Flow,
  type Ticket,
  HOME,
  memorySection,
  projectMemory,
  boardCommand
} from '@agent-ticket-board/core';
import { sessionOf, TestBrowser } from './browser';
import { runGate } from './gate';
import { planBase } from './plan-base';
import type { Processes } from './processes';
import { STAGE_SPECS, testAllowed, type StageId, type StageSpec } from './stages';

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
  /** How long Testing waits for the app to listen. Tests make it short. */
  appTimeoutMs?: number;
  /** A desktop notification. Default: terminal-notifier, or osascript. */
  notify?: (message: string) => void;
  /** The ticket's test browser. Default: the board's own playwright-cli browser. */
  browser?: (key: string, cwd: string) => BrowserLike;
  /** The read-only copy of the remote's main branch for planning. Default: planBase. */
  planBase?: (repo: string, dir: string) => Promise<string>;
  /** Claude Code's home, for the project memory of the repository. Default: ~/.claude. */
  claudeHome?: string;
  /** The command that takes a screenshot set. Default: this CLI's `shots`. */
  shotsCommand?: string;
};

function desktopNotify(message: string) {
  const title = 'Agent Ticket Board';
  execFile(
    'terminal-notifier',
    ['-title', title, '-message', message, '-sound', 'default'],
    (e) => {
      if (e) {
        execFile(
          'osascript',
          ['-e', `display notification ${JSON.stringify(message)} with title "${title}"`],
          () => undefined
        );
      }
    }
  );
}

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

/** Where a test run works: the worktree, the app's address and the browser. */
export type AppEnv = {
  cwd: string;
  url: string;
  session: string;
  shots: string;
  mocked: boolean;
  appLog: string;
};

export type BrowserLike = Pick<
  TestBrowser,
  'isOpen' | 'open' | 'goto' | 'waitLogin' | 'close' | 'runCode' | 'routes' | 'saveLogin'
>;

/** True when something accepts a TCP connection at host:port within 2 seconds. */
export function answers(hostPort: string) {
  const [host, port] = hostPort.split(':');
  return new Promise<boolean>((resolve) => {
    const s = createConnection({ host: host || 'localhost', port: Number(port) });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(2000, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/** True when something accepts a connection on the port, over IPv4 or IPv6 localhost. */
async function inUse(port: number) {
  return (await answers(`127.0.0.1:${port}`)) || (await answersV6(port));
}

function answersV6(port: number) {
  return new Promise<boolean>((resolve) => {
    const s = createConnection({ host: '::1', port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(2000, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/**
 * True when nothing uses the port. A bind on the wildcard address is not enough: on macOS it
 * succeeds while another server holds 127.0.0.1 on the same port. So also try to connect.
 */
async function portFree(port: number) {
  if (await inUse(port)) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

/** True when a process of the group `pgid` (the app that the board started) listens on the port. */
async function groupListens(port: number, pgid: number) {
  const run = (cmd: string, args: string[]) =>
    new Promise<string>((resolve) =>
      execFile(cmd, args, (_e, out) => resolve(typeof out === 'string' ? out : ''))
    );
  const pids = (await run('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'])).split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    if (Number((await run('ps', ['-o', 'pgid=', '-p', pid])).trim()) === pgid) {
      return true;
    }
  }
  return false;
}

async function waitFor(check: () => Promise<boolean>, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

type ShellResult = { code: number; out: string };

export class Runs {
  private queue: PQueue;
  /** Worktree setup runs `pnpm install`: one at a time. */
  private heavy = new PQueue({ concurrency: 1 });
  private active = new Map<string, AbortController>();
  private logs = new Map<string, RunLog>();
  /** The tickets whose test app this service started. Only those get closed. */
  private apps = new Set<string>();
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

  test(key: string) {
    return this.start(key, 'testing');
  }

  review(key: string) {
    return this.start(key, 'code-review');
  }

  /**
   * The pre-push gate: no agent, no cost. The checks run one at a time on this computer. The run
   * shows on the ticket like an agent run, with Stop.
   */
  async gate(key: string) {
    if (this.active.has(key)) {
      throw new Error(`${key}: a run is active already.`);
    }
    const base = await loadFlow(key);
    if (!base?.codeReview || !base.worktree || !existsSync(base.worktree)) {
      throw new Error(`${key}: the checks run after the review, in the ticket's worktree.`);
    }
    if (!CONFIG.repo.checks.length) {
      throw new Error(
        'Set the checks before a push in Settings first: the gate has nothing to run.'
      );
    }
    const cwd = base.worktree;
    const ac = new AbortController();
    this.active.set(key, ac);
    const id = `${this.now().replace(/[:.]/g, '-')}-gate`;
    await audit(key, 'service', 'gate.started', { run: id, checks: CONFIG.repo.checks });
    await this.write(key, {
      ...withoutNeed(base),
      stage: 'code-review',
      run: {
        id,
        state: 'running',
        stage: 'code-review',
        task: 'gate',
        started: this.now(),
        model: 'none'
      }
    });
    void (async () => {
      try {
        const gate = await runGate({
          checks: CONFIG.repo.checks,
          base: CONFIG.repo.baseBranch,
          testMock: CONFIG.repo.testMock,
          now: this.now,
          step: (name) => void this.patchRun(key, { activity: `Running ${name}` }),
          exec: (cmd, heavy) => {
            const run = () => this.shell(key, cmd, cwd, ac.signal);
            return heavy
              ? (this.heavy.add(run, { signal: ac.signal }) as Promise<ShellResult>)
              : run();
          }
        });
        if (ac.signal.aborted) {
          return;
        }
        await audit(key, 'service', 'gate.done', {
          ok: gate.ok,
          merged: gate.merged,
          steps: gate.steps.map((s) => `${s.name}: ${s.ok ? 'ok' : 'failed'}`)
        });
        const f = applyGate(FLOWS[key]!, gate);
        await this.write(key, {
          ...f,
          run: {
            ...f.run!,
            state: gate.ok ? 'done' : 'failed',
            ended: this.now(),
            activity: undefined
          }
        });
      } catch (e) {
        if (!ac.signal.aborted) {
          await this.fail(
            key,
            STAGE_SPECS['code-review'],
            e instanceof Error ? e.message : String(e),
            undefined,
            e
          );
        }
      } finally {
        this.active.delete(key);
      }
    })();
    return FLOWS[key]!.run!;
  }

  /** One shell command in a worktree: its exit code and its output. Stop kills it. */
  private shell(key: string, cmd: string, cwd: string, signal: AbortSignal): Promise<ShellResult> {
    return new Promise((resolve) => {
      const child = this.d.processes.spawn(
        'sh',
        ['-c', cmd],
        {
          cwd,
          env: { ...process.env, PATH: toolPath(process.env.PATH) },
          stdio: ['ignore', 'pipe', 'pipe']
        },
        key,
        'check'
      );
      let out = '';
      const add = (c: Buffer) => (out = (out + c.toString()).slice(-20000));
      child.stdout?.on('data', add);
      child.stderr?.on('data', add);
      signal.addEventListener('abort', () => void this.d.processes.stop(key));
      child.once('error', (e) => resolve({ code: 1, out: e.message }));
      child.once('close', (code) => resolve({ code: code ?? 1, out }));
    });
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
    // A test run's app and browser go first: Stop means the developer is done with them.
    await this.stopApp(key, true);
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
    // One test run at a time: each starts a dev server and a browser, and the laptop stays usable.
    const release = spec.stage === 'testing' ? await this.appTurn(key, ac) : () => undefined;
    if (ac.signal.aborted) {
      release();
      return;
    }
    await this.patchRun(key, { state: 'running', started: this.now() });
    await audit(key, 'service', 'run.started', { run: FLOWS[key]?.run?.id, stage: spec.stage });
    try {
      const t = await this.d.ticket(key);
      const app = spec.stage === 'testing' ? await this.startApp(key, log) : undefined;
      // A ticket with a worktree is read there: a re-plan for a change must see the built code.
      const cwd =
        spec.stage === 'development'
          ? await this.worktree(key, t, log)
          : (app?.cwd ?? (await worktreeOf(FLOWS[key]!)) ?? (await this.mainCopy(key)));
      // The developer's Claude Code memory of the main checkout: a worktree has none of its own.
      const memory = projectMemory(this.d.repo()!, this.d.claudeHome);
      const prompt =
        spec.prompt(t, FLOWS[key]!, await this.d.comments(key), app) +
        (memory ? `\n${memorySection(memory)}` : '');
      const options = {
        ...this.options(key, spec, cwd, ac, log, app),
        ...(memory ? { additionalDirectories: [memory.dir] } : {})
      };
      await log.prompt(prompt, options as Record<string, unknown>);
      for await (const m of this.d.query({ prompt, options })) {
        await log.message(m);
        if (ac.signal.aborted) {
          return;
        }
        if (m.type === 'assistant') {
          await this.activity(key, m);
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
    } finally {
      if (spec.stage === 'testing') {
        // Stop closes the browser too; a finished or failed run keeps it for the next test run.
        await this.stopApp(key, ac.signal.aborted);
      }
      release();
    }
  }

  private appQueue: Promise<void> = Promise.resolve();

  /** Waits until no other test run has the app. Returns the release. */
  private async appTurn(key: string, ac: AbortController) {
    let release!: () => void;
    const before = this.appQueue;
    this.appQueue = new Promise<void>((r) => (release = r));
    const waiting = setTimeout(
      () => void this.patchRun(key, { activity: "Waiting for another ticket's test run" }),
      200
    );
    await Promise.race([before, new Promise((r) => ac.signal.addEventListener('abort', r))]);
    clearTimeout(waiting);
    // A stopped run must not release before the runs ahead of it: it passes its turn on.
    return ac.signal.aborted ? () => void before.then(release) : release;
  }

  /**
   * The live app of the ticket's worktree, for Testing: the login service answers, the dev server
   * runs on a free build port, and the ticket's browser is open and logged in.
   */
  private async startApp(key: string, log: RunLog): Promise<AppEnv> {
    const f = FLOWS[key]!;
    const { devCommand, loginCheck, ownerPort } = CONFIG.app;
    if (!devCommand) {
      throw new Error('Set the dev command in Settings (App under test) first.');
    }
    if (loginCheck && !(await answers(loginCheck))) {
      throw new Error(
        `The login service at ${loginCheck} does not answer. Start it, then test again.`
      );
    }
    // The same port as the ticket's last test run: the login in its browser belongs to that origin.
    const port = await this.freePort(f.testPort);
    const url = `http://localhost:${port}/`;
    const env = { ...process.env, PATH: toolPath(process.env.PATH), BROWSER: 'none' };
    this.apps.add(key);
    const app = this.d.processes.spawn(
      'sh',
      ['-c', devCommand.replaceAll('{port}', String(port))],
      { cwd: f.worktree!, env, stdio: ['ignore', 'pipe', 'pipe'] },
      key,
      'dev-server'
    );
    app.stdout?.on('data', (c: Buffer) => void log.append('app.log', c.toString()));
    app.stderr?.on('data', (c: Buffer) => void log.append('app.log', c.toString()));
    await audit(key, 'service', 'app.starting', { port, pid: app.pid });
    // Ready means: this app's own process group listens on the leased port. Something else that
    // answers there (another worktree's server) is not this ticket's app.
    let exited = false;
    app.once('exit', () => (exited = true));
    const ready = await waitFor(
      async () => exited || groupListens(port, app.pid!),
      this.d.appTimeoutMs ?? 180_000
    );
    if (!ready || exited) {
      throw new Error(
        `The app did not start on port ${port}${exited ? ': its command ended' : ''}. See app.log in the audit log.`
      );
    }
    await audit(key, 'service', 'app.ready', { port });
    await this.write(key, { ...FLOWS[key]!, testPort: port });
    const browser = this.browser(key, f.worktree!, env);
    const keep = [ownerPort, Number(loginCheck?.split(':')[1])].filter((p) => p > 0);
    // Moving the ticket to Testing approved the writes of its plan: the browser lets only those through.
    const writes = f.writes ?? [];
    if (await browser.isOpen()) {
      await browser.routes(url, keep, writes);
      await browser.goto(url);
      await audit(key, 'service', 'browser.reused', { writes: writes.length });
    } else {
      await browser.open(url, keep, writes);
      await audit(key, 'service', 'browser.opened', { writes: writes.length });
    }
    if (!(await browser.waitLogin(url, ownerPort, 5))) {
      await this.patchRun(key, { waiting: 'login', app: url });
      await audit(key, 'service', 'browser.login.wait', {});
      (this.d.notify ?? desktopNotify)(`${key}: log in to the browser window to test.`);
      if (!(await browser.waitLogin(url, ownerPort, 600))) {
        await this.patchRun(key, { waiting: undefined });
        throw new Error(
          'You did not log in to the browser within 10 minutes. Test again when you are ready.'
        );
      }
    }
    await this.patchRun(key, { waiting: undefined, app: url });
    await audit(key, 'service', 'browser.login.done', {});
    // The next ticket's browser loads this login, so the developer does not log in again.
    await browser.saveLogin();
    // The fake API that an earlier test run wrote: load it, so this run does not build it again.
    const mock = join(f.worktree!, '.playwright-cli', 'mock.js');
    const mocked = existsSync(mock);
    if (mocked) {
      await browser.runCode(mock);
      await audit(key, 'service', 'browser.mock.loaded', {});
    }
    return {
      cwd: f.worktree!,
      url,
      session: sessionOf(key),
      shots: `${this.shotsCommand()} ${key}`,
      mocked,
      appLog: join(log.dir, 'app.log')
    };
  }

  /**
   * A read-only copy of the remote's main branch, for a plan with no worktree yet: the developer's
   * checkout can be on another branch, or behind. Falls back to the checkout, and says so.
   */
  private async mainCopy(key: string) {
    const repo = this.d.repo()!;
    try {
      const dir = await (this.d.planBase ?? planBase)(
        repo,
        join(HOME, 'plan-base', repo.replace(/[^\w]/g, '-'))
      );
      await audit(key, 'service', 'plan.base', { dir });
      return dir;
    } catch (e) {
      await audit(key, 'service', 'plan.base.failed', {
        error: e instanceof Error ? e.message : String(e)
      });
      return repo;
    }
  }

  /** The ticket's test browser. Tests replace it. */
  private browser(key: string, cwd: string, env: NodeJS.ProcessEnv): BrowserLike {
    return this.d.browser?.(key, cwd) ?? new TestBrowser(key, { cwd, env });
  }

  /** The command that the agent runs to take a screenshot set: the board's own CLI. */
  shotsCommand() {
    return this.d.shotsCommand ?? `${boardCommand()} shots`;
  }

  /**
   * Stops the ticket's app after every test run, also after a failure. The browser stays open for the
   * next test run, so the developer stays logged in; Stop closes it as well.
   */
  private async stopApp(key: string, closeBrowser = false) {
    if (!this.apps.delete(key)) {
      return;
    }
    const f = FLOWS[key];
    if (closeBrowser && f?.worktree) {
      await this.browser(key, f.worktree, process.env).close();
      await audit(key, 'service', 'browser.closed', {});
    }
    const left = await this.d.processes.stop(key);
    await audit(key, 'service', 'app.stopped', { stillAlive: left });
  }

  /** Closes the ticket's test browser, for example after the developer approved the evidence. */
  async closeBrowser(key: string) {
    const f = FLOWS[key] ?? (await loadFlow(key));
    if (f?.worktree) {
      await this.browser(key, f.worktree, {
        ...process.env,
        PATH: toolPath(process.env.PATH)
      }).close();
      await audit(key, 'service', 'browser.closed', {});
    }
  }

  /** The first build port that nothing listens on. The developer's own port is never used. */
  private async freePort(prefer?: number) {
    const [first, last] = CONFIG.app.buildPorts;
    const ok = (p: number) => p >= first && p <= last && p !== CONFIG.app.ownerPort;
    if (prefer && ok(prefer) && (await portFree(prefer))) {
      return prefer;
    }
    for (let p = first; p <= last; p++) {
      if (p !== CONFIG.app.ownerPort && (await portFree(p))) {
        return p;
      }
    }
    throw new Error(
      `Every build port from ${first} to ${last} is in use. Stop an app, then test again.`
    );
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
    log: RunLog,
    app?: AppEnv
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
      // Testing allows the exact screenshot command that its prompt gives the agent.
      allowedTools: app ? testAllowed(this.shotsCommand()) : spec.allowed,
      permissionMode: 'dontAsk',
      settingSources: ['project', 'local'],
      strictMcpConfig: true,
      plugins: [{ type: 'local', path: this.d.plugin }],
      ...(spec.agents ? { agents: spec.agents } : {}),
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
      const f = spec.apply(FLOWS[key]!, m.structured_output, key);
      await this.write(key, {
        ...f,
        // The SDK's cost is the session total so far; a session can return more than one result.
        spent: (f.spent ?? 0) + cost - (f.run?.cost ?? 0),
        run: { ...f.run!, state: 'done', ended: this.now(), cost }
      });
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
      ...(cost === undefined ? {} : { spent: (f.spent ?? 0) + cost - (f.run?.cost ?? 0) }),
      run: {
        ...f.run!,
        waiting: undefined,
        state: 'failed',
        ended: this.now(),
        error,
        ...(cost === undefined ? {} : { cost })
      },
      need: { kind: 'problem', ask: error, actions: [{ id: spec.retry, label: 'Try again' }] }
    });
  }

  /** Shows the agent's last tool call on the ticket ("Opening /settings/edges"). */
  private async activity(key: string, m: Extract<SDKMessage, { type: 'assistant' }>) {
    const uses = (m.message.content as { type: string; name?: string; input?: unknown }[]).filter(
      (c) => c.type === 'tool_use'
    );
    const last = uses.at(-1);
    const text =
      last && activityText(last.name ?? '', (last.input ?? {}) as Record<string, unknown>);
    if (text && text !== FLOWS[key]?.run?.activity) {
      await this.patchRun(key, { activity: text });
    }
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

/** The ticket's worktree when it still exists on disk. */
async function worktreeOf(f: Flow) {
  return f.worktree && existsSync(f.worktree) ? f.worktree : null;
}
