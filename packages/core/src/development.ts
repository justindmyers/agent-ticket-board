import { REUSE_RULES } from './reuse';
import { z } from 'zod';
import { mdSections } from './adf-md';
import { loadFlow, saveFlow } from './agents';
import { audit } from './audit';
import { failedChecksSection } from './gate';
import { runActive } from './look';
import { mergeAnswers } from './planning';
import type { Flow, Step, Ticket } from './types';

// The Development stage: one build session works the approved plan in the ticket's worktree, reports
// each step with the board's `step` tool, and ends with the final gate. It never commits or pushes.

const Check = z.object({
  ok: z.boolean().describe('True when the check passed'),
  note: z.string().describe('Empty when it passed; else what failed, in one line')
});

const BuildSchema = z.object({
  steps: z.array(
    z.object({
      n: z.number().int().describe('The plan step number'),
      done: z.boolean(),
      check: z.string().describe('The command or click path that checked this step'),
      ok: z.boolean().nullable().describe('The result of that check; null when not run'),
      note: z.string().describe('Empty, or why the step is not done')
    })
  ),
  gate: z.object({ typecheck: Check, lint: Check, tests: Check }).describe('The final gate'),
  summary: z.string().describe('What changed, in 1 to 3 sentences, for the developer'),
  followups: z.array(z.string()).describe('Work that is outside this ticket, for the developer')
});

export type BuildResult = z.infer<typeof BuildSchema>;

export const BUILD_SCHEMA = z.toJSONSchema(BuildSchema, { target: 'draft-7' }) as Record<
  string,
  unknown
> & { required: string[] };

export function parseBuild(output: unknown): BuildResult {
  const r = BuildSchema.safeParse(output);
  if (!r.success) {
    throw new Error(
      `The agent's build result has an unexpected shape. ${z.prettifyError(r.error).slice(0, 300)}`
    );
  }
  return r.data;
}

/** Why the plan cannot go to Development, or null when it can. */
export function canDevelop(f: Flow | null): string | null {
  if (!f?.requirements?.length) {
    return 'There is no plan to build. Plan the ticket first.';
  }
  const open = (f.questions ?? []).filter((q) => !q.a).length;
  if (open) {
    return `The plan has ${open} open question${open === 1 ? '' : 's'}. Answer, then re-plan.`;
  }
  if (!f.steps?.length) {
    return 'The plan has no steps. Re-plan.';
  }
  return null;
}

/** The requirements that Testing found failing: the build fixes their cause, also in steps marked done. */
export function failedRequirementsSection(f: Flow) {
  const failed = (f.requirements ?? []).filter((r) => f.evidence?.[r.id] && !f.evidence[r.id]!.ok);
  return failed.length
    ? [
        '',
        '# Requirements that failed in Testing',
        'The tester ran the app and found these failing. Fix the cause in the code, also in steps that are done.',
        'Then run the targeted check for the change.',
        ...failed.map((r) => {
          const e = f.evidence![r.id]!;
          const result = [
            e.expected && `Expected: ${e.expected}`,
            e.found && `Found: ${e.found}`,
            e.note && `Tester's note: ${e.note}`
          ].filter(Boolean);
          return `- ${r.id}: ${r.text}\n  Result: ${result.join(' ') || 'It did not pass.'}`;
        })
      ]
    : [];
}

