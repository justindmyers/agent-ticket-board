import { runActive } from './look';
import { planNeed } from './planning';
import type { Flow, Need } from './types';

// Every record that is not running and not finished offers the developer a next step. A run that was
// stopped, or an old record, can lose its need: this works it out from the state of the record.

/** The next step for a record that has no need, or null when the clients show their own action. */
export function restingNeed(f: Flow): Need | null {
  if (f.need || f.closed || runActive(f)) {
    return null;
  }
  if (f.stage === 'planning' && f.requirements?.length) {
    return planNeed(f);
  }
  if (f.stage === 'development' && (f.run?.state === 'stopped' || f.run?.state === 'failed')) {
    const done = (f.steps ?? []).filter((s) => s.state === 'done').length;
    return {
      kind: 'decision',
      ask: `Building was stopped. ${done} of ${f.steps?.length ?? 0} steps are done.`,
      actions: [
        // A gate that passed before the stop still counts: the developer can test what is there.
        ...(f.checks?.length && f.checks.every((c) => c.ok)
          ? [{ id: 'toTesting', label: 'Move to Testing' }]
          : []),
        { id: 'startDevelopment', label: 'Start again' }
      ]
    };
  }
  if (f.stage === 'testing' && (f.run?.state === 'stopped' || f.run?.state === 'failed')) {
    return {
      kind: 'decision',
      ask: 'Testing was stopped.',
      actions: [{ id: 'startTesting', label: 'Test again' }]
    };
  }
  if (f.stage === 'code-review' && !f.pr && f.run?.task && f.run.state === 'stopped') {
    const again = {
      gate: ['The checks were stopped.', 'startGate', 'Run the checks again'],
      verify: ['The checks were stopped.', 'startVerify', 'Run the checks again'],
      'commit-plan': ['Planning the commits was stopped.', 'startCommitPlan', 'Plan the commits'],
      commit: ['Making the commits was stopped.', 'startCommitPlan', 'Plan the commits again']
    }[f.run.task];
    return {
      kind: 'decision',
      ask: again[0]!,
      actions: [{ id: again[1]!, label: again[2]! }]
    };
  }
  if (
    f.stage === 'code-review' &&
    !f.pr &&
    (f.run?.state === 'stopped' || f.run?.state === 'failed')
  ) {
    return {
      kind: 'decision',
      ask: 'The review was stopped.',
      actions: [{ id: 'startCodeReview', label: 'Review again' }]
    };
  }
  return null;
}

/** The record with its next step filled in, when it had none. */
export function withNextStep(f: Flow): Flow {
  // An approval from before the review stage existed has only "Open worktree". Offer the review.
  if (
    f.stage === 'testing' &&
    f.approved &&
    !f.codeReview &&
    !f.closed &&
    !runActive(f) &&
    f.need?.kind === 'decision' &&
    !f.need.actions.some((a) => a.id === 'startCodeReview')
  ) {
    return {
      ...f,
      need: {
        ...f.need,
        actions: [{ id: 'startCodeReview', label: 'Start code review' }, ...f.need.actions]
      }
    };
  }
  const need = restingNeed(f);
  return need ? { ...f, need } : f;
}
