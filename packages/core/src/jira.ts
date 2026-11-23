import { execFile } from 'node:child_process';
import { CONFIG } from './config';
import type { Ticket } from './types';

// Read-only Jira access through the Atlassian CLI (acli). The only Jira write is in moves.ts.
const PATHS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
export const TOOL_ENV = { ...process.env, PATH: [...PATHS, process.env.PATH ?? ''].join(':') };

type Raw = { key: string; fields?: Record<string, unknown> };
type Named = { name?: string; displayName?: string };
type RawComment = { author?: Named; created?: string; body?: unknown };

function acli<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      'acli',
      args,
      { env: TOOL_ENV, maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message).trim().slice(0, 400)));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as T);
        } catch {
          reject(new Error(`acli returned non-JSON: ${stdout.slice(0, 200)}`));
        }
      }
    );
  });
}

const name = (v: unknown) => (v as Named | undefined)?.name ?? '';

function base(i: Raw): Ticket {
  const f = i.fields ?? {};
  const points = CONFIG.tracker.pointsField ? f[CONFIG.tracker.pointsField] : null;
  return {
    key: i.key,
    summary: (f.summary as string) ?? '',
    status: name(f.status) || '?',
    type: name(f.issuetype),
    priority: name(f.priority),
    labels: (f.labels as string[]) ?? [],
    points: typeof points === 'number' ? points : null,
    updated: (f.updated as string) ?? null
  };
}

/** Fast (about 1.5 s): keys, summaries and statuses. Search cannot read custom fields, so no points. */
export async function listSprint(): Promise<Ticket[]> {
  const fields = 'key,summary,status,issuetype,priority,labels';
  const list = await acli<Raw[]>([
    'jira',
    'workitem',
    'search',
    '--jql',
    CONFIG.tracker.jql,
    '--fields',
    fields,
    '--json',
    '--paginate'
  ]);
  return list.map(base);
}

/** One ticket in full (about 1 s): points, description and comments. */
export async function detail(key: string): Promise<Ticket> {
  const fields = [
    'summary',
    'status',
    'issuetype',
    'priority',
    'labels',
    'description',
    'comment',
    'reporter',
    'updated'
  ];
  if (CONFIG.tracker.pointsField) {
    fields.push(CONFIG.tracker.pointsField);
  }
  const i = await acli<Raw>([
    'jira',
    'workitem',
    'view',
    key,
    '--fields',
    fields.join(','),
    '--json'
  ]);
  const f = i.fields ?? {};
  const comments = ((f.comment as { comments?: RawComment[] })?.comments ?? []).map((c) => ({
    author: c.author?.displayName ?? '',
    created: c.created ?? '',
    body: c.body
  }));
  return {
    ...base(i),
    description: f.description ?? null,
    reporter: (f.reporter as Named)?.displayName ?? '',
    comments,
    detailAt: new Date().toISOString()
  };
}

/** Details for many keys, `n` at a time. `onEach` runs as each one arrives, so a UI can fill in. */
export async function details(keys: string[], onEach: (t: Ticket) => void, n = 6): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, keys.length) }, async () => {
      while (next < keys.length) {
        const k = keys[next++];
        try {
          onEach(await detail(k));
        } catch {
          // Keep the list entry. The next refresh tries again.
        }
      }
    })
  );
}
