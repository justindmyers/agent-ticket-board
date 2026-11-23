import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// A temporary home, and ATB_DRY_RUN so that the test never calls Jira.
const home = mkdtempSync(join(tmpdir(), 'atb-'));
process.env.ATB_HOME = home;
process.env.ATB_DRY_RUN = '1';

let moves: typeof import('./moves');
beforeAll(async () => {
  moves = await import('./moves');
});

describe('moveTicket', () => {
  it('refuses the agent until the developer allows it for that ticket', async () => {
    await expect(moves.moveTicket('PROJ-1', 'Verifying', 'agent')).rejects.toThrow(
      /may not change the Jira status/
    );
    await moves.setAgentMayMove('PROJ-1', true);
    await expect(moves.moveTicket('PROJ-1', 'Verifying', 'agent')).resolves.toMatchObject({
      by: 'agent',
      ok: true
    });
    await moves.setAgentMayMove('PROJ-1', false);
    await expect(moves.moveTicket('PROJ-1', 'Done', 'agent')).rejects.toThrow();
  });

  it('accepts a move that the developer approved, for one key only', async () => {
    await expect(moves.moveTicket('PROJ-2', 'Done', 'you')).resolves.toMatchObject({ by: 'you' });
    await expect(moves.moveTicket('PROJ-2,PROJ-3', 'Done', 'you')).rejects.toThrow(
      /Not a ticket key/
    );
  });

  it('logs each move with the person or agent that made it', () => {
    const lines = readFileSync(join(home, 'events.jsonl'), 'utf8').trim().split('\n');
    const events = lines.map((l) => JSON.parse(l) as { key: string; to: string; by: string });
    expect(events.map((e) => [e.key, e.to, e.by])).toEqual([
      ['PROJ-1', 'Verifying', 'agent'],
      ['PROJ-2', 'Done', 'you']
    ]);
  });
});
