import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, realpathSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { branchName, ensureWorktree, slugOf, worktreePath } from './worktree';
import type { Ticket } from './types';

const ticket = (type: string, summary: string): Ticket => ({
  key: 'PROJ-7',
  summary,
  status: 'To Do',
  type,
  priority: 'Medium',
  labels: [],
  points: null,
  updated: null
});

describe('branchName', () => {
  it('fills the template: feature for most types, fix for bugs', () => {
    expect(branchName(ticket('Story', 'Sort cameras by zone count!'), '{type}/{key}-{slug}')).toBe(
      'feature/PROJ-7-sort-cameras-by-zone-count'
    );
    expect(branchName(ticket('Bug', 'Back loses the view'), '{type}/{key}-{slug}')).toBe(
      'fix/PROJ-7-back-loses-the-view'
    );
    expect(branchName(ticket('Task', 'x'), '{key}')).toBe('PROJ-7');
  });

  it('keeps the slug short, at a word boundary', () => {
    expect(slugOf('Edge update controls in the edge management page for every site and zone')).toBe(
      'edge-update-controls-in-the-edge'
    );
  });
});

describe('worktreePath', () => {
  it('is a folder next to the repository, named after the repository and the branch', () => {
    expect(worktreePath('/code/example-app', 'feature/PROJ-7-x')).toBe(
      '/code/example-app-feature-PROJ-7-x'
    );
  });
});

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'atb-wt-'));
  const dir = join(root, 'app');
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  execFileSync('mkdir', ['-p', dir]);
  git('init', '-q', '-b', 'main');
  git(
    '-c',
    'user.email=a@example.com',
    '-c',
    'user.name=A',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init'
  );
  // A worktree script with the same contract as the developer's: <branch> <path>.
  writeFileSync(
    join(dir, 'wt.sh'),
    '#!/bin/sh\ngit worktree add -q -b "$1" "$2" main\necho made "$2"\n'
  );
  chmodSync(join(dir, 'wt.sh'), 0o755);
  return dir;
}

describe('ensureWorktree', () => {
  it('runs the worktree script with the branch and the folder, then checks the result', async () => {
    const dir = repo();
    const out: string[] = [];
    const wt = await ensureWorktree({
      repo: dir,
      script: './wt.sh',
      branch: 'feature/PROJ-7-x',
      log: (l) => out.push(l)
    });
    // git reports the real path (/private/var on macOS for /var).
    expect({ ...wt, path: realpathSync(wt.path) }).toEqual({
      path: realpathSync(worktreePath(dir, 'feature/PROJ-7-x')),
      branch: 'feature/PROJ-7-x',
      made: true
    });
    expect(existsSync(wt.path)).toBe(true);
    expect(out.join('')).toContain('made');
  });

  it('uses the worktree that has the branch already, and runs nothing', async () => {
    const dir = repo();
    await ensureWorktree({
      repo: dir,
      script: './wt.sh',
      branch: 'feature/PROJ-7-x',
      log: () => undefined
    });
    const again = await ensureWorktree({
      repo: dir,
      script: './missing.sh',
      branch: 'feature/PROJ-7-x',
      log: () => undefined
    });
    expect(again.made).toBe(false);
  });

  it('says what failed when the script fails or makes no worktree', async () => {
    const dir = repo();
    writeFileSync(join(dir, 'bad.sh'), '#!/bin/sh\necho nope >&2\nexit 3\n');
    chmodSync(join(dir, 'bad.sh'), 0o755);
    await expect(
      ensureWorktree({
        repo: dir,
        script: './bad.sh',
        branch: 'feature/PROJ-8',
        log: () => undefined
      })
    ).rejects.toThrow(/exit code 3/);
    writeFileSync(join(dir, 'noop.sh'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'noop.sh'), 0o755);
    await expect(
      ensureWorktree({
        repo: dir,
        script: './noop.sh',
        branch: 'feature/PROJ-9',
        log: () => undefined
      })
    ).rejects.toThrow(/no worktree for feature\/PROJ-9/);
  });

  it('makes the worktree with git when no script is set', async () => {
    const dir = repo();
    const wt = await ensureWorktree({
      repo: dir,
      script: null,
      branch: 'fix/PROJ-10',
      base: 'main',
      log: () => undefined
    });
    expect(wt.made).toBe(true);
    expect(existsSync(wt.path)).toBe(true);
  });
});
