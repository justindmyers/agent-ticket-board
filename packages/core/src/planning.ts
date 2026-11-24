import { changeSection, pendingChanges } from './changes';
import { REUSE_RULES } from './reuse';
import { omit } from 'lodash-es';
import { z } from 'zod';
import { mdSections } from './adf-md';
import type { Answered, Flow, Need, Question, Ticket } from './types';

// The Planning stage: the prompt for a read-only agent session, the shape of its answer, and how the
// answer goes into the agent record.

/** At most this many questions, and only on the first plan. A re-plan with answers may not ask. */
export const MAX_QUESTIONS = 3;

const Requirements = z.array(
  z.object({
    id: z.string().describe('R1, R2, ...'),
    text: z.string().describe('One testable requirement'),
    check: z.string().describe('The test or the click path that proves it')
  })
);

const Questions = z
  .array(
    z.object({
      q: z.string().describe('The question, in one sentence'),
      why: z.string().describe('What changes in the build with each answer'),
      options: z.array(z.string()).describe('2 to 4 short answers; empty when only free text fits'),
      recommended: z
        .number()
        .int()
        .nullable()
        .describe('The index of the option you recommend, from the code and the ticket')
    })
  )
  .max(MAX_QUESTIONS)
  .describe('Only questions that block the build. Most important first. Decide the rest yourself.');

const Assumptions = z
  .array(z.string())
  .describe(
    'What you decided where the ticket is not clear, one sentence each, so the developer can check it'
  );

const Writes = z
  .array(
    z.object({
      method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
      path: z
        .string()
        .describe('The API path, with :name for ids, like /api/edges/:id/upgrade-request'),
      why: z.string().describe('The requirement that needs it, and what the write does')
    })
  )
  .describe(
    'Every write to the backend that testing must make in the live app. Empty when the tests fake them.'
  );

const Steps = z.array(
  z.object({
    text: z.string().describe('One small step'),
    covers: z.array(z.string()).describe('The requirement ids that this step covers')
  })
);

const PlanSchema = z.object({
  requirements: Requirements,
  questions: Questions,
  assumptions: Assumptions,
  steps: Steps,
  writes: Writes
});

/** A re-plan after the developer answered: no questions field, so the agent must give a whole plan. */
const FinalPlanSchema = z.object({
  requirements: Requirements,
  assumptions: Assumptions,
  steps: Steps,
  writes: Writes
});

export type PlanResult = z.infer<typeof PlanSchema>;
export type PlanQuestion = PlanResult['questions'][number];

type JsonSchema = Record<string, unknown> & {
  required: string[];
  properties: Record<string, { items?: { required?: string[] }; maxItems?: number }>;
};

/** The JSON schemas of a plan. The SDK makes the agent answer in this shape. */
export const PLAN_SCHEMA = z.toJSONSchema(PlanSchema, { target: 'draft-7' }) as JsonSchema;
export const FINAL_PLAN_SCHEMA = z.toJSONSchema(FinalPlanSchema, {
  target: 'draft-7'
}) as JsonSchema;

/** True when the developer has answered questions: the next plan is final and may not ask more. */
export const isFinalPlan = (f: Flow | null) =>
  mergeAnswers(f?.answered ?? [], f?.questions ?? []).length > 0 || pendingChanges(f).length > 0;

/** The agent's answer as a plan, or an error that says what is wrong with its shape. */
export function parsePlan(output: unknown, final = false): PlanResult {
  const r = (final ? FinalPlanSchema : PlanSchema).safeParse(output);
  if (!r.success) {
    throw new Error(
      `The agent's plan has an unexpected shape. ${z.prettifyError(r.error).slice(0, 300)}`
    );
  }
  return { questions: [], ...r.data };
}

const section = (title: string | null, md: string) => (title ? `## ${title}\n\n${md}` : md);

