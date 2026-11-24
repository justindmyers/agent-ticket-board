import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planBase } from './plan-base';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8'
  });

/** A remote with a main branch, and a checkout of it that is on another branch with local changes. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'atb-base-'));
  const remote = join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  const repo = join(root, 'repo');
  git(root, 'clone', '-q', remote, repo);
  writeFileSync(join(repo, 'a.txt'), 'v1');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'v1');
  git(repo, 'push', '-q', 'origin', 'HEAD:main');
  git(repo, 'checkout', '-qb', 'feature/other');
  writeFileSync(join(repo, 'a.txt'), 'local change');
  // Someone else pushes to main: the checkout does not have it yet.
  const other = join(root, 'other');
  git(root, 'clone', '-q', remote, other);
  writeFileSync(join(other, 'a.txt'), 'v2 on main');
  git(other, 'commit', '-qam', 'v2');
  git(other, 'push', '-q', 'origin', 'main');
  return { root, repo };
}

describe('planBase', () => {
  it("is a read-only copy of the remote's main branch, not the developer's checkout", async () => {
    const { root, repo } = setup();
    const dir = join(root, 'base');
    expect(await planBase(repo, dir)).toBe(dir);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('v2 on main');
    // The checkout is untouched: its branch and its change stay.
    expect(git(repo, 'branch', '--show-current').trim()).toBe('feature/other');
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('local change');
    expect(git(repo, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
  });
  it('is up to date again before the next plan', async () => {
    const { root, repo } = setup();
    const dir = join(root, 'base');
    await planBase(repo, dir);
    writeFileSync(join(dir, 'stray.txt'), 'x');
    const other = join(root, 'other');
    writeFileSync(join(other, 'a.txt'), 'v3 on main');
    git(other, 'commit', '-qam', 'v3');
    git(other, 'push', '-q', 'origin', 'main');
    await planBase(repo, dir);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('v3 on main');
    expect(existsSync(join(dir, 'stray.txt'))).toBe(false);
  });
});
