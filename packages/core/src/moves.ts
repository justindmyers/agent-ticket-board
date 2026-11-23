import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EVENTS_FILE } from './paths';
import { loadSettings, updateSettings } from './settings';
import { TOOL_ENV } from './jira';

// Jira status changes: the only Jira write the board makes, for one ticket at a time.
//   by 'you':   the developer approved this move in a client (a confirmation dialog).
//   by 'agent': only where the developer turned on "Let the agent update the Jira status" for that ticket.
// Comments, fields, labels and other tickets are never written. Each move goes into events.jsonl.
const KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export type MoveEvent = {
  at: string;
  key: string;
  from?: string;
  to: string;
  by: 'you' | 'agent';
  ok: boolean;
  error?: string;
  dryRun?: boolean;
};

export const setAgentMayMove = (key: string, allow: boolean) =>
  updateSettings(key, { agentMayMoveJira: allow });

/** A status for this ticket after its merge, or null to go back to the configured rules. */
export const setAfterMerge = (key: string, to: string | null) =>
  updateSettings(key, { afterMerge: to ?? undefined });

export const agentMayMove = async (key: string) => !!(await loadSettings())[key]?.agentMayMoveJira;

export async function moveEvents(key?: string): Promise<MoveEvent[]> {
  try {
    const lines = (await readFile(EVENTS_FILE, 'utf8')).split('\n').filter(Boolean);
    const events = lines.map((l) => JSON.parse(l) as MoveEvent);
    return key ? events.filter((e) => e.key === key) : events;
  } catch {
    return [];
  }
}

function acliTransition(key: string, to: string): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(
      'acli',
      ['jira', 'workitem', 'transition', '--key', key, '--status', to, '--yes'],
      { timeout: 30_000, env: TOOL_ENV },
      (e, _o, err) => (e ? reject(new Error((err || e.message).trim().slice(0, 300))) : resolve())
    )
  );
}

/** Moves one ticket to a status. Throws when the agent has no permission for that ticket. */
export async function moveTicket(
  key: string,
  to: string,
  by: 'you' | 'agent',
  from?: string
): Promise<MoveEvent> {
  if (!KEY.test(key)) {
    throw new Error(`Not a ticket key: ${key}`);
  }
  if (!to.trim() || to.length > 60) {
    throw new Error('Not a status name');
  }
  if (by === 'agent' && !(await agentMayMove(key))) {
    throw new Error(
      `The agent may not change the Jira status of ${key}. The developer has not allowed it for this ticket.`
    );
  }
  const dryRun = process.env.ATB_DRY_RUN === '1';
  const ev: MoveEvent = {
    at: new Date().toISOString(),
    key,
    from,
    to,
    by,
    ok: true,
    ...(dryRun ? { dryRun } : {})
  };
  try {
    if (!dryRun) {
      await acliTransition(key, to);
    }
  } catch (e) {
    ev.ok = false;
    ev.error = e instanceof Error ? e.message : String(e);
  }
  await mkdir(dirname(EVENTS_FILE), { recursive: true });
  await appendFile(EVENTS_FILE, `${JSON.stringify(ev)}\n`);
  if (!ev.ok) {
    throw new Error(ev.error);
  }
  return ev;
}
