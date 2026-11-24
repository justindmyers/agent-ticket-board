import { spawn, type SpawnOptions } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { run as gitRun, type Run } from './detect';
import type { Ticket } from './types';

// The worktree for a ticket: its branch name from the configured template, and the folder that the
// configured script makes (contract: `<script> <branch> <folder>`, run in the repository).

const FIX_TYPES = /^(bug|defect|incident|hotfix)$/i;

/** A short branch slug: lower case words, at most 32 characters, cut at a word boundary. */
export function slugOf(summary: string, max = 32) {
  const words = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let out = '';
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > max) {
      break;
    }
    out = next;
  }
  return out || words[0]?.slice(0, max) || 'work';
}

/** The branch for a ticket: {type} is fix for bugs and feature for everything else. */
export function branchName(t: Ticket, template: string) {
  return template
    .replaceAll('{type}', FIX_TYPES.test(t.type) ? 'fix' : 'feature')
    .replaceAll('{key}', t.key)
    .replaceAll('{slug}', slugOf(t.summary));
}

/** The worktree folder: next to the repository, named after it and the branch. */
export function worktreePath(repo: string, branch: string) {
  return join(dirname(repo), `${basename(repo)}-${branch.replaceAll('/', '-')}`);
}

export type Spawn = (cmd: string, args: string[], opts: SpawnOptions) => ReturnType<typeof spawn>;

type Args = {
  repo: string;
  script: string | null;
  branch: string;
  /** The base for `git worktree add` when no script is set. */
  base?: string;
  /** Each chunk of the script's output, for the audit log. */
  log: (chunk: string) => void;
  spawn?: Spawn;
  run?: Run;
};

/** Finds the worktree that has the branch, or makes it with the script (or git). */
export async function ensureWorktree(
  a: Args
): Promise<{ path: string; branch: string; made: boolean }> {
  const run = a.run ?? gitRun;
  const existing = await findWorktree(a.repo, a.branch, run);
  if (existing) {
    return { path: existing, branch: a.branch, made: false };
  }
  const path = worktreePath(a.repo, a.branch);
  const [cmd, args] = a.script
    ? ['/bin/sh', ['-c', `${a.script} "$1" "$2"`, 'worktree', a.branch, path]]
    : ['git', ['worktree', 'add', '-b', a.branch, path, a.base ?? 'origin/main']];
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = (a.spawn ?? spawn)(cmd, args as string[], {
      cwd: a.repo,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', (d) => a.log(String(d)));
    child.stderr?.on('data', (d) => a.log(String(d)));
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) {
    throw new Error(
      `The worktree script stopped with exit code ${code}. See the run's worktree.log.`
    );
  }
  const made = await findWorktree(a.repo, a.branch, run);
  if (!made) {
    throw new Error(`The worktree script ended, but git has no worktree for ${a.branch}.`);
  }
  return { path: made, branch: a.branch, made: true };
}

async function findWorktree(repo: string, branch: string, run: Run) {
  const out = await run('git', ['worktree', 'list', '--porcelain'], repo).catch(() => '');
  let path: string | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      path = line.slice(9);
    } else if (line === `branch refs/heads/${branch}` && path) {
      return path;
    }
  }
  return null;
}
