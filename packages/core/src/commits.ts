import { z } from 'zod';
import type { Flow, Need, Ticket } from './types';

// Atomic commits by topic. An agent reads the change and proposes the groups. The developer sees the
// plan first. Then the board commits each group, in order, and the repository's hooks run.

/** The longest description of a commit or a pull request title, without the ticket key. */
export const DESCRIPTION_MAX = 72;

export const COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'test',
  'docs',
  'chore',
  'style',
  'perf',
  'build',
  'ci'
] as const;

const CommitPlanSchema = z.object({
  commits: z.array(
    z.object({
      type: z.enum(COMMIT_TYPES),
      scope: z.string().describe('The area of the code, lowercase, like edge-controls'),
      description: z
        .string()
        .describe(
          'What the commit does, in the imperative, lowercase, no period, like add a sort option'
        ),
      files: z.array(z.string()).describe('Every file of this commit, as in git status')
    })
  ),
  summary: z.string().describe('One or two sentences for the developer')
});

export type CommitPlan = z.infer<typeof CommitPlanSchema>;

export const COMMIT_PLAN_SCHEMA = z.toJSONSchema(CommitPlanSchema, {
  target: 'draft-7'
}) as unknown as Record<string, unknown>;

export function parseCommitPlan(output: unknown): CommitPlan {
  const r = CommitPlanSchema.safeParse(output);
  if (!r.success) {
    throw new Error(
      `The agent's commit plan has an unexpected shape. ${z.prettifyError(r.error).slice(0, 300)}`
    );
  }
  return r.data;
}

/** `type(scope): description (KEY)`. Lowercase, no period. The description has 72 characters at most. */
export const commitTitle = (c: { type: string; scope: string; description: string }, key: string) =>
  `${c.type}(${c.scope}): ${c.description} (${key})`;

/** The files of `git status --porcelain=v1 -z`. A rename gives its new path. */
export function changedFiles(porcelainZ: string): string[] {
  const parts = porcelainZ.split('\0').filter(Boolean);
  const files: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const [x] = parts[i]!;
    files.push(parts[i]!.slice(3));
    if (x === 'R' || x === 'C') {
      i++;
    }
  }
  return files;
}

/** What is wrong with the plan, or null: titles, every changed file once, no other file. */
export function planProblem(plan: CommitPlan, changed: string[], key: string): string | null {
  if (!plan.commits.length) {
    return changed.length ? `The plan has no commits, but ${changed.length} files changed.` : null;
  }
  for (const c of plan.commits) {
    const title = commitTitle(c, key);
    const head = `${c.type}(${c.scope}): ${c.description}`;
    if (head !== head.toLowerCase()) {
      return `The title must be lowercase: ${title}`;
    }
    // The repository's rule is for the description alone: the type, the scope and the key do not count.
    if (c.description.length > DESCRIPTION_MAX) {
      return `The description is ${c.description.length} characters. The limit is ${DESCRIPTION_MAX}, without the type, the scope and the key: ${title}`;
    }
    if (c.description.trim().endsWith('.')) {
      return `The title must not end with a period: ${title}`;
    }
    if (!c.files.length) {
      return `The commit has no files: ${title}`;
    }
  }
  const seen = new Map<string, number>();
  for (const c of plan.commits) {
    for (const p of c.files) {
      seen.set(p, (seen.get(p) ?? 0) + 1);
    }
  }
  const twice = [...seen].filter(([, n]) => n > 1).map(([p]) => p);
  if (twice.length) {
    return `A file can be in one commit only: ${twice.join(', ')}`;
  }
  const missing = changed.filter((p) => !seen.has(p));
  if (missing.length) {
    return `Files that changed are in no commit: ${missing.join(', ')}`;
  }
  const extra = [...seen.keys()].filter((p) => !changed.includes(p));
  return extra.length ? `Files that did not change are in the plan: ${extra.join(', ')}` : null;
}

/** Why the commit plan cannot start for this record, or null. */
export function canPlanCommits(f: Flow | null): string | null {
  if (!f?.codeReview) {
    return 'Commits come after the review.';
  }
  return f.worktree ? null : 'The ticket has no worktree.';
}

export function commitPrompt(t: Ticket, f: Flow, changed: string[], commands: string[]) {
  return [
    `You plan the commits for the ticket ${t.key}: ${t.summary}`,
    'The change is built, tested and reviewed in this worktree. It is not committed. Group it into atomic commits.',
    '',
    '# Changed files',
    ...changed.map((p) => `- ${p}`),
    '',
    '# Rules',
    '- One commit for each topic. A commit builds and tests on its own. Put a new helper before the code that uses it.',
    '- The title is `type(scope): description (KEY)`: the type is one of the list, the scope is the area of the code,',
    `  the key is ${t.key}. Lowercase, no period. The description has ${DESCRIPTION_MAX} characters at most: the type, the scope and the key do not count. Never copy the Jira summary.`,
    `- Types: ${COMMIT_TYPES.join(', ')}.`,
    '- Give every changed file to exactly one commit. List the files as they are in the list above.',
    '- A test goes with the code that it tests. Docs for a feature go with the feature.',
    '- Read the change with `git diff` and `git status`. Do not edit files. Do not commit, push or stage.',
    `- Shell commands that you may run, one for each call: ${commands.join('; ')}. Anything else is refused.`
  ].join('\n');
}

/** The record after the plan: the commits to make, and the developer's decision. */
export function applyCommitPlan(f: Flow, plan: CommitPlan, changed: string[], key: string): Flow {
  const open = { id: 'openWorktree', label: 'Open worktree' };
  if (!plan.commits.length && !changed.length) {
    return {
      ...f,
      commits: { plan: [], done: f.commits?.done ?? [] },
      need: {
        kind: 'decision',
        ask: 'Nothing is left to commit.',
        actions: [{ id: 'startGate', label: 'Run the checks' }, open]
      }
    };
  }
  const problem = planProblem(plan, changed, key);
  if (problem) {
    throw new Error(problem);
  }
  const commits = plan.commits.map((c) => ({ title: commitTitle(c, key), files: c.files }));
  return {
    ...f,
    commits: { plan: commits, done: f.commits?.done ?? [], summary: plan.summary },
    need: {
      kind: 'decision',
      ask: `${commits.length} commit${commits.length === 1 ? '' : 's'} planned.`,
      detail: plan.summary,
      actions: [
        { id: 'approveCommits', label: 'Make these commits' },
        { id: 'startCommitPlan', label: 'Plan again' },
        open
      ]
    }
  };
}

/** The record when every planned commit is made. */
export function commitsDone(f: Flow): Flow {
  const n = f.commits?.done.length ?? 0;
  const need: Need = {
    kind: 'decision',
    ask: `${n} commit${n === 1 ? '' : 's'} made.`,
    actions: [
      { id: 'startGate', label: 'Run the checks' },
      { id: 'openWorktree', label: 'Open worktree' }
    ]
  };
  return { ...f, commits: { ...f.commits!, plan: [] }, need };
}
