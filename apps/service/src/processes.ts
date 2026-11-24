import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { promisify } from 'node:util';
import { readJson, writeJson } from '@agent-ticket-board/core';

// Every child of the service runs in its own process group and is recorded with a fingerprint
// (its start time). Stop kills the groups; a new service kills what a crashed one left behind.

export type Kind = 'agent' | 'setup' | 'dev-server' | 'browser';
export type Entry = { pid: number; started: string; ticket: string; kind: Kind };

const sh = promisify(execFile);

/** The start time that `ps` reports for a pid, or null when the process is gone. */
export async function startTime(pid: number): Promise<string | null> {
  try {
    const { stdout } = await sh('ps', ['-o', 'lstart=', '-p', String(pid)]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

const killGroup = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group is gone already.
  }
};

export class Processes {
  private live = new Map<number, Entry>();

  constructor(
    private file: string,
    /** Called for each process event, for the audit log. */
    private onEvent: (e: Entry, type: string, data?: Record<string, unknown>) => void = () =>
      undefined
  ) {}

  private pending: Promise<unknown> = Promise.resolve();

  /** Starts a command in a new process group and records it. The record is written in the background. */
  spawn(cmd: string, args: string[], opts: SpawnOptions, ticket: string, kind: Kind): ChildProcess {
    const child = spawn(cmd, args, { ...opts, detached: true });
    const pid = child.pid;
    if (pid === undefined) {
      return child;
    }
    const entry: Entry = { pid, started: '', ticket, kind };
    this.live.set(pid, entry);
    this.pending = this.pending.then(async () => {
      entry.started = (await startTime(pid)) ?? '';
      await this.save();
    });
    child.once('exit', (code, signal) => {
      this.onEvent(entry, 'process.exited', { code, signal });
      killGroup(pid, 'SIGTERM');
      this.live.delete(pid);
      this.pending = this.pending.then(() => this.save());
    });
    return child;
  }

  /** Waits until the process records on disk are up to date. */
  settled() {
    return this.pending;
  }

  list() {
    return [...this.live.values()];
  }

  /** Kills the groups (all, or one ticket's), waits, and returns the pids that are still alive. */
  async stop(ticket?: string, waitMs = 3000): Promise<number[]> {
    const targets = this.list().filter((e) => !ticket || e.ticket === ticket);
    targets.forEach((e) => killGroup(e.pid, 'SIGTERM'));
    const until = Date.now() + waitMs;
    let left = targets;
    while (left.length && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      left = (
        await Promise.all(left.map(async (e) => ((await startTime(e.pid)) ? e : null)))
      ).filter((e): e is Entry => e !== null);
    }
    targets.forEach((e) => this.onEvent(e, 'process.stopped', { forced: left.includes(e) }));
    left.forEach((e) => killGroup(e.pid, 'SIGKILL'));
    targets.forEach((e) => this.live.delete(e.pid));
    await this.save();
    return left.map((e) => e.pid);
  }

  /** Kills the groups that an earlier service recorded, if the same processes still run. */
  async reap(): Promise<Entry[]> {
    const old = await readJson<Entry[]>(this.file, []);
    const killed: Entry[] = [];
    for (const e of old) {
      if (e.started && (await startTime(e.pid)) === e.started) {
        killGroup(e.pid, 'SIGKILL');
        this.onEvent(e, 'process.reaped', { reason: 'left by an earlier service' });
        killed.push(e);
      }
    }
    await this.save();
    return killed;
  }

  private save() {
    return writeJson(this.file, this.list());
  }
}
