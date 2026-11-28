import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG,
  loadFlow,
  pushLinks,
  readTimeline,
  saveFlow,
  type Flow
} from '@agent-ticket-board/core';
import { describe, expect, it } from 'vitest';
import { doPush, gitIn, planPush, type Git } from './push';

const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe'
  }).trim();

let n = 100;

/** A bare origin with main, and a worktree on a branch with two commits that the gate checked. */
async function ticket(o: { track?: boolean; gate?: 'ok' | 'failed' | 'old' } = {}) {
  const key = `PUSH-${n++}`;
  const root = mkdtempSync(join(tmpdir(), 'atb-push-'));
  const origin = join(root, 'origin.git');
  const wt = join(root, 'wt');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', 'main');
  git(root, 'clone', origin, wt);
  writeFileSync(join(wt, 'base.txt'), 'base\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-m', 'base');
  git(wt, 'push', 'origin', 'HEAD:main');
  git(wt, 'checkout', '-b', 'feature/PUSH-1-edge');
  if (o.track) {
    git(wt, 'branch', '--set-upstream-to=origin/main');
  }
  for (const f of ['a.ts', 'b.ts']) {
    writeFileSync(join(wt, f), `${f}\n`);
    git(wt, 'add', f);
    git(wt, 'commit', '-m', `add ${f}`);
  }
  const head = git(wt, 'rev-parse', 'HEAD');
  CONFIG.repo.baseBranch = 'main';
  const flow: Flow = {
    stage: 'code-review',
    worktree: wt,
    gate: {
      at: 'n',
      ok: o.gate !== 'failed',
      merged: false,
      steps: [],
      ...(o.gate === 'old' ? {} : { head })
    }
  };
  await saveFlow(key, flow);
  const remote = (ref: string) => {
    try {
      return git(origin, 'rev-parse', '--verify', '-q', ref);
    } catch {
      return null;
    }
  };
  const other = (branch: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'atb-other-'));
    git(root, 'clone', origin, dir);
    git(dir, 'checkout', '-b', branch);
    writeFileSync(join(dir, 'x.txt'), 'x\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'somebody else');
    git(dir, 'push', 'origin', `HEAD:${branch}`);
  };
  return { key, wt, head, remote, other };
}

/** A git runner that records the arguments. */
const spy = (calls: string[][]) => (cwd: string) => {
  const run = gitIn(cwd);
  const g: Git = (args) => {
    calls.push(args);
    return run(args);
  };
  return g;
};

describe('planPush', () => {
  it('shows the branch, the commits, the command and a dry run, and pushes nothing', async () => {
    const t = await ticket();
    const f = await planPush(t.key);
    expect(f.push).toMatchObject({
      branch: 'feature/PUSH-1-edge',
      head: t.head,
      command: 'git push origin HEAD:feature/PUSH-1-edge'
    });
    expect(f.push?.commits).toHaveLength(2);
    expect(f.push?.commits[0]).toMatchObject({ title: 'add b.ts' });
    expect(f.push?.commits[0]?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(f.push?.commits[0]?.short).toMatch(/^[0-9a-f]{7,}$/);
    expect(f.need?.ask).toBe('Ready to push 2 commits to origin as feature/PUSH-1-edge.');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['approvePush', 'openWorktree']);
    expect(t.remote('refs/heads/feature/PUSH-1-edge')).toBeNull();
    expect((await readTimeline(t.key)).find((e) => e.type === 'push.planned')).toMatchObject({
      branch: 'feature/PUSH-1-edge',
      commits: 2
    });
  });

  it('refuses the base branch, a dirty tree, and checks that did not pass for this commit', async () => {
    const onMain = await ticket();
    git(onMain.wt, 'checkout', '-B', 'main');
    await expect(planPush(onMain.key)).rejects.toThrow(/is the base branch \(main\)/);

    const dirty = await ticket();
    writeFileSync(join(dirty.wt, 'loose.ts'), 'x\n');
    await expect(planPush(dirty.key)).rejects.toThrow(/Commit or discard these changes first/);

    const failed = await ticket({ gate: 'failed' });
    await expect(planPush(failed.key)).rejects.toThrow(/checks before the push have not passed/);

    const old = await ticket({ gate: 'old' });
    await expect(planPush(old.key)).rejects.toThrow(/changed after the checks passed/);

    const later = await ticket();
    writeFileSync(join(later.wt, 'c.ts'), 'c\n');
    git(later.wt, 'add', 'c.ts');
    git(later.wt, 'commit', '-m', 'after the checks');
    await expect(planPush(later.key)).rejects.toThrow(/changed after the checks passed/);
  });

  it('says so when the push would be rejected, and pushes nothing', async () => {
    const t = await ticket();
    t.other('feature/PUSH-1-edge');
    const before = t.remote('refs/heads/feature/PUSH-1-edge');
    await expect(planPush(t.key)).rejects.toThrow(/The push would fail. Nothing was pushed/);
    expect(t.remote('refs/heads/feature/PUSH-1-edge')).toBe(before);
    expect((await loadFlow(t.key))?.push).toBeUndefined();
  });
});

