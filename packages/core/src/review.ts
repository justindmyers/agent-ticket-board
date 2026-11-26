import { z } from 'zod';
import { failedChecksSection } from './gate';
import { REUSE_RULES } from './reuse';
import type { Finding, Flow, Need, Ticket } from './types';

// The Code review stage, first step: reviewers read the change and report. A checker drops every
// finding that it cannot confirm in the source. The agent fixes each confirmed finding, then runs
// the repository's checks again. Style-only notes are listed and never block.

const FindingSchema = z.object({
  reviewer: z.string().describe('The reviewer that reported it, like correctness or a11y-reviewer'),
  file: z.string().describe('The path of the file, relative to the worktree'),
  line: z
    .number()
    .int()
    .describe('The line in that file; 0 when the finding is about the whole file'),
  problem: z.string().describe('What is wrong, in one or two sentences'),
  fix: z.string().describe('What fixes it'),
  severity: z.enum(['blocking', 'style']).describe('Style: only taste, naming or formatting'),
  state: z
    .enum(['fixed', 'open', 'dropped'])
    .describe(
      'fixed: you fixed it. open: confirmed, not fixed. dropped: the source does not confirm it'
    ),
  note: z.string().describe('For dropped: why. For open: what stopped the fix. Else empty')
});

const ReviewSchema = z.object({
  findings: z.array(FindingSchema),
  checks: z.array(
    z.object({
      name: z.string().describe('The check, like check:types or eslint on the changed files'),
      ok: z.boolean().describe('True only when the last run of it, after your last change, passed'),
      note: z.string().describe('When not ok: the first error; else empty')
    })
  ),
  summary: z.string().describe('Two or three sentences for the developer')
});

export type ReviewResult = z.infer<typeof ReviewSchema>;

/** The JSON schema of the review answer. The SDK makes the agent answer in this shape. */
export const REVIEW_SCHEMA = z.toJSONSchema(ReviewSchema, {
  target: 'draft-7'
}) as unknown as Record<string, unknown>;

export function parseReview(output: unknown): ReviewResult {
  const r = ReviewSchema.safeParse(output);
  if (!r.success) {
    throw new Error(
      `The agent's review result has an unexpected shape. ${z.prettifyError(r.error).slice(0, 300)}`
    );
  }
  return r.data;
}

/** Why a review cannot start for this record, or null. */
export function canReview(f: Flow | null): string | null {
  if (!f || !f.approved) {
    return 'Code review starts after you approve the tested change.';
  }
  if (!f.worktree) {
    return 'The ticket has no worktree. Run Development first.';
  }
  return null;
}

/** The reviewers that every repository gets. The agents of the repository come on top of these. */
export const REVIEWERS = {
  correctness: {
    description:
      'Reads a diff for bugs: wrong logic, unhandled states, races, broken types and missing tests.',
    prompt:
      'You review a change for correctness. Read the diff and the code around it. Report only real defects: logic errors, unhandled loading, empty or error states, race conditions, wrong types and behavior that no test covers. Never edit files. Answer with one line for each finding: file:line, the problem, the fix. When you find nothing, say so.',
    tools: ['Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)'],
    model: 'sonnet'
  },
  'code-style': {
    description:
      'Reads a diff for the style of the repository: naming, structure, comments and file layout.',
    prompt:
      'You review a change against the conventions of this repository: its CLAUDE.md, its lint rules and the code next to the change. Report naming, structure, comment and layout problems. Never edit files. Answer with one line for each finding: file:line, the problem, the fix. When you find nothing, say so.',
    tools: ['Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)'],
    model: 'sonnet'
  }
} as const;

