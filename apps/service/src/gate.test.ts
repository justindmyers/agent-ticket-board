import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGate, type Exec } from './gate';

const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe'
  });

/** A bare origin with one commit on main, and a clone with a feature branch of one commit. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'atb-gate-'));
  const origin = join(root, 'origin.git');
  const wt = join(root, 'wt');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', 'main');
  git(root, 'clone', origin, wt);
  writeFileSync(join(wt, 'base.txt'), 'base\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-m', 'base');
  git(wt, 'push', 'origin', 'HEAD:main');
  git(wt, 'checkout', '-b', 'feature');
  writeFileSync(join(wt, 'a.ts'), 'a\n');
  writeFileSync(join(wt, 'a.test.ts'), 'a\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-m', 'feature');
  /** Another developer's change on main. */
  const advance = (file: string, text: string) => {
    const other = mkdtempSync(join(tmpdir(), 'atb-other-'));
    git(root, 'clone', origin, other);
    writeFileSync(join(other, file), text);
    git(other, 'add', '.');
    git(other, 'commit', '-m', 'main moves');
    git(other, 'push', 'origin', 'HEAD:main');
  };
  return { wt, advance };
}

/** The shell in the worktree, with a record of the commands that ran. */
const shell =
  (cwd: string, ran: string[], failing: string[] = []): Exec =>
  async (cmd) => {
    ran.push(cmd);
    if (failing.some((f) => cmd.includes(f))) {
      return { code: 1, out: `error in ${cmd}` };
    }
    const r = spawnSync('sh', ['-c', cmd], { cwd, encoding: 'utf8' });
    return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
  };

const input = (wt: string, ran: string[], o: Partial<Parameters<typeof runGate>[0]> = {}) => ({
  checks: ['echo types', 'echo lint {changed}', 'echo test {tests}'],
  base: 'main',
  testMock: null,
  exec: shell(wt, ran),
  now: () => 'now',
  ...o
});

describe('runGate', () => {
  it('runs the checks in order with the changed files, and merges nothing when main did not move', async () => {
    const { wt } = repo();
    const ran: string[] = [];
    const g = await runGate(input(wt, ran));
    expect(g.ok).toBe(true);
    expect(g.merged).toBe(false);
    expect(ran.filter((c) => c.startsWith('echo'))).toEqual([
      'echo types',
      "echo lint 'a.test.ts' 'a.ts'",
      "echo test 'a.test.ts'"
    ]);
    expect(g.steps.at(-1)).toMatchObject({
      name: 'Merge origin/main',
      note: 'Already up to date.'
    });
  });

  it('merges main, never rebases, and runs the checks again after a merge that brought changes', async () => {
    const { wt, advance } = repo();
    advance('other.txt', 'other\n');
    const ran: string[] = [];
    const g = await runGate(input(wt, ran));
    expect(g.ok).toBe(true);
    expect(g.merged).toBe(true);
    expect(ran.filter((c) => c === 'echo types')).toHaveLength(2);
    expect(ran.join('\n')).not.toMatch(/rebase|--no-verify/);
    expect(g.steps.map((s) => s.name)).toContain('echo types (after the merge)');
    expect(git(wt, 'log', '--merges', '--oneline')).toMatch(/Merge/);
  });

  it('stops at the first failing check, and runs nothing after it', async () => {
    const { wt } = repo();
    const ran: string[] = [];
    const g = await runGate(input(wt, ran, { exec: shell(wt, ran, ['echo lint']) }));
    expect(g.ok).toBe(false);
    expect(g.steps.at(-1)).toMatchObject({ ok: false });
    expect(ran.some((c) => c.startsWith('echo test'))).toBe(false);
    expect(ran.some((c) => c.startsWith('git merge'))).toBe(false);
  });

  it('undoes a merge that conflicts, and says so', async () => {
    const { wt, advance } = repo();
    advance('a.ts', 'conflict\n');
    const ran: string[] = [];
    const g = await runGate(input(wt, ran));
    expect(g.ok).toBe(false);
    expect(g.steps.at(-1)).toMatchObject({ name: 'Merge origin/main', ok: false });
    expect(g.steps.at(-1)?.note).toMatch(/undone/);
    expect(git(wt, 'status', '--porcelain')).toBe('');
  });

  it('refuses a worktree with uncommitted changes, before it runs a check', async () => {
    const { wt } = repo();
    writeFileSync(join(wt, 'dirty.ts'), 'x');
    const ran: string[] = [];
    const g = await runGate(input(wt, ran));
    expect(g.ok).toBe(false);
    expect(g.steps).toHaveLength(1);
    expect(g.steps[0]).toMatchObject({ name: 'Clean worktree', ok: false });
    expect(ran.some((c) => c.startsWith('echo'))).toBe(false);
  });

  it('adds the test files that mock a whole package, and skips a list with no files', async () => {
    const { wt } = repo();
    git(wt, 'rm', '-q', 'a.test.ts');
    writeFileSync(join(wt, 'old.test.ts'), "vi.mock('@shared/pkg');\n");
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'move tests');
    git(wt, 'rm', '-q', 'old.test.ts');
    git(wt, 'commit', '-m', 'drop');
    writeFileSync(join(wt, 'mocker.test.ts'), "vi.mock('@shared/pkg');\n");
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'mocker');
    const ran: string[] = [];
    const g = await runGate(
      input(wt, ran, { checks: ['echo test {tests}'], testMock: '@shared/pkg' })
    );
    expect(g.ok).toBe(true);
    expect(ran).toContain("echo test 'mocker.test.ts'");

    git(wt, 'rm', '-q', 'mocker.test.ts');
    git(wt, 'commit', '-m', 'no tests');
    const none = await runGate(input(wt, [], { checks: ['echo x {tests}'], testMock: null }));
    expect(none.ok).toBe(true);
    expect(none.steps.find((x) => x.name === 'echo x {tests}')?.note).toBe(
      'No changed test files.'
    );
  });
});

