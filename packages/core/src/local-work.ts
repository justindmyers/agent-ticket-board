import { basename } from 'node:path';
import { CONFIG } from './config';
import { readJson, writeJson } from './files';
import { IGNORED_FILE } from './paths';
import { run as gitRun, type Run } from './detect';

/** Work for a ticket that exists on this machine: a branch, and the uncommitted files in its worktree. */
export type LocalWork = { branch: string; worktree: string | null; changed: number };

const keyIn = (key: string, branch: string) =>
  new RegExp(`(^|[^a-z0-9])${key.replace(/[^a-z0-9]/gi, '\\$&')}([^0-9]|$)`, 'i').test(branch);

const lines = (s: string) => s.split('\n').filter(Boolean);

/** Map of each worktree's branch to its folder, from `git worktree list --porcelain`. */
function worktrees(porcelain: string) {
  const out = new Map<string, string>();
  let dir = '';
  for (const line of lines(porcelain)) {
    if (line.startsWith('worktree ')) {
      dir = line.slice('worktree '.length);
    } else if (line.startsWith('branch refs/heads/')) {
      out.set(line.slice('branch refs/heads/'.length), dir);
    }
  }
  return out;
}

/** Reads git only: no fetch, no writes. A missing repo or a git error gives no local work. */
export async function findLocalWork(
  repo: string | null,
  keys: string[],
  run: Run
): Promise<Record<string, LocalWork>> {
  if (!repo || !keys.length) {
    return {};
  }
  try {
    const [wt, refs] = await Promise.all([
      run('git', ['worktree', 'list', '--porcelain'], repo),
      run('git', ['for-each-ref', 'refs/heads', '--format=%(refname:short)'], repo)
    ]);
    const dirs = worktrees(wt);
    const branches = lines(refs);
    const found = await Promise.all(
      keys.map(async (key) => {
        const mine = branches.filter((b) => keyIn(key, b));
        if (!mine.length) {
          return null;
        }
        // Prefer the branch that is checked out in a worktree: that is where the work happens.
        const branch = mine.find((b) => dirs.has(b)) ?? mine[0];
        const dir = dirs.get(branch);
        const changed = dir ? lines(await run('git', ['status', '--porcelain'], dir)).length : 0;
        return [key, { branch, worktree: dir ?? null, changed }] as const;
      })
    );
    return Object.fromEntries(found.filter((f) => f !== null));
  } catch {
    return {};
  }
}

export function localLabel(w: LocalWork) {
  if (!w.worktree) {
    return `Branch ${w.branch}, no worktree`;
  }
  const files = w.changed
    ? `${w.changed} changed ${w.changed === 1 ? 'file' : 'files'}`
    : 'no changes to commit';
  return `Worktree ${basename(w.worktree)}, ${files}`;
}

/** Branches the developer chose to ignore, per ticket key. A new branch shows again. */
export const ignoredWork = () => readJson<Record<string, string>>(IGNORED_FILE, {});

export async function ignoreWork(key: string) {
  const w = LOCAL[key];
  if (!w) {
    throw new Error(`${key}: no local work to ignore.`);
  }
  await writeJson(IGNORED_FILE, { ...(await ignoredWork()), [key]: w.branch });
  delete LOCAL[key];
}

/** The last local work found, per ticket key. Clients read it like PRS. */
export const LOCAL: Record<string, LocalWork> = {};

export async function refreshLocalWork(keys: string[], run: Run = gitRun) {
  const [found, ignored] = await Promise.all([
    findLocalWork(CONFIG.repo.path, keys, run),
    ignoredWork()
  ]);
  for (const k of keys) {
    delete LOCAL[k];
    if (found[k] && ignored[k] !== found[k].branch) {
      LOCAL[k] = found[k];
    }
  }
  return LOCAL;
}

/** The local work with its sentence, in the shape every client receives. */
export const localView = (key: string) => {
  const w = LOCAL[key];
  return w ? { ...w, label: localLabel(w) } : null;
};