export function reviewPrompt(t: Ticket, f: Flow, boardComments: string[], commands: string[]) {
  return [
    `You review the change for the ticket ${t.key}: ${t.summary}`,
    'The change is built and tested in this worktree. A developer approved it. You find the defects that remain, and you fix them.',
    '',
    '# Requirements of the ticket',
    ...(f.requirements ?? []).map((r) => `- ${r.id}: ${r.text}`),
    ...(boardComments.length
      ? ['', '# Comments from the developer', ...boardComments.map((c) => `- ${c}`)]
      : []),
    ...failedChecksSection(f),
    '',
    '# Step 1: reviewers',
    'Start one subagent for each reviewer, in one turn, so they run together:',
    `- correctness and code-style, which the board gives you.`,
    '- Each reviewer that this repository defines in .claude/agents (for example a11y-reviewer, reuse-auditor). List the folder first.',
    'Tell each one to review `git diff origin/main...HEAD` plus the uncommitted changes, and to report only: file:line, problem, fix.',
    'Reviewers never edit files. They only report.',
    '',
    '# Step 2: check every finding',
    'For each finding, open the file at that line and read the source. Keep the finding only when the code shows the problem.',
    'Set state to "dropped" and say why in `note` when you cannot confirm it. Do not fix a dropped finding.',
    'A finding about taste, naming or formatting only is severity "style". Style findings never block, and you do not fix them.',
    '',
    '# Step 3: fix',
    'Fix every confirmed blocking finding yourself, and set its state to "fixed". When you cannot, set it to "open" and say why.',
    ...REUSE_RULES,
    '',
    '# Step 4: checks',
    'After your last change, run the repository checks in this order. Use the repository scripts from its CLAUDE.md and package.json.',
    'Skip a check that the repository does not have.',
    '1. the contract generators',
    '2. the type check',
    '3. eslint and prettier on the changed files only',
    '4. only the changed tests, with `vitest run --maxWorkers=2`, plus the tests that mock a whole shared package',
    '5. the comment-bloat and legacy-import checks',
    'Fix a failure that your change caused, then run that check and the ones after it again. Report each check in `checks`.',
    '',
    '# Rules',
    '- One review round. Do not start a second round of reviewers after your fixes.',
    '- Do not commit, push or merge. Do not use --no-verify.',
    `- Shell commands that you may run, one for each call: ${commands.join('; ')}. Anything else is refused.`,
    '- Never print tokens or secrets.'
  ].join('\n');
}

const count = (list: Finding[], pick: (x: Finding) => boolean) => list.filter(pick).length;

/** The record after a review: the findings, the checks and what the developer does next. */
export function applyReview(f: Flow, r: ReviewResult, at: string): Flow {
  const findings: Finding[] = r.findings.map((x, i) => ({ id: `F${i + 1}`, ...x }));
  const checks = r.checks.map((c) => ({
    name: c.name,
    ok: c.ok,
    ...(c.note ? { note: c.note } : {})
  }));
  return {
    ...f,
    codeReview: { at, summary: r.summary, findings, checks },
    need: reviewNeed(findings)
  };
}

/**
 * What the developer does after a review. The agent's own check results are not used: it can fail
 * to run a check. The board runs the checks itself right after a clean review.
 */
function reviewNeed(findings: Finding[]): Need {
  const open = findings.filter((x) => x.state === 'open' && x.severity === 'blocking');
  const worktree = { id: 'openWorktree', label: 'Open worktree' };
  if (open.length) {
    return {
      kind: 'problem',
      ask: `${open.length} finding${open.length > 1 ? 's are' : ' is'} not fixed.`,
      detail: open.map((x) => `${x.id} ${x.file}:${x.line}: ${x.problem}`).join('\n'),
      actions: [{ id: 'startCodeReview', label: 'Review again' }, worktree]
    };
  }
  const fixed = count(findings, (x) => x.state === 'fixed');
  const dropped = count(findings, (x) => x.state === 'dropped');
  const style = count(findings, (x) => x.state !== 'dropped' && x.severity === 'style');
  return {
    kind: 'decision',
    ask: `Review done: ${fixed} fixed, ${dropped} dropped, ${style} style note${style === 1 ? '' : 's'}.`,
    detail:
      'Dropped: the code did not show the problem. Style notes stay as they are: they never block.',
    actions: [{ id: 'startCommitPlan', label: 'Plan the commits' }, worktree]
  };
}
