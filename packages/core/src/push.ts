import type { Flow, Gate, Push } from './types';

// The push of the branch of a ticket. The developer sees the push first, as a dry run, and approves
// exactly that: the branch, the commit and the command. The target is always `HEAD:<branch>`,
// never a bare push, because a branch can track the base branch, and a bare push would write to it.

/** The line under the preview: it is a dry run. */
export const DRY_RUN_NOTE = 'This is a dry run: nothing is pushed until you approve.';

/** A branch name that is safe in a command. Git allows more, and this is stricter. */
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export type PushFacts = {
  /** The branch of the worktree, or null on a detached head. */
  branch: string | null;
  base: string;
  /** The output of `git status --porcelain`. */
  dirty: string;
  head: string;
  gate: Gate | undefined;
  /** The commits that the branch has beyond the base branch. */
  commits: Push['commits'];
};

/** Why the branch cannot be pushed now, or null. */
export function pushProblem(i: PushFacts): string | null {
  if (!i.branch || i.branch === 'HEAD') {
    return 'The worktree is on no branch. Check out the branch of the ticket first.';
  }
  if (!BRANCH.test(i.branch)) {
    return `The branch name has characters that the push does not accept: ${i.branch}`;
  }
  if (i.branch === i.base) {
    return `The branch is the base branch (${i.base}). The push would write to ${i.base}. Work on a branch of the ticket.`;
  }
  if (i.dirty.trim()) {
    return `Commit or discard these changes first:\n${i.dirty.trim().split('\n').slice(0, 8).join('\n')}`;
  }
  if (!i.gate || i.gate.verify || !i.gate.ok) {
    return 'The checks before the push have not passed. Press "Prepare the push" first.';
  }
  if (i.gate.head !== i.head) {
    return 'The branch changed after the checks passed. Press "Prepare the push" again.';
  }
  if (!i.commits.length) {
    return `Nothing to push: the branch has no commit beyond origin/${i.base}.`;
  }
  return null;
}

/** The command of the push. Never a bare push, never a force, never `--no-verify`. */
export const pushArgs = (branch: string) => ['push', 'origin', `HEAD:${branch}`];

export type PushPlan = Pick<Push, 'branch' | 'head' | 'commits' | 'dryRun' | 'url'>;

/** The web address of a repository from its remote, or null. Only GitHub has the links of this board. */
export function webUrl(remote: string): string | null {
  const m =
    /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|git@)(github\.com)[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(
      remote.trim()
    );
  return m ? `https://${m[1]}/${m[2]}` : null;
}

/** The record that shows the developer the push, with the buttons to approve it or show it again. */
export function planPushFlow(f: Flow, p: PushPlan, at: string): Flow {
  const n = p.commits.length;
  const command = `git ${pushArgs(p.branch).join(' ')}`;
  return {
    ...f,
    push: { ...p, command, at },
    need: {
      kind: 'decision',
      ask: `Ready to push ${n} commit${n === 1 ? '' : 's'} to origin as ${p.branch}.`,
      detail: DRY_RUN_NOTE,
      actions: [
        { id: 'approvePush', label: 'Approve the push' },
        { id: 'showPush', label: 'Show the push again' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    }
  };
}

/** Why the approved push cannot run: the branch is not the one that the developer saw. */
export function approvalProblem(f: Flow, branch: string | null, head: string): string | null {
  if (!f.push) {
    return 'Preview the push first.';
  }
  if (f.push.pushedAt) {
    return `${f.push.branch} was pushed already.`;
  }
  if (f.push.branch !== branch || f.push.head !== head) {
    return 'The branch changed after you looked at the push. Show the push again.';
  }
  return null;
}

/** The record after the push. */
export function pushedFlow(f: Flow, at: string): Flow {
  const p = f.push!;
  return {
    ...f,
    push: { ...p, pushedAt: at },
    need: {
      kind: 'decision',
      ask: `Pushed ${p.branch} to origin (${p.head.slice(0, 7)}).`,
      detail:
        'The board does not make the draft pull request yet. Open the branch on GitHub to make it.',
      actions: [{ id: 'openWorktree', label: 'Open worktree' }]
    }
  };
}