/** The prompt for a planning session. Board comments are the developer's notes on the board. */
export function planPrompt(
  t: Ticket,
  boardComments: string[],
  current: Question[] = [],
  earlier: Answered[] = [],
  commands: string[] = [],
  revise: Flow | null = null
) {
  const answered = mergeAnswers(earlier, current);
  const description = mdSections(t.description)
    .map((s) => section(s.title, s.md))
    .join('\n\n');
  const tracker = (t.comments ?? []).map(
    (c) =>
      `- ${c.author} (${c.created.slice(0, 10)}): ${mdSections(c.body)
        .map((s) => s.md)
        .join(' ')}`
  );
  return [
    `You plan the work for the ticket ${t.key}: ${t.summary}`,
    `Type: ${t.type}. Priority: ${t.priority}. Status: ${t.status}.`,
    '',
    'This session is read-only. Read the code in this folder to understand the change. Do not change any file.',
    ...(commands.length
      ? [
          `Look up what the ticket refers to before you plan: linked tickets, pull requests and other repositories.`,
          `Shell commands that you may run, one for each call: ${commands.join('; ')}.`,
          'These only read. Do not leave placeholders for facts that a lookup can give you.',
          'If a lookup fails, say which one in an assumption, and plan from what you know.'
        ]
      : []),
    'Then answer with:',
    '- numbered requirements (R1, R2, ...), each with a check: a test or a click path;',
    "  Requirements cover only what the ticket, its comments and the developer's notes ask. Do not add test",
    '  types, measurements or rules. Put an item that is outside the scope in one assumption line, and do not plan it.',
    '  For a requirement that shows data, list in its check the data states to see: zero, one, many, missing fields,',
    '  unknown references, overlaps, out of order, zero length, outside the parent span. Only the states it can meet.',
    ...(/bug|defect|incident/i.test(t.type)
      ? [
          "  R1 states the reported symptom in the reporter's words. Its check reproduces it under their conditions",
          '  (size, org, data) and must fail without the fix. Where size or aspect ratio can matter, check more than one.'
        ]
      : []),
    `  Run gh pr list --search ${t.key} --state all. If a pull request (also a draft or a closed one) built UI for this`,
    '  ticket, its layout and interactions are the spec: name it in the requirements. Replace only how it reads data.',
    ...(answered.length
      ? [
          '- no questions. Do not ask questions: the developer answered them already. Where something is still',
          '  not clear, choose the most reasonable option from the code and the ticket, and list it as an assumption;'
        ]
      : [
          `- at most ${MAX_QUESTIONS} questions, and only questions that block the build, most important first,`,
          '  each with why it matters, 2 to 4 options and the option you recommend. Decide everything else yourself;',
          '- assumptions: what you decided where the ticket is not clear, one sentence each;'
        ]),
    '- writes: every write to the backend (POST, PUT, PATCH, DELETE) that testing must make in the live app,',
    '  with its API path and the requirement that needs it. Moving the ticket to Testing approves this list, and',
    '  the test browser refuses every other write. Leave it empty when the tests can fake the writes;',
    '- small steps in order, each with the requirement ids that it covers. Steps are for the build: code',
    '  changes and commands such as tests, type checks and lint. Do not make browser, device or manual checks',
    '  into steps: the Testing stage does them, from the check of each requirement.',
    '  When a step adds a helper, hook, component or test mock, name the existing code that the step reuses,',
    '  or say why nothing in the repository fits. Rules for the build:',
    ...REUSE_RULES,
    '',
    '# Description',
    '',
    description || '(No description.)',
    ...(tracker.length ? ['', '# Comments in the tracker', '', ...tracker] : []),
    ...(boardComments.length
      ? ['', '# Notes from the developer', '', ...boardComments.map((c) => `- ${c}`)]
      : []),
    ...(answered.length
      ? [
          '',
          '# Answers from the developer',
          '',
          'Use these answers. Do not ask these questions again.',
          '',
          ...answered.map((q) => `- ${q.q} Answer: ${q.a}`)
        ]
      : []),
    ...(revise ? changeSection(revise) : [])
  ].join('\n');
}

