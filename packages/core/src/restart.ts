import type { Flow } from './types';

// Start over: the work of a ticket goes to an archive, the worktree and its branch go away, and
// the ticket returns to Planning. The plan keeps its requirements, so the next plan builds on them.

/** What the first build taught: each defect that the review fixed, as a rule for the next build. */
export function lessonsText(f: Flow): string {
  const fixed = (f.codeReview?.findings ?? []).filter(
    (x) => x.severity === 'blocking' && x.state !== 'dropped'
  );
  const failed = Object.entries(f.evidence ?? {}).filter(([, e]) => !e.ok && e.note);
  return [
    'Lessons from the first build, which was archived. Build it right the first time:',
    '- Follow the repository standards in the first pass: its CLAUDE.md, skills, lint, type and test rules, the reuse rules and the test setup. No finding about style or standards may remain after Development.',
    ...fixed.map((x) => `- ${x.file}:${x.line}: ${x.problem} Fix: ${x.fix}`),
    ...failed.map(([id, e]) => `- ${id} did not pass in Testing: ${e.note}`)
  ].join('\n');
}

/**
 * The record after a start over: Planning again, with the requirements, assumptions and answers
 * of the first plan. Everything that the build, the tests and the review made is gone.
 */
export function startOver(f: Flow): Flow {
  return {
    stage: 'planning',
    requirements: f.requirements,
    assumptions: f.assumptions,
    answered: f.answered,
    writes: f.writes,
    spent: f.spent,
    need: {
      kind: 'decision',
      ask: 'Started over. Re-plan with the lessons of the first build.',
      actions: [{ id: 'startPlanning', label: 'Re-plan' }]
    }
  };
}