/** The prompt for a build session. The session runs in the ticket's worktree. */
export function buildPrompt(t: Ticket, f: Flow, boardComments: string[], commands: string[] = []) {
  const answers = mergeAnswers(f.answered ?? [], f.questions ?? []);
  const description = mdSections(t.description)
    .map((s) => (s.title ? `## ${s.title}\n\n${s.md}` : s.md))
    .join('\n\n');
  return [
    `You build the approved plan for the ticket ${t.key}: ${t.summary}`,
    '',
    'Rules:',
    '- Work only in this folder. It is the worktree of the ticket, on its own branch.',
    '- Do not commit, push or open a pull request. The developer tests first and approves.',
    "- Before you write code, read the repository's CLAUDE.md and each skill that it names for this kind of change",
    '  (code style, React patterns, accessibility, testing, shared library, file layout). Follow them in the first pass:',
    '  the board runs the repository checks when you finish, and any failure sends you back to fix it.',
    '- Follow the code style of the repository: its CLAUDE.md, its skills, and the code next to your change.',
    ...REUSE_RULES,
    '- Do the steps in order. Before a step, call mcp__board__step with the step number and state "current".',
    '  After its check passes, call it again with state "done".',
    "- After each step, run the targeted check for that step: a test, or the repository's lint for the changed files.",
    '- Before the final gate, read your diff (git diff and the new files). Replace each new helper or mock',
    '  that duplicates code of the repository with the existing one.',
    '- Tests: only the test files in git diff --name-only and the untracked files, plus the direct tests of a',
    '  changed module. Never a folder or the whole suite. Put no -- before file paths. Add --maxWorkers=2.',
    '  Run the type check, lint and tests one after the other, never at the same time.',
    '- Do not start a dev server, Storybook or a watcher. The board runs the app for testing.',
    '- If the repository checks generated files (check:* or gen:* scripts, pre-commit hooks), run the generators that',
    '  your change needs before the final gate, and report them in the gate.',
    '- At the end, run the final gate: the type check, then lint and tests for the changed files.',
    '  Use the commands of the repository (package.json scripts, nx targets).',
    '- If you cannot finish a step, stop at a safe point and say why in its note.',
    ...(commands.length
      ? [
          `- Shell commands that you may run: ${commands.join('; ')}. Anything else is refused.`,
          '  Run one command for each call. Do not chain commands with &&, || or ;.',
          '  If a command is refused, use another allowed command. Do not stop because of a refusal.'
        ]
      : []),
    '',
    '# Requirements',
    '',
    ...(f.requirements ?? []).map((r) => `${r.id}. ${r.text} (check: ${r.check})`),
    '',
    '# Steps',
    '',
    ...(f.steps ?? []).map(
      (s) =>
        `${s.n}. ${s.text} [${s.covers.join(', ')}]${s.state === 'done' ? ' (done already: skip it)' : ''}`
    ),
    ...(answers.length
      ? ['', '# Answers from the developer', '', ...answers.map((x) => `- ${x.q} Answer: ${x.a}`)]
      : []),
    ...(boardComments.length
      ? ['', '# Notes from the developer', '', ...boardComments.map((c) => `- ${c}`)]
      : []),
    ...failedChecksSection(f),
    ...failedRequirementsSection(f),
    '',
    '# Ticket description',
    '',
    description || '(No description.)'
  ].join('\n');
}

/** The record after the agent reports a step. */
export function markStep(f: Flow, n: number, state: 'current' | 'done'): Flow {
  if (!f.steps?.some((s) => s.n === n)) {
    throw new Error(`The plan has no step ${n}.`);
  }
  return {
    ...f,
    steps: f.steps.map((s) =>
      s.n === n
        ? { ...s, state }
        : state === 'current' && s.state === 'current'
          ? { ...s, state: 'todo' }
          : s
    )
  };
}

const GATE = [
  ['typecheck', 'Type check'],
  ['lint', 'Lint'],
  ['tests', 'Tests']
] as const;

