import { execFile } from 'node:child_process';
import {
  approvalProblem,
  audit,
  CONFIG,
  loadFlow,
  planPushFlow,
  pushArgs,
  pushedFlow,
  pushProblem,
  saveFlow,
  webUrl,
  type Flow
} from '@agent-ticket-board/core';

// The push of a ticket's branch, in two steps. `planPush` shows it: the branch, the commits and the
// result of `git push --dry-run`, which changes nothing. `doPush` makes exactly that push, and only
// when the branch is still the one that the developer saw.

export type Git = (args: string[]) => Promise<{ code: number; out: string }>;

/** Runs git in a worktree. No shell: the arguments reach git as they are. */
export const gitIn =
  (cwd: string): Git =>
  (args) =>
    new Promise((resolve) => {
      execFile('git', args, { cwd, timeout: 120_000, maxBuffer: 4_000_000 }, (e, stdout, stderr) =>
        resolve({
          code: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          out: `${stdout}${stderr}`
        })
      );
    });

async function facts(f: Flow, git: Git) {
  const base = CONFIG.repo.baseBranch;
  const [branch, head, dirty, log] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['rev-parse', 'HEAD']),
    git(['status', '--porcelain']),
    git(['log', '--format=%H%x09%h%x09%s', `origin/${base}..HEAD`])
  ]);
  return {
    branch: branch.code ? null : branch.out.trim(),
    base,
    dirty: dirty.out,
    head: head.out.trim(),
    gate: f.gate,
    commits: log.code
      ? []
      : log.out
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            const [sha = '', short = '', ...title] = l.split('\t');
            return { sha, short, title: title.join('\t') };
          })
  };
}

const tail = (out: string) => out.trim().split('\n').slice(-8).join('\n');

export async function planPush(
  key: string,
  gitFor: (cwd: string) => Git = gitIn,
  now = () => new Date().toISOString()
) {
  const f = await loadFlow(key);
  if (!f?.worktree) {
    throw new Error(`${key}: the ticket has no worktree.`);
  }
  const git = gitFor(f.worktree);
  const x = await facts(f, git);
  const problem = pushProblem(x);
  if (problem) {
    throw new Error(problem);
  }
  const branch = x.branch!;
  const dry = await git([...pushArgs(branch), '--dry-run']);
  if (dry.code) {
    throw new Error(`The push would fail. Nothing was pushed.\n${tail(dry.out)}`);
  }
  const remote = await git(['remote', 'get-url', 'origin']);
  const url = (!remote.code && webUrl(remote.out)) || undefined;
  const next = planPushFlow(
    f,
    { branch, head: x.head, commits: x.commits, dryRun: dry.out, ...(url ? { url } : {}) },
    now()
  );
  await saveFlow(key, next, 'service');
  await audit(key, 'service', 'push.planned', {
    branch,
    head: x.head.slice(0, 7),
    commits: x.commits.length
  });
  return next;
}

export async function doPush(
  key: string,
  gitFor: (cwd: string) => Git = gitIn,
  now = () => new Date().toISOString()
) {
  const f = await loadFlow(key);
  if (!f?.worktree) {
    throw new Error(`${key}: the ticket has no worktree.`);
  }
  const git = gitFor(f.worktree);
  const x = await facts(f, git);
  const problem = pushProblem(x) ?? approvalProblem(f, x.branch, x.head);
  if (problem) {
    throw new Error(problem);
  }
  const r = await git(pushArgs(x.branch!));
  if (r.code) {
    await audit(key, 'service', 'push.failed', { branch: x.branch, output: tail(r.out) });
    throw new Error(`The push failed.\n${tail(r.out)}`);
  }
  // A preview made before addresses were recorded has none: take it from the remote now.
  const remote = f.push?.url ? null : await git(['remote', 'get-url', 'origin']);
  const url = f.push?.url ?? ((remote && !remote.code && webUrl(remote.out)) || undefined);
  const next = pushedFlow(url && f.push ? { ...f, push: { ...f.push, url } } : f, now());
  await saveFlow(key, next, 'service');
  await audit(key, 'service', 'push.done', { branch: x.branch, head: x.head.slice(0, 7) });
  return next;
}