describe('runGate after the checks passed before the commits', () => {
  /** An uncommitted change: an edited file and a new file. */
  function uncommitted() {
    const r = repo();
    writeFileSync(join(r.wt, 'a.ts'), 'edited\n');
    writeFileSync(join(r.wt, 'b.ts'), 'new\n');
    return r;
  }
  const commitAll = (wt: string) => {
    git(wt, 'add', 'a.ts');
    git(wt, 'commit', '-m', 'one');
    git(wt, 'add', 'b.ts');
    git(wt, 'commit', '-m', 'two');
  };

  it('records a fingerprint of the content that the checks passed on, with new files in it', async () => {
    const { wt } = uncommitted();
    const g = await runGate(input(wt, [], { verify: true }));
    expect(g).toMatchObject({ ok: true, verify: true });
    expect(g.tree).toMatch(/^[0-9a-f]{40}$/);
    const withoutNew = await runGate(input(wt, [], { verify: true }));
    writeFileSync(join(wt, 'b.ts'), 'changed again\n');
    const again = await runGate(input(wt, [], { verify: true }));
    expect(withoutNew.tree).toBe(g.tree);
    expect(again.tree).not.toBe(g.tree);
  });

  it('skips the repeat pass when the commits hold the same content, whatever way they split it', async () => {
    const { wt } = uncommitted();
    const verified = await runGate(input(wt, [], { verify: true }));
    commitAll(wt);
    const ran: string[] = [];
    const g = await runGate(input(wt, ran, { verifiedTree: verified.tree }));
    expect(g.ok).toBe(true);
    expect(ran.some((c) => c.startsWith('echo'))).toBe(false);
    expect(g.steps.map((s) => s.name)).toEqual([
      'Clean worktree',
      'Fetch origin/main',
      'Checks before the merge',
      'Merge origin/main'
    ]);
    expect(g.steps[2]!.note).toMatch(/Skipped: they passed on this exact content/);
  });

  it('runs the checks when the code changed after they passed', async () => {
    const { wt } = uncommitted();
    const verified = await runGate(input(wt, [], { verify: true }));
    writeFileSync(join(wt, 'b.ts'), 'a late edit\n');
    commitAll(wt);
    const ran: string[] = [];
    const g = await runGate(input(wt, ran, { verifiedTree: verified.tree }));
    expect(ran.filter((c) => c.startsWith('echo'))).toHaveLength(3);
    expect(g.steps.map((s) => s.name)).not.toContain('Checks before the merge');
  });

  it('runs the checks when nothing passed before', async () => {
    const { wt } = uncommitted();
    commitAll(wt);
    const ran: string[] = [];
    await runGate(input(wt, ran, { verifiedTree: null }));
    expect(ran.filter((c) => c.startsWith('echo'))).toHaveLength(3);
  });

  it('still runs the checks after a merge that brings changes, and only then', async () => {
    const { wt, advance } = uncommitted();
    const verified = await runGate(input(wt, [], { verify: true }));
    commitAll(wt);
    advance('other.txt', 'x\n');
    const ran: string[] = [];
    const g = await runGate(input(wt, ran, { verifiedTree: verified.tree }));
    expect(g.merged).toBe(true);
    expect(ran.filter((c) => c.startsWith('echo'))).toHaveLength(3);
    expect(g.steps.map((s) => s.name)).toEqual([
      'Clean worktree',
      'Fetch origin/main',
      'Checks before the merge',
      'Merge origin/main',
      'echo types (after the merge)',
      'echo lint {changed} (after the merge)',
      'echo test {tests} (after the merge)'
    ]);
  });
});
