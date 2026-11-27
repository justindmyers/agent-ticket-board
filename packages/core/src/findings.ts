import { z } from 'zod';
import { audit } from './audit';
import { loadFlow, saveFlow } from './agents';
import { reviewNeed, withFixAction } from './review';
import type { Finding, Flow, Ticket } from './types';
import { REUSE_RULES } from './reuse';

// The developer decides what happens to each finding of the review: fix it (also one that the
// checker dropped), or let it be. The fixes of the chosen findings are one run of one agent.

export type Decision = 'fix' | 'dismiss' | null;

/** The findings that the developer chose to fix and that are not fixed yet. */
export const chosenFindings = (f: Flow): Finding[] =>
  (f.codeReview?.findings ?? []).filter((x) => x.decision === 'fix' && x.state !== 'fixed');

/** The record with one finding marked. `null` takes the mark away. The buttons follow the marks. */
export function markFinding(f: Flow, id: string, decision: Decision): Flow {
  const review = f.codeReview;
  const found = review?.findings.find((x) => x.id === id);
  if (!review || !found) {
    throw new Error(`There is no finding ${id}.`);
  }
  if (found.state === 'fixed') {
    throw new Error(`${id} is fixed already.`);
  }
  const findings = review.findings.map((x) => {
    if (x.id !== id) {
      return x;
    }
    const { decision: _old, ...rest } = x;
    void _old;
    return decision ? { ...rest, decision } : rest;
  });
  const next: Flow = { ...f, codeReview: { ...review, findings } };
  return { ...next, need: withFixAction(f.need ?? reviewNeed(findings), findings) };
}

/** Marks a finding of a ticket and saves it. The developer's choice goes into the audit log. */
export async function setFindingDecision(key: string, id: string, decision: Decision) {
  const f = await loadFlow(key);
  if (!f) {
    throw new Error(`${key}: there is no agent record.`);
  }
  await saveFlow(key, markFinding(f, id, decision), 'developer');
  await audit(key, 'developer', 'finding', { id, decision: decision ?? 'cleared' });
}

/** Why the fix of the chosen findings cannot start, or null. */
export function canFixFindings(f: Flow | null): string | null {
  if (!f?.worktree) {
    return 'The ticket has no worktree.';
  }
  return chosenFindings(f).length ? null : 'Choose the findings to fix first.';
}

const FixSchema = z.object({
  findings: z.array(
    z.object({
      id: z.string().describe('The finding id, F1, F2, ...'),
      fixed: z.boolean().describe('True only when you changed the code and the change works'),
      note: z
        .string()
        .describe('When not fixed: why. When the finding was wrong after all: what the code does')
    })
  ),
  summary: z.string().describe('Two or three sentences for the developer')
});

export type FixResult = z.infer<typeof FixSchema>;

export const FIX_SCHEMA = z.toJSONSchema(FixSchema, { target: 'draft-7' }) as unknown as Record<
  string,
  unknown
>;

export function parseFix(output: unknown): FixResult {
  const r = FixSchema.safeParse(output);
  if (!r.success) {
    throw new Error(
      `The agent's fix result has an unexpected shape. ${z.prettifyError(r.error).slice(0, 300)}`
    );
  }
  return r.data;
}

export function fixPrompt(t: Ticket, f: Flow, commands: string[]) {
  const chosen = chosenFindings(f);
  return [
    `You fix chosen findings of the code review for the ticket ${t.key}: ${t.summary}`,
    'The developer read each finding below and chose to fix it. Fix exactly these. Start no new review.',
    '',
    '# Rules',
    '- Open the file at the line and read the code. Then change it, in the first pass, to follow the repository standards:',
    '  its CLAUDE.md, its skills, its lint, type and test rules. Match the code next to your change.',
    '- A finding that the checker dropped is in this list because the developer wants it fixed. Fix it also when the checker found',
    '  no problem. When the code really has no problem, set fixed to false and say what the code does.',
    ...REUSE_RULES,
    '- After your changes run the targeted checks for the files that you changed: lint, and the tests of those files.',
    '  Run them one after the other, never at the same time. Add --maxWorkers=2 to the tests.',
    '- Do not commit, push or open a pull request. Do not start a dev server.',
    ...(commands.length
      ? [
          `- Shell commands that you may run, one for each call: ${commands.join('; ')}. Anything else is refused.`,
          '  Do not chain commands with &&, || or ;.'
        ]
      : []),
    '',
    '# Findings to fix',
    ...chosen.map(
      (x) =>
        `- ${x.id} (${x.reviewer}) ${x.file}:${x.line}: ${x.problem}\n  Fix: ${x.fix}${x.state === 'dropped' && x.note ? `\n  The checker dropped it because: ${x.note}` : ''}`
    )
  ].join('\n');
}

/** The record after the fixes: each chosen finding is fixed, or still open with the reason. */
export function applyFix(f: Flow, r: FixResult): Flow {
  const review = f.codeReview;
  if (!review) {
    return f;
  }
  const result = new Map(r.findings.map((x) => [x.id, x]));
  const findings = review.findings.map((x) => {
    const got = x.decision === 'fix' ? result.get(x.id) : undefined;
    if (!got) {
      return x;
    }
    const { decision: _d, ...rest } = x;
    void _d;
    return got.fixed
      ? { ...rest, state: 'fixed' as const, note: got.note }
      : {
          ...rest,
          state: x.state === 'dropped' ? ('dropped' as const) : ('open' as const),
          note: got.note
        };
  });
  return {
    ...f,
    codeReview: { ...review, summary: r.summary, findings },
    need: reviewNeed(findings)
  };
}
