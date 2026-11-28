import { CONFIG } from './config';
import { run as gitRun, type Run } from './detect';
import { runActive } from './look';
import type { Flow, Seen } from './types';

// Work that was done outside the board: files changed in the worktree, and commits on the branch
// that the board did not make. The board reads git each time and keeps no copy, so the list cannot
// be out of date.

export type OutsideFile = { path: string; kind: 'changed' | 'new' | 'deleted' };
export type OutsideCommit = { sha: string; short: string; title: string };
export type OutsideWork = {
  files: OutsideFile[];
  commits: OutsideCommit[];
  /** The commit that the worktree is on now. */
  head: string;
  /** How many commits the branch has beyond the base branch. */
  ahead: number;
};

/** The files of `git status --porcelain=v1 -z`, each with what happened to it. */
export function outsideFiles(porcelainZ: string): OutsideFile[] {
  const parts = porcelainZ.split('\0').filter(Boolean);
  const files: OutsideFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const x = parts[i]![0]!;
    const y = parts[i]![1]!;
    const path = parts[i]!.slice(3);
    const kind =
      x === '?' || x === 'A' ? 'new' : x === 'D' || y === 'D' ? 'deleted' : ('changed' as const);
    files.push({ path, kind });
    if (x === 'R' || x === 'C') {
      i++;
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** The commits of `git log --format=%H%x09%s` that are not in `known`, newest first. */
export function outsideCommits(log: string, known: { sha: string }[]): OutsideCommit[] {
  const has = (sha: string) =>
    known.some((k) => k.sha && (sha.startsWith(k.sha) || k.sha.startsWith(sha)));
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha = '', ...title] = line.split('\t');
      return { sha, short: sha.slice(0, 9), title: title.join('\t') };
    })
    .filter((c) => c.sha && !has(c.sha));
}

/** A hash for each file, from its content. A deleted file has '-'. */
async function hashFiles(dir: string, files: OutsideFile[], run: Run) {
  const out: Record<string, string> = {};
  for (let i = 0; i < files.length; i += 20) {
    await Promise.all(
      files.slice(i, i + 20).map(async (x) => {
        out[x.path] =
          x.kind === 'deleted'
            ? '-'
            : await run('git', ['hash-object', '--', x.path], dir)
                .then((h) => h.trim())
                .catch(() => '?');
      })
    );
  }
  return out;
}

/** The worktree as it is now. The board takes it when a run ends, or starts for a run that reads only. */
export async function snapshotWorktree(dir: string, run: Run = gitRun): Promise<Seen> {
  const files = outsideFiles(await run('git', ['status', '--porcelain=v1', '-z', '-uall'], dir));
  return {
    head: (await run('git', ['rev-parse', 'HEAD'], dir)).trim(),
    files: await hashFiles(dir, files, run)
  };
}

/**
 * The runs that change code take the snapshot when they end: the code is theirs. A run that only
 * reads takes it when it starts: it saw the code as it was, and later edits are not in its result.
 */
export const changesCode = (r: { stage: string; task?: string }) =>
  r.stage === 'development' || r.task === 'review-fix';

/** What the worktree holds that the board did not do. Null when there is no worktree to read. */
export async function findOutside(
  f: Flow | null | undefined,
  run: Run = gitRun
): Promise<OutsideWork | null> {
  if (!f?.worktree) {
    return null;
  }
  const dir = f.worktree;
  try {
    const status = outsideFiles(await run('git', ['status', '--porcelain=v1', '-z', '-uall'], dir));
    const hashes = f.seen ? await hashFiles(dir, status, run) : {};
    // Without the base branch fetched, the commits cannot be listed. The files still are.
    const log = (range: string) =>
      run('git', ['log', '--format=%H%x09%s', '-n', '200', range], dir);
    const all = await log(`origin/${CONFIG.repo.baseBranch}..HEAD`).catch(() => '');
    // Only the commits after the board last looked. A branch that moved under it has no such range.
    const since = f.seen?.head ? await log(`${f.seen.head}..HEAD`).catch(() => all) : all;
    const head = (await run('git', ['rev-parse', 'HEAD'], dir)).trim();
    return {
      files: f.seen ? status.filter((x) => f.seen!.files[x.path] !== hashes[x.path]) : status,
      commits: outsideCommits(since, f.commits?.done ?? []),
      head,
      ahead: all.split('\n').filter(Boolean).length
    };
  } catch {
    return null;
  }
}

/** True when there is anything to show. */
export const hasOutside = (o: OutsideWork | null | undefined): o is OutsideWork =>
  !!o && (o.files.length > 0 || o.commits.length > 0);

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A result that came before the outside work: Testing, or the review. Whatever came from outside
 * since the last run is not in the result, so the banner says so and offers the run again. The
 * ticket does not move back: the developer decides.
 */
