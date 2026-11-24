import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Ticket } from './types';

// A temporary home, so the test never touches the developer's sprint cache.
const home = mkdtempSync(join(tmpdir(), 'atb-'));
process.env.ATB_HOME = home;

let sprint: typeof import('./sprint');

const ticket = (key: string, status: string): Ticket => ({
  key,
  summary: 'Example',
  status,
  type: 'Story',
  priority: 'Medium',
  labels: [],
  points: 3,
  updated: null
});

beforeAll(async () => {
  mkdirSync(join(home, 'cache'), { recursive: true });
  writeFileSync(
    join(home, 'cache', 'sprint.json'),
    JSON.stringify({
      at: '2026-01-01T00:00:00Z',
      tickets: [ticket('PROJ-1', 'Blocked'), ticket('PROJ-2', 'To Do')]
    })
  );
  sprint = await import('./sprint');
});

describe('rememberTicket', () => {
  it('writes a fresh ticket into the sprint cache, so the list shows its new status', async () => {
    const changed = await sprint.rememberTicket(ticket('PROJ-1', 'In Progress'));
    expect(changed).toBe(true);
    const snap = await sprint.readCache();
    expect(snap.tickets.map((t) => [t.key, t.status])).toEqual([
      ['PROJ-1', 'In Progress'],
      ['PROJ-2', 'To Do']
    ]);
    expect(snap.at).toBe('2026-01-01T00:00:00Z');
  });

  it('changes nothing for a ticket that is not in the sprint, or that did not change', async () => {
    expect(await sprint.rememberTicket(ticket('PROJ-9', 'Done'))).toBe(false);
    expect(await sprint.rememberTicket(ticket('PROJ-2', 'To Do'))).toBe(false);
    expect((await sprint.readCache()).tickets).toHaveLength(2);
  });
});