/** The record after a build run: Testing when every step is done and the gate passed, else a problem. */
export function applyBuild(f: Flow, r: BuildResult): Flow {
  const done = new Set(r.steps.filter((s) => s.done).map((s) => s.n));
  // The build skips steps that were done before it: they stay done unless it reports them not done.
  const undone = new Set(r.steps.filter((s) => !s.done).map((s) => s.n));
  for (const s of f.steps ?? []) {
    if (s.state === 'done' && !undone.has(s.n)) {
      done.add(s.n);
    }
  }
  const notes = new Map(r.steps.filter((s) => s.note).map((s) => [s.n, s.note]));
  const steps = (f.steps ?? []).map(({ note: _old, ...s }) => {
    void _old;
    const note = notes.get(s.n);
    return {
      ...s,
      state: done.has(s.n) ? ('done' as const) : ('todo' as const),
      ...(note ? { note } : {})
    };
  });
  const checks = GATE.map(([k, name]) => ({
    name,
    ok: r.gate[k].ok,
    ...(r.gate[k].ok || !r.gate[k].note ? {} : { note: r.gate[k].note })
  }));
  const failed = GATE.filter(([k]) => !r.gate[k].ok).map(([, name]) => name.toLowerCase());
  const total = steps.length;
  const finished = steps.filter((s) => s.state === 'done').length;
  const openTree = { id: 'openWorktree', label: 'Open worktree' };
  const open = openSteps(steps);
  const ready = finished === total && !failed.length;
  return {
    ...f,
    stage: ready ? 'testing' : 'development',
    steps,
    checks,
    review: r.summary,
    need: ready
      ? {
          kind: 'decision',
          ask: `Ready to test: ${finished} of ${total} steps done, and the gate passed`,
          actions: [{ id: 'startTesting', label: 'Start testing' }, openTree]
        }
      : {
          kind: 'problem',
          ask: [open.ask, failed.length ? `The gate failed: ${failed.join(', ')}.` : '']
            .filter(Boolean)
            .join(' '),
          ...(open.detail ? { detail: open.detail } : {}),
          actions: [
            ...(failed.length ? [] : [{ id: 'toTesting', label: 'Move to Testing' }]),
            { id: 'startDevelopment', label: 'Try again' },
            openTree
          ]
        }
  };
}

/** Which steps are not done: a short line for the list, and the agent's reasons as the detail. */
function openSteps(steps: Step[]) {
  const open = steps.filter((s) => s.state !== 'done');
  const ask = !open.length
    ? ''
    : open.length === 1
      ? `Step ${open[0]!.n} is not done.`
      : `Steps ${open
          .slice(0, -1)
          .map((s) => s.n)
          .join(', ')} and ${open.at(-1)!.n} are not done.`;
  const noted = open.filter((s) => s.note);
  const detail =
    noted.length === 1 && open.length === 1
      ? noted[0]!.note!
      : noted.map((s) => `Step ${s.n}: ${s.note!.replace(/\.?$/, '.')}`).join(' ');
  return { ask, detail };
}

/**
 * The developer moves a build with a clean gate to Testing, with steps still open: for example a
 * browser check that the build session cannot run. The open steps stay visible for the tester.
 */
export function acceptBuild(f: Flow): Flow {
  if (f.checks?.some((c) => c.ok === false)) {
    throw new Error('The final gate failed. Fix it before Testing.');
  }
  const steps = f.steps ?? [];
  const finished = steps.filter((s) => s.state === 'done').length;
  const open = steps.filter((s) => s.state !== 'done').map((s) => s.n);
  return {
    ...f,
    stage: 'testing',
    need: {
      kind: 'decision',
      ask: `Ready to test: ${finished} of ${steps.length} steps done.${
        open.length ? ` Check step${open.length > 1 ? 's' : ''} ${open.join(', ')} in Testing.` : ''
      }`,
      actions: [
        { id: 'startTesting', label: 'Start testing' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    }
  };
}

/** Moves a ticket's build to Testing at the developer's request, and logs it. */
export async function moveToTesting(key: string) {
  const f = await loadFlow(key);
  if (!f || f.stage !== 'development' || runActive(f)) {
    throw new Error(`${key}: only a finished build that is not running can move to Testing.`);
  }
  const next = acceptBuild(f);
  await saveFlow(key, next, 'developer');
  await audit(key, 'developer', 'build.accepted', {
    open: next.steps?.filter((s) => s.state !== 'done').map((s) => s.n)
  });
  return next;
}
