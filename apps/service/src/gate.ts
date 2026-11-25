import { expandCommand, isTestFile, type Gate } from '@agent-ticket-board/core';

// The pre-push gate. It runs the checks of the repository in the order of its config, merges the
// base branch (never a rebase), and runs the checks again when the merge changed anything. It
// stops at the first step that fails. The shell runs every command in the worktree.

export type Exec = (cmd: string, heavy: boolean) => Promise<{ code: number; out: string }>;

export type GateInput = {
  checks: string[];
  base: string;
  testMock: string | null;
  exec: Exec;
  /** Called before each step starts, for the activity line. */
  step?: (name: string) => void;
  now: () => string;
};

/** The last lines of a command's output: the error is at the end. */
const tail = (out: string, n = 12) => out.trim().split('\n').slice(-n).join('\n').slice(-1200);

export async function runGate(i: GateInput): Promise<Gate> {
  const steps: Gate['steps'] = [];
  const git = (cmd: string) => i.exec(`git ${cmd}`, false);
  const done = (merged: boolean): Gate => ({
    at: i.now(),
    ok: steps.every((s) => s.ok),
    merged,
    steps
  });
  const step = async (name: string, run: () => Promise<{ ok: boolean; note?: string }>) => {
    i.step?.(name);
    const r = await run();
    steps.push({ name, ok: r.ok, ...(r.note ? { note: r.note } : {}) });
    return r.ok;
  };
  const base = `origin/${i.base}`;

  const dirty = await git('status --porcelain');
  if (
    !(await step('Clean worktree', async () =>
      dirty.out.trim()
        ? { ok: false, note: `Commit or discard these changes first:\n${tail(dirty.out)}` }
        : { ok: true }
    ))
  ) {
    return done(false);
  }
  if (
    !(await step(`Fetch ${base}`, async () => {
      const r = await git(`fetch origin ${i.base}`);
      return r.code ? { ok: false, note: tail(r.out) } : { ok: true };
    }))
  ) {
    return done(false);
  }

  const files = async () => {
    const diff = await git(`diff --name-only --diff-filter=d ${base}...HEAD`);
    const changed = diff.out.split('\n').filter(Boolean);
    const tests = changed.filter(isTestFile);
    if (i.testMock) {
      const hit = await git(`grep -l -F -e ${JSON.stringify(i.testMock)} -- '*.test.*' '*.spec.*'`);
      for (const p of hit.code === 0 ? hit.out.split('\n').filter(Boolean) : []) {
        if (!tests.includes(p)) {
          tests.push(p);
        }
      }
    }
    return { changed, tests };
  };

  const runChecks = async (suffix: string) => {
    const lists = await files();
    for (const cmd of i.checks) {
      const name = cmd + suffix;
      const x = expandCommand(cmd, lists);
      const ok = await step(name, async () => {
        if ('skip' in x) {
          return { ok: true, note: x.skip };
        }
        const r = await i.exec(x.run, true);
        return r.code ? { ok: false, note: tail(r.out) } : { ok: true };
      });
      if (!ok) {
        return false;
      }
    }
    return true;
  };

  if (!(await runChecks(''))) {
    return done(false);
  }

  const before = (await git('rev-parse HEAD')).out.trim();
  const merge = await step(`Merge ${base}`, async () => {
    const r = await git(`merge --no-edit ${base}`);
    if (r.code) {
      await git('merge --abort');
      return { ok: false, note: `The merge stopped. It is undone.\n${tail(r.out)}` };
    }
    return { ok: true };
  });
  if (!merge) {
    return done(false);
  }
  const merged = (await git('rev-parse HEAD')).out.trim() !== before;
  if (merged) {
    steps[steps.length - 1]!.note = 'The merge brought changes: the checks run again.';
    if (!(await runChecks(' (after the merge)'))) {
      return done(true);
    }
  } else {
    steps[steps.length - 1]!.note = 'Already up to date.';
  }
  return done(merged);
}
