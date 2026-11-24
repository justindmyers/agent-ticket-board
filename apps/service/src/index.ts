import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  audit,
  CONFIG,
  errorData,
  detail,
  listComments,
  loadState,
  PLUGIN_DIR,
  PROCESSES_FILE,
  rememberTicket,
  SERVICE_FILE,
  SERVICE_LOG,
  serviceInfo
} from '@agent-ticket-board/core';
import { Processes } from './processes';
import { Runs } from './runs';
import { createApi } from './server';

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