/** The record after a planning run: the plan, and what the developer must do next. */
export function applyPlan(f: Flow, r: PlanResult): Flow {
  const ids = new Set(r.requirements.map((x) => x.id));
  const unknown = r.steps.flatMap((s) => s.covers).filter((id) => !ids.has(id));
  if (unknown.length) {
    throw new Error(
      `The plan has steps for requirements that do not exist: ${unknown.join(', ')}.`
    );
  }
  const out: Flow = {
    ...f,
    answered: mergeAnswers(f.answered ?? [], f.questions ?? []),
    stage: 'planning',
    requirements: r.requirements,
    assumptions: r.assumptions,
    writes: r.writes,
    questions: r.questions.map((q) => ({
      q: q.q,
      why: q.why,
      options: q.options,
      ...(q.recommended !== null && q.options[q.recommended] !== undefined
        ? { recommended: q.recommended }
        : {})
    })),
    steps: r.steps.map((s, i) => ({ n: i + 1, text: s.text, covers: s.covers, state: 'todo' }))
  };
  if (pendingChanges(f).length) {
    // A change re-plan returns the steps still to do: the built steps stay, and the new ones follow.
    const built = (f.steps ?? []).filter((s) => s.state === 'done');
    out.steps = [
      ...built.map((s, i) => ({ ...s, n: i + 1 })),
      ...r.steps.map((s, i) => ({
        n: built.length + i + 1,
        text: s.text,
        covers: s.covers,
        state: 'todo' as const
      }))
    ];
    out.changes = (f.changes ?? []).map((c) => ({ ...c, planned: true }));
  }
  return { ...out, need: planNeed(out) };
}

/** The earlier answers plus the newly answered questions: one answer for each question, the latest. */
export function mergeAnswers(earlier: Answered[], questions: Question[]): Answered[] {
  const byQ = new Map(earlier.map((x) => [x.q, x.a]));
  for (const q of questions) {
    if (q.a) {
      byQ.delete(q.q);
      byQ.set(q.q, q.a);
    }
  }
  return [...byQ].map(([q, a]) => ({ q, a }));
}

/** Changes earlier answer `i` (0-based). The plan is then out of date, so the need asks for a re-plan. */
export function answerEarlier(f: Flow, i: number, answer: string): Flow {
  const list = f.answered ?? [];
  if (!list[i]) {
    throw new Error(`The plan has no earlier answer ${i + 1}.`);
  }
  const a = answer.trim();
  if (!a) {
    throw new Error('An earlier answer cannot be empty. Add a comment instead, then re-plan.');
  }
  return {
    ...f,
    answered: list.map((x, j) => (j === i ? { ...x, a } : x)),
    need: {
      kind: 'decision',
      ask: 'An earlier answer changed: re-plan with it',
      actions: [{ id: 'replan', label: 'Re-plan with answers' }]
    }
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the developer does next with a plan: answer the questions, re-plan, or approve. */
export function planNeed(f: Flow): Need {
  if (pendingChanges(f).length) {
    return {
      kind: 'decision',
      ask: 'Plan your change: re-plan',
      actions: [{ id: 'replan', label: 'Re-plan' }]
    };
  }
  const all = f.questions ?? [];
  const open = all.filter((q) => !q.a).length;
  if (open) {
    const more = open < all.length ? ' more' : '';
    return {
      kind: 'decision',
      ask: `Answer ${open}${more} ${open === 1 ? 'question' : 'questions'}, then re-plan`,
      actions: [{ id: 'replan', label: 'Re-plan without answers' }]
    };
  }
  if (all.length) {
    return {
      kind: 'decision',
      ask: 'All questions answered: re-plan with your answers',
      actions: [{ id: 'replan', label: 'Re-plan with answers' }]
    };
  }
  return {
    kind: 'decision',
    ask: `Approve the plan: ${plural(f.requirements?.length ?? 0, 'requirement')}, ${plural(f.steps?.length ?? 0, 'step')}`,
    actions: [
      { id: 'approve', label: 'Approve plan and start' },
      { id: 'replan', label: 'Re-plan' }
    ]
  };
}

/** Records the developer's answer to question `i` (0-based). An empty answer clears it. */
export function answerQuestion(f: Flow, i: number, answer: string): Flow {
  const qs = f.questions ?? [];
  if (!qs[i]) {
    throw new Error(`The plan has no question ${i + 1}.`);
  }
  const a = answer.trim();
  const questions = qs.map((q, j) => (j === i ? { ...omit(q, 'a'), ...(a ? { a } : {}) } : q));
  const out = { ...f, questions };
  return { ...out, need: planNeed(out) };
}
