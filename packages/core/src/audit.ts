import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEqual, omit } from 'lodash-es';
import { create } from 'tar';
import { HOME, TICKETS_DIR } from './paths';
import type { Flow } from './types';

// The audit log: everything that happens to a ticket, kept on this computer so a failure can be
// traced. One timeline (events.jsonl) for each ticket, and one folder for each agent run.

export type Source = 'service' | 'developer' | 'agent' | 'board' | 'tracker';
export type AuditEvent = { at: string; source: Source; type: string } & Record<string, unknown>;

const ticketDir = (key: string) => join(TICKETS_DIR, key);
const timelineFile = (key: string) => join(ticketDir(key), 'events.jsonl');

/** Appends one event to a ticket's timeline. The audit log never stops the work: errors are dropped. */
export async function audit(
  key: string,
  source: Source,
  type: string,
  data: Record<string, unknown> = {}
) {
  try {
    await mkdir(ticketDir(key), { recursive: true });
    const ev: AuditEvent = { at: new Date().toISOString(), source, type, ...data };
    await appendFile(timelineFile(key), `${JSON.stringify(ev)}\n`);
  } catch {
    // An audit write must not break a run or a click.
  }
}

/** The fields to log for an error: its message, and its stack when it has one. */
export function errorData(e: unknown): { error: string; stack?: string } {
  return e instanceof Error
    ? { error: e.message, ...(e.stack ? { stack: e.stack } : {}) }
    : { error: String(e) };
}

/** The top-level fields of an agent record that changed. */
export function recordChanges(before: Flow | null, after: Flow) {
  const fields = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])
  ] as (keyof Flow)[];
  return fields
    .filter((f) => !isEqual(before?.[f], after[f]))
    .map((field) => ({ field, before: before?.[field], after: after[field] }));
}

export async function readTimeline(key: string): Promise<AuditEvent[]> {
  const text = await readFile(timelineFile(key), 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as AuditEvent];
      } catch {
        return [];
      }
    });
}

const LONG = new Set(['stack', 'changes', 'prompt']);

const brief = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

/** The timeline as text: one line for each event, with the short details. */
export function timelineText(events: AuditEvent[]) {
  return events
    .map((e) => {
      const details = Object.entries(omit(e, ['at', 'source', 'type']))
        .filter(([k]) => !LONG.has(k))
        .map(([k, v]) => `${k}=${brief(v)}`)
        .join(' ');
      const at = e.at.replace('T', ' ').slice(0, 19);
      return `${at}  ${e.source.padEnd(9)}  ${e.type}${details ? `  ${details}` : ''}`;
    })
    .join('\n');
}

/** JSON that skips cycles, so a live object in the data cannot break a log write. */
export function safeJson(data: unknown) {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    data,
    (_k, v: unknown) => {
      if (v && typeof v === 'object') {
        if (seen.has(v)) {
          return '[circular]';
        }
        seen.add(v);
      }
      return v;
    },
    2
  );
}

/** Files of one agent run: the prompt, the options, every SDK message, the raw output, a summary. */
export class RunLog {
  private constructor(readonly dir: string) {}

  static async open(key: string, id: string) {
    const dir = join(ticketDir(key), 'runs', id);
    await mkdir(dir, { recursive: true });
    return new RunLog(dir);
  }

  /** The error output of the agent process. */
  get stderr() {
    return join(this.dir, 'stderr.log');
  }

  private write(name: string, data: string) {
    return writeFile(join(this.dir, name), data).catch(() => undefined);
  }

  /** The prompt, and the session options without the environment, the functions and live objects. */
  prompt(text: string, options: Record<string, unknown>) {
    const plain = Object.fromEntries(
      Object.entries(options)
        .filter(
          ([k, v]) => k !== 'env' && typeof v !== 'function' && !(v instanceof AbortController)
        )
        .map(([k, v]) => [k, k === 'mcpServers' && v ? Object.keys(v) : v])
    );
    return Promise.all([
      this.write('prompt.md', text),
      this.write('options.json', safeJson(plain))
    ]);
  }

  message(m: unknown) {
    return appendFile(join(this.dir, 'messages.jsonl'), `${JSON.stringify(m)}\n`).catch(
      () => undefined
    );
  }

  /** Appends a chunk to one log file of the run, for example the worktree script's output. */
  append(name: string, chunk: string) {
    return appendFile(join(this.dir, name), chunk).catch(() => undefined);
  }

  /** The structured output as the agent gave it, before validation. */
  output(raw: unknown) {
    return this.write('output.json', JSON.stringify(raw, null, 2));
  }

  summary(s: Record<string, unknown>) {
    return this.write('summary.json', JSON.stringify(s, null, 2));
  }
}

/** Token patterns, each with its replacement. */
const SECRETS: [RegExp, string][] = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/g, '$1 [redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/g, '[redacted]'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, '[redacted]'],
  [/\bATATT[A-Za-z0-9_=-]{20,}/g, '[redacted]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[redacted]'],
  [
    /("(?:token|secret|password|apiKey|api_key|authorization)"\s*:\s*")[^"]+(")/gi,
    '$1[redacted]$2'
  ],
  [/\b[a-f0-9]{48,}\b/g, '[redacted]']
];

/** The text with tokens, keys and passwords replaced by [redacted]. */
export function redact(text: string) {
  return SECRETS.reduce((t, [rx, to]) => t.replace(rx, to), text);
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

/** One archive of the ticket's audit folder, with tokens removed. Returns its path. */
export async function bundle(key: string) {
  const tmp = await mkdtemp(join(tmpdir(), 'atb-bundle-'));
  try {
    const copy = join(tmp, key);
    await cp(ticketDir(key), copy, { recursive: true });
    for (const f of await walk(copy)) {
      await writeFile(f, redact(await readFile(f, 'utf8')));
    }
    const out = join(HOME, 'bundles');
    await mkdir(out, { recursive: true });
    const file = join(out, `${key}-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
    await create({ gzip: true, file, cwd: tmp }, [key]);
    return file;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const size = async (dir: string) =>
  (await Promise.all((await walk(dir)).map((f) => stat(f).then((s) => s.size)))).reduce(
    (a, b) => a + b,
    0
  );

/** Removes the oldest run folders until the ticket's audit folder is at most `maxBytes`. */
export async function pruneRuns(key: string, maxBytes = 200 * 1024 * 1024) {
  const runsDir = join(ticketDir(key), 'runs');
  const runs = await Promise.all(
    (await readdir(runsDir).catch(() => [] as string[])).map(async (id) => ({
      id,
      at: (await stat(join(runsDir, id))).mtimeMs
    }))
  );
  runs.sort((a, b) => a.at - b.at);
  const removed: string[] = [];
  while (runs.length > 1 && (await size(ticketDir(key))) > maxBytes) {
    const r = runs.shift()!;
    await rm(join(runsDir, r.id), { recursive: true, force: true });
    removed.push(r.id);
  }
  return removed;
}
