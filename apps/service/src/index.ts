import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  addComment,
  boardCommand,
  approveTesting,
  audit,
  CONFIG,
  errorData,
  detail,
  TICKETS_DIR,
  listComments,
  loadFlow,
  loadState,
  PLUGIN_DIR,
  PROCESSES_FILE,
  rememberTicket,
  requestChange,
  saveFlow,
  SERVICE_FILE,
  SERVICE_LOG,
  serviceInfo
} from '@agent-ticket-board/core';
import { Processes } from './processes';
import { handback, writeHandoff } from './handoff';
import { Runs } from './runs';
import { createApi } from './server';

export { parseSizes, TestBrowser } from './browser';

export const log = (line: string) => {
  mkdirSync(dirname(SERVICE_LOG), { recursive: true });
  appendFileSync(SERVICE_LOG, `${new Date().toISOString()} ${line}\n`);
};

/** The developer's `claude`. A process that VS Code starts may not have the shell's PATH. */
export function findClaude(): string {
  const dirs = [
    ...(process.env.PATH ?? '').split(':'),
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ];
  const hit = dirs
    .filter(Boolean)
    .map((d) => join(d, 'claude'))
    .find((p) => existsSync(p));
  if (hit) {
    return hit;
  }
  try {
    return execFileSync('/bin/zsh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Claude Code (`claude`) was not found. Install it, then start the service again.'
    );
  }
}

/** Runs the service until SIGTERM, SIGINT or POST /shutdown. */
export async function serve() {
  if (await serviceInfo()) {
    throw new Error('The board service runs already.');
  }
  await loadState();
  const processes = new Processes(
    PROCESSES_FILE,
    (e, type, data) => void audit(e.ticket, 'service', type, { pid: e.pid, kind: e.kind, ...data })
  );
  const reaped = await processes.reap();
  if (reaped.length) {
    log(`Stopped ${reaped.length} processes that an earlier service left.`);
  }

  const token = randomBytes(32).toString('hex');
  let events: { send: (d: unknown) => void } = { send: () => undefined };
  const runs = new Runs({
    query,
    processes,
    claude: findClaude(),
    plugin: PLUGIN_DIR,
    repo: () => CONFIG.repo.path,
    ticket: async (key) => {
      try {
        const t = await detail(key);
        await audit(key, 'tracker', 'ticket.read', { status: t.status, updated: t.updated });
        await rememberTicket(t);
        return t;
      } catch (e) {
        await audit(key, 'tracker', 'ticket.read.failed', errorData(e));
        throw e;
      }
    },
    comments: async (key) => (await listComments(key)).map((c) => c.text),
    changed: (key) => events.send({ key })
  });

  let stopping = false;
  const shutdown = async (why: string) => {
    if (stopping) {
      return;
    }
    stopping = true;
    log(`Stopping: ${why}.`);
    await runs.stopAll();
    const left = await processes.stop();
    rmSync(SERVICE_FILE, { force: true });
    await api.close();
    log(
      left.length ? `Stopped. Still alive: ${left.join(', ')}.` : 'Stopped. No processes are left.'
    );
    process.exit(0);
  };

  const api = createApi(token, {
    'GET /health': async () => ({
      ok: true,
      pid: process.pid,
      runs: runs.list(),
      processes: processes.list()
    }),
    'POST /tickets/:key/plan': async ({ key }) => runs.plan(key!),
    // A comment that revisits the ticket: built work goes back to Planning for the change, then re-plans.
    'POST /tickets/:key/change': async ({ key }, body) => {
      const text = String((body as { text?: unknown } | null)?.text ?? '');
      const f = requestChange(
        (await loadFlow(key!)) ?? { stage: 'planning' },
        text,
        new Date().toISOString()
      );
      await addComment(key!, text.trim(), true);
      await saveFlow(key!, f);
      return runs.plan(key!);
    },
    // Continue in chat: the handoff file for a new Claude Code chat in the ticket's worktree.
    'POST /tickets/:key/handoff': async ({ key }) => {
      const flow = await loadFlow(key!);
      if (!flow) {
        throw new Error(`${key} has no agent record. Start it on the board first.`);
      }
      const r = await writeHandoff({
        ticket: await detail(key!),
        flow,
        comments: (await listComments(key!)).map((c) => c.text),
        dir: join(TICKETS_DIR, key!),
        atb: boardCommand()
      });
      await audit(key!, 'service', 'chat.handoff', { file: r.file });
      return r;
    },
    // The chat hands the ticket back: what changed there, and the stage's next step.
    'POST /tickets/:key/handback': async ({ key }, body) => {
      const f = handback(await loadFlow(key!), body, new Date().toISOString());
      await addComment(key!, f.need!.ask, false);
      await saveFlow(key!, f);
      await audit(key!, 'service', 'chat.handback', { summary: f.chat?.summary, stage: f.stage });
      events.send({ key });
      return f;
    },
    'POST /tickets/:key/develop': async ({ key }) => runs.develop(key!),
    'POST /tickets/:key/test': async ({ key }) => runs.test(key!),
    // Approval ends Testing: the ticket's test browser closes as well.
    // The approval also starts the review: its first step is the reviewers.
    'POST /tickets/:key/approve-testing': async ({ key }) => {
      const f = await approveTesting(key!);
      await runs.closeBrowser(key!);
      await runs.review(key!);
      return f;
    },
    // The push, in two steps: the dry run shows it, the approval makes exactly that push.
    'POST /tickets/:key/push-plan': async ({ key }) => runs.pushPlan(key!),
    'POST /tickets/:key/push': async ({ key }) => runs.push(key!),
    // The draft pull request, in two steps like the push.
    'POST /tickets/:key/pr-plan': async ({ key }) => runs.prPlan(key!),
    'POST /tickets/:key/pr': async ({ key }) => runs.pr(key!),
    'POST /tickets/:key/review': async ({ key }) => runs.review(key!),
    'POST /tickets/:key/gate': async ({ key }) => runs.gate(key!),
    'POST /tickets/:key/restart': async ({ key }) => runs.startOver(key!),
    'POST /tickets/:key/verify': async ({ key }) => runs.verify(key!),
    'POST /tickets/:key/review-fix': async ({ key }) => runs.reviewFix(key!),
    'POST /tickets/:key/commit-plan': async ({ key }) => runs.commitPlan(key!),
    'POST /tickets/:key/commit': async ({ key }) => runs.commit(key!),
    'POST /tickets/:key/stop': async ({ key }) => ({ stopped: await runs.stop(key!) }),
    'POST /shutdown': async () => {
      setTimeout(() => void shutdown('asked by a client'), 10);
      return { stopping: true };
    }
  });
  events = api.events;
  const port = await api.listen();
  mkdirSync(dirname(SERVICE_FILE), { recursive: true });
  writeFileSync(SERVICE_FILE, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  log(`Listening on 127.0.0.1:${port} (pid ${process.pid}).`);

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  return { port };
}
