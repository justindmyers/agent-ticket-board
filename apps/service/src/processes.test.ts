import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson, writeJson } from '@agent-ticket-board/core';
import { Processes, startTime, type Entry } from './processes';

const dir = () => mkdtempSync(join(tmpdir(), 'atb-proc-'));

describe('Processes', () => {
  it('records a child with its start time, and stop kills its whole group', async () => {
    const file = join(dir(), 'processes.json');
    const events: string[] = [];
    const p = new Processes(file, (_e, type) => events.push(type));
    // The shell starts a grandchild in the same group: stop must kill it too.
    const child = p.spawn(
      'sh',
      ['-c', 'sleep 30 & echo $!; wait'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
      'PROJ-1',
      'agent'
    );
    const grandchild = Number(
      await new Promise<string>((r) => child.stdout!.once('data', (d) => r(String(d))))
    );
    await p.settled();
    const saved = await readJson<Entry[]>(file, []);
    expect(saved).toEqual([
      { pid: child.pid, started: expect.any(String), ticket: 'PROJ-1', kind: 'agent' }
    ]);

    expect(await p.stop('PROJ-1')).toEqual([]);
    expect(await startTime(child.pid!)).toBeNull();
    expect(await startTime(grandchild)).toBeNull();
    expect(await readJson<Entry[]>(file, [])).toEqual([]);
    expect(events).toContain('process.stopped');
  });

  it('reap kills what a crashed service left, but not a reused pid', async () => {
    const file = join(dir(), 'processes.json');
    const { spawn } = await import('node:child_process');
    const orphan = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    const started = (await startTime(orphan.pid!))!;
    await writeJson(file, [
      { pid: orphan.pid, started, ticket: 'PROJ-1', kind: 'agent' },
      { pid: process.pid, started: 'Thu Jan  1 00:00:00 1970', ticket: 'PROJ-2', kind: 'agent' }
    ]);
    const killed = await new Processes(file).reap();
    expect(killed.map((e) => e.pid)).toEqual([orphan.pid]);
    await new Promise((r) => setTimeout(r, 200));
    expect(await startTime(orphan.pid!)).toBeNull();
    expect(await startTime(process.pid)).not.toBeNull();
  });
});