function afterResult(f: Flow, o: OutsideWork, open: { id: string; label: string }): Flow {
  const files = o.files.length;
  const commits = o.commits.length;
  const ran = f.stage === 'testing' ? !!Object.keys(f.evidence ?? {}).length : !!f.codeReview;
  if (!ran || (!files && !commits)) {
    return f;
  }
  const again =
    f.stage === 'testing'
      ? { id: 'startTesting', label: 'Test again' }
      : { id: 'startCodeReview', label: 'Review again' };
  const what = [
    files && count(files, 'file', 'files') + ' changed',
    commits && count(commits, 'commit', 'commits') + ' made'
  ]
    .filter(Boolean)
    .join(' and ');
  const after =
    f.stage === 'testing'
      ? 'Testing'
      : Object.keys(f.evidence ?? {}).length
        ? 'the review and Testing'
        : 'the review';
  const text = `${what} outside the board after ${after} ran. The result does not include them.`;
  if (f.need) {
    return {
      ...f,
      need: {
        ...f.need,
        detail: [f.need.detail, text].filter(Boolean).join(' '),
        actions: [again, ...f.need.actions.filter((a) => a.id !== again.id)]
      }
    };
  }
  return { ...f, need: { kind: 'decision', ask: text, actions: [again, open] } };
}

/**
 * The record as the developer should read it now. The saved message of a push preview counts the
 * commits of the day it was made. When the branch has moved since, or the worktree has uncommitted
 * files, the message says so, and the push button goes: the push would be refused anyway.
 */
export function withOutside(f: Flow | null, o: OutsideWork | null): Flow | null {
  if (!f || !o || f.closed || runActive(f)) {
    return f;
  }
  const open = { id: 'openWorktree', label: 'Open worktree' };
  if (f.stage === 'testing' || f.stage === 'code-review') {
    return afterResult(f, o, open);
  }
  if (f.stage !== 'ship') {
    return f;
  }
  const base = CONFIG.repo.baseBranch;
  const files = o.files.length;

  if (f.push?.pushedAt) {
    return !f.push.head || f.push.head === o.head
      ? f
      : {
          ...f,
          need: {
            kind: 'decision',
            ask: `The branch has changed since it was pushed (${f.push.head.slice(0, 7)}).`,
            detail: 'The board pushes a branch once. Push the new commits from the worktree.',
            actions: [open]
          }
        };
  }

  const shown = f.push;
  const checked = f.gate?.ok && !f.gate.verify ? f.gate.head : undefined;
  if (!shown && !checked) {
    return f;
  }
  const dirty = files ? `${count(files, 'file is', 'files are')} changed and not committed.` : '';
  const previewOld = !!shown && shown.head !== o.head;
  // The checks passed on the branch as it is now, and only the preview is old. The checks are done:
  // the next step is to show the push again, not to run the checks again.
  if (previewOld && checked === o.head) {
    return {
      ...f,
      push: { ...shown, stale: true },
      need: {
        kind: 'decision',
        ask: `The checks passed on the branch as it is now, but the preview is old: it showed ${count(shown.commits.length, 'commit', 'commits')}, and the branch has ${o.ahead} beyond origin/${base}.`,
        detail: [dirty, 'Update the push preview to see the commits that the push sends.']
          .filter(Boolean)
          .join(' '),
        actions: [{ id: 'showPush', label: 'Update the push preview' }, open]
      }
    };
  }
  if (previewOld || (!shown && checked !== o.head)) {
    const made = o.commits.length;
    return {
      ...f,
      ...(shown ? { push: { ...shown, stale: true } } : {}),
      need: {
        kind: 'decision',
        ask: shown
          ? `The branch changed after the preview: it has ${count(o.ahead, 'commit', 'commits')} beyond origin/${base} now, and the preview showed ${shown.commits.length}.`
          : `The branch changed after the checks: it has ${count(o.ahead, 'commit', 'commits')} beyond origin/${base} now.`,
        detail: [
          made
            ? `${count(made, 'commit was', 'commits were')} made outside the board.`
            : 'The branch moved.',
          dirty,
          'Prepare the push again so the checks cover the branch as it is now.'
        ]
          .filter(Boolean)
          .join(' '),
        actions: [{ id: 'startGate', label: 'Prepare the push again' }, open]
      }
    };
  }
  if (files) {
    return {
      ...f,
      need: {
        kind: 'decision',
        ask: `${count(files, 'file', 'files')} changed in the worktree and not committed.`,
        detail:
          'The push sends commits only, and it refuses a worktree with uncommitted changes. Commit or discard these files first.',
        actions: [open]
      }
    };
  }
  return f;
}