describe('doPush', () => {
  it('pushes the commit that the developer saw to its own branch, and records it', async () => {
    const t = await ticket();
    await planPush(t.key);
    const f = await doPush(t.key);
    expect(t.remote('refs/heads/feature/PUSH-1-edge')).toBe(t.head);
    expect(f.push?.pushedAt).toBeDefined();
    expect(f.need?.ask).toBe(`Pushed feature/PUSH-1-edge to origin (${t.head.slice(0, 7)}).`);
    expect((await readTimeline(t.key)).find((e) => e.type === 'push.done')).toMatchObject({
      branch: 'feature/PUSH-1-edge'
    });
    await expect(doPush(t.key)).rejects.toThrow(/was pushed already/);
  });

  it('never writes to the base branch, also when the branch tracks it', async () => {
    const t = await ticket({ track: true });
    const mainBefore = t.remote('refs/heads/main');
    await planPush(t.key);
    await doPush(t.key);
    expect(t.remote('refs/heads/main')).toBe(mainBefore);
    expect(t.remote('refs/heads/feature/PUSH-1-edge')).toBe(t.head);
  });

  it('needs the dry run first', async () => {
    const t = await ticket();
    await expect(doPush(t.key)).rejects.toThrow(/Preview the push first/);
    expect(t.remote('refs/heads/feature/PUSH-1-edge')).toBeNull();
  });

  it('refuses when the branch is not the one that the developer saw', async () => {
    const t = await ticket();
    await planPush(t.key);
    writeFileSync(join(t.wt, 'c.ts'), 'c\n');
    git(t.wt, 'add', 'c.ts');
    git(t.wt, 'commit', '-m', 'a new commit');
    const f = (await loadFlow(t.key))!;
    // The checks ran again on the new commit: only the dry run is out of date.
    await saveFlow(t.key, { ...f, gate: { ...f.gate!, head: git(t.wt, 'rev-parse', 'HEAD') } });
    await expect(doPush(t.key)).rejects.toThrow(/branch changed after you looked at the push/);
    expect(t.remote('refs/heads/feature/PUSH-1-edge')).toBeNull();
  });

  it('uses exactly git push origin HEAD:<branch>: no force, no --no-verify, no bare push', async () => {
    const t = await ticket();
    const calls: string[][] = [];
    await planPush(t.key, spy(calls));
    await doPush(t.key, spy(calls));
    const pushes = calls.filter((a) => a[0] === 'push');
    expect(pushes).toEqual([
      ['push', 'origin', 'HEAD:feature/PUSH-1-edge', '--dry-run'],
      ['push', 'origin', 'HEAD:feature/PUSH-1-edge']
    ]);
    const all = pushes.flat().join(' ');
    expect(all).not.toMatch(/--force|--no-verify|(^| )-f( |$)|--delete|--mirror/);
  });
});

describe('the address of the repository, for the links', () => {
  /** A runner that says the remote is on GitHub: the test origin is a folder. */
  const onGithub = (cwd: string): Git => {
    const run = gitIn(cwd);
    return async (args) =>
      args[0] === 'remote' && args[1] === 'get-url'
        ? { code: 0, out: 'https://user:secret@github.com/org/repo.git\n' }
        : run(args);
  };

  it('records the address in the preview, without credentials, and links only after the push', async () => {
    const t = await ticket();
    const planned = await planPush(t.key, onGithub);
    expect(planned.push?.url).toBe('https://github.com/org/repo');
    expect(JSON.stringify(planned.push)).not.toMatch(/secret/);
    expect(pushLinks(planned.push)).toBeNull();
    const done = await doPush(t.key, onGithub);
    const l = pushLinks(done.push)!;
    expect(l.branch).toBe('https://github.com/org/repo/tree/feature/PUSH-1-edge');
    expect(l.commit(done.push!.commits[0]!.sha)).toContain('/commit/');
  });

  it('takes the address at the push when the preview came from a build that did not record it', async () => {
    const t = await ticket();
    await planPush(t.key);
    const f = (await loadFlow(t.key))!;
    expect(f.push?.url).toBeUndefined();
    const done = await doPush(t.key, onGithub);
    expect(done.push?.url).toBe('https://github.com/org/repo');
  });

  it('records no address for a remote that is not on GitHub', async () => {
    const t = await ticket();
    const f = await planPush(t.key);
    expect(f.push?.url).toBeUndefined();
  });
});
