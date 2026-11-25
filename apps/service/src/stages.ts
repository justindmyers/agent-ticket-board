import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyReview,
  canReview,
  parseReview,
  REVIEW_SCHEMA,
  reviewPrompt,
  REVIEWERS,
  applyTest,
  markStaleShots,
  canTest,
  CONFIG,
  parseTest,
  TEST_SCHEMA,
  testPrompt,
  TICKETS_DIR,
  applyBuild,
  applyPlan,
  BUILD_SCHEMA,
  buildPrompt,
  canDevelop,
  parseBuild,
  parsePlan,
  PLAN_SCHEMA,
  withoutNeed,
  FINAL_PLAN_SCHEMA,
  isFinalPlan,
  planPrompt,
  type Flow,
  type Ticket,
  boardCommand
} from '@agent-ticket-board/core';
import type { AppEnv } from './runs';

// What differs between the stages that an agent runs: the checks before a run, the model and the
// cost cap, the tools, the prompt, the answer shape and how the answer goes into the record.

export type StageId = 'planning' | 'development' | 'testing' | 'code-review';

export const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];

/**
 * Read-only lookups of the ticket, related tickets and pull requests. The guard plugin refuses GitHub
 * and Jira writes as well, so a wide pattern such as `gh api` cannot write.
 */
export const LOOKUPS = [
  'Bash(gh pr view:*)',
  'Bash(gh pr diff:*)',
  'Bash(gh pr list:*)',
  'Bash(gh pr checks:*)',
  'Bash(gh issue view:*)',
  'Bash(gh issue list:*)',
  'Bash(gh repo view:*)',
  'Bash(gh search:*)',
  'Bash(gh api:*)',
  'Bash(acli jira workitem view:*)',
  'Bash(acli jira workitem search:*)',
  'Bash(git log:*)',
  'Bash(git show:*)'
];

/** Planning: read the code, and look up tickets and pull requests. It changes nothing. */
export const PLAN_TOOLS = [...READ_ONLY_TOOLS, 'Bash'];
export const PLAN_ALLOWED = [...READ_ONLY_TOOLS, ...LOOKUPS];

/** Build mode: edits, and an allowlist of commands. `dontAsk` refuses everything else (logged). */
export const BUILD_TOOLS = [...READ_ONLY_TOOLS, 'Edit', 'Write', 'TodoWrite', 'Bash'];
export const BUILD_ALLOWED = [
  ...READ_ONLY_TOOLS,
  'Edit',
  'Write',
  'TodoWrite',
  'Bash(pnpm:*)',
  'Bash(nx:*)',
  'Bash(npx:*)',
  'Bash(node:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  ...LOOKUPS,
  'Bash(npm run:*)',
  'Bash(npm test:*)',
  'Bash(echo:*)',
  'Bash(ls:*)',
  'Bash(pwd)',
  'mcp__board__step'
];

/** The allowed commands in words, for the prompt: from the allowlist, so the two cannot drift. */
export const commandsOf = (allowed: string[]) =>
  allowed.filter((x) => x.startsWith('Bash(')).map((x) => x.slice(5, -1).replace(/:\*$/, ''));
export const ALLOWED_COMMANDS = commandsOf(BUILD_ALLOWED);

/** Code review: the build tools, and the subagents that review. */
export const REVIEW_TOOLS = [...BUILD_TOOLS, 'Agent', 'Task'];
export const REVIEW_ALLOWED = [...BUILD_ALLOWED, 'Agent', 'Task'];

export type StageSpec = {
  stage: StageId;
  model: string;
  budgetUsd: number;
  /** The action that runs the stage again after a failure. */
  retry: string;
  /** Why the stage cannot start for this record, or null. */
  refuse: (f: Flow | null) => string | null;
  /** The record when the run is queued. */
  begin: (f: Flow | null) => Flow;
  /** `app` is set for Testing: the worktree's live app and browser. */
  prompt: (t: Ticket, f: Flow, comments: string[], app?: AppEnv) => string;
  tools: string[];
  allowed: string[];
  /** Subagents of the run, by name: the reviewers of Code review. */
  agents?: Record<string, { description: string; prompt: string; tools: string[]; model: string }>;
  /** The answer's JSON schema, for the record at the start of the run. */
  schema: (f: Flow) => Record<string, unknown>;
  /** The record after a valid answer. */
  apply: (f: Flow, output: unknown, key: string) => Flow;
  /** Counts for the audit log. */
  counts: (f: Flow) => Record<string, unknown>;
};

export const STAGE_SPECS: Record<StageId, StageSpec> = {
  planning: {
    stage: 'planning',
    model: 'sonnet',
    budgetUsd: 2,
    retry: 'startPlanning',
    refuse: () => null,
    begin: (f) => ({ ...withoutNeed(f ?? { stage: 'planning' }), stage: 'planning' }),
    prompt: (t, f, comments) =>
      planPrompt(t, comments, f.questions, f.answered, commandsOf(PLAN_ALLOWED), f),
    tools: PLAN_TOOLS,
    allowed: PLAN_ALLOWED,
    // Once the developer has answered, the plan is final: its schema has no questions.
    schema: (f) => (isFinalPlan(f) ? FINAL_PLAN_SCHEMA : PLAN_SCHEMA),
    apply: (f, output) => applyPlan(f, parsePlan(output, isFinalPlan(f))),
    counts: (f) => ({
      requirements: f.requirements?.length,
      questions: f.questions?.length,
      assumptions: f.assumptions?.length,
      steps: f.steps?.length
    })
  },
  development: {
    stage: 'development',
    model: 'opus',
    budgetUsd: 8,
    retry: 'startDevelopment',
    refuse: canDevelop,
    begin: (f) => ({
      ...withoutNeed(f!),
      stage: 'development',
      // A new plan has only todo steps. A plan revised for a change keeps its built steps, and a
      // retry keeps the steps that are done: the build makes only what is still to do.
      steps: f!.steps?.map((s) => (s.state === 'current' ? { ...s, state: 'todo' as const } : s))
    }),
    prompt: (t, f, comments) => buildPrompt(t, f, comments, ALLOWED_COMMANDS),
    tools: BUILD_TOOLS,
    allowed: BUILD_ALLOWED,
    schema: () => BUILD_SCHEMA,
    apply: (f, output) => applyBuild(f, parseBuild(output)),
    counts: (f) => ({
      stepsDone: f.steps?.filter((s) => s.state === 'done').length,
      steps: f.steps?.length,
      gate: f.checks?.map((c) => `${c.name}: ${c.ok ? 'ok' : 'failed'}`)
    })
  },
  testing: {
    stage: 'testing',
    model: 'sonnet',
    budgetUsd: 3,
    retry: 'startTesting',
    refuse: canTest,
    begin: (f) => {
      const { approved: _a, ...rest } = withoutNeed(f!);
      void _a;
      return { ...rest, stage: 'testing' };
    },
    prompt: (t, f, comments, app) =>
      testPrompt(t, f, comments, {
        url: app!.url,
        session: app!.session,
        shots: app!.shots,
        mocked: app!.mocked,
        appLog: app!.appLog,
        commands: commandsOf(testAllowed())
      }),
    tools: BUILD_TOOLS,
    get allowed() {
      return testAllowed();
    },
    schema: () => TEST_SCHEMA,
    // The agent names its screenshot sets; the evidence gets every file of each set.
    apply: (f, output, key) => {
      const out = applyTest(f, parseTest(output), shotFilesOf(key));
      return f.worktree ? markStaleShots(out, shotTimes(out), lastChange(f.worktree)) : out;
    },
    counts: (f) => ({
      passing: Object.values(f.evidence ?? {}).filter((e) => e.ok).length,
      requirements: f.requirements?.length,
      shots: Object.values(f.evidence ?? {}).reduce((n, e) => n + (e.shots?.length ?? 0), 0)
    })
  },
  'code-review': {
    stage: 'code-review',
    model: 'opus',
    budgetUsd: 8,
    retry: 'startCodeReview',
    refuse: canReview,
    begin: (f) => ({ ...withoutNeed(f!), stage: 'code-review' }),
    prompt: (t, f, comments) => reviewPrompt(t, f, comments, commandsOf(REVIEW_ALLOWED)),
    tools: REVIEW_TOOLS,
    allowed: REVIEW_ALLOWED,
    agents: Object.fromEntries(
      Object.entries(REVIEWERS).map(([k, v]) => [k, { ...v, tools: [...v.tools] }])
    ),
    schema: () => REVIEW_SCHEMA,
    apply: (f, output) => applyReview(f, parseReview(output), new Date().toISOString()),
    counts: (f) => ({
      findings: f.codeReview?.findings.length,
      fixed: f.codeReview?.findings.filter((x) => x.state === 'fixed').length,
      dropped: f.codeReview?.findings.filter((x) => x.state === 'dropped').length,
      checks: f.codeReview?.checks.map((c) => `${c.name}: ${c.ok ? 'ok' : 'failed'}`)
    })
  }
};

/** Testing: the build commands, the browser CLI, and the board's own screenshot command. */
export function testAllowed(shots = `${boardCommand()} shots`) {
  return [...BUILD_ALLOWED, 'Bash(pnpm exec playwright-cli:*)', `Bash(${shots}:*)`];
}

/** The screenshot files of a ticket, and the sizes in their order. */
function shotFilesOf(key: string) {
  const dir = join(TICKETS_DIR, key, 'shots');
  const files = existsSync(dir) ? readdirSync(dir).map((n) => join(dir, n)) : [];
  return { files, sizes: CONFIG.app.shotSizes };
}

/** The time of each screenshot in the evidence. */
function shotTimes(f: Flow) {
  const times: Record<string, number> = {};
  for (const p of Object.values(f.evidence ?? {}).flatMap((e) => e.shots ?? [])) {
    try {
      times[p] = statSync(p).mtimeMs;
    } catch {
      // A shot that is gone has no time: it does not count as stale.
    }
  }
  return times;
}

/** The time of the newest changed file in a worktree that can change the page: not tests or docs. */
export function lastChange(worktree: string) {
  const git = (args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: worktree, encoding: 'utf8' }).split('\n');
    } catch {
      return [];
    }
  };
  const files = [
    ...git(['diff', '--name-only', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard'])
  ].filter((p) => p && !/\.(test|spec|stories)\.|\.md$|(^|\/)__tests__\//.test(p));
  let newest = 0;
  for (const p of files) {
    try {
      newest = Math.max(newest, statSync(join(worktree, p)).mtimeMs);
    } catch {
      // A deleted file has no time.
    }
  }
  return newest;
}
