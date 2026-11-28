import { runActive } from './look';
import { planNeed } from './planning';
import { DRY_RUN_NOTE } from './push';
import type { Flow, Need, Push } from './types';

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
  if (
    (f.stage === 'code-review' || f.stage === 'ship') &&
    !f.pr &&
    f.run?.task &&
    f.run.state === 'stopped'
  ) {
    const again = {
      gate: ['Preparing the push was stopped.', 'startGate', 'Prepare the push again'],
      verify: ['The checks were stopped.', 'startVerify', 'Run the checks again'],
      'commit-plan': ['Planning the commits was stopped.', 'startCommitPlan', 'Plan the commits'],
      'review-fix': ['The fixes were stopped.', 'startReviewFix', 'Fix the chosen findings'],
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

/**
 * A record from before the Ship stage has the commits, the pre-push gate and the pull request in
 * Code review. Once a ticket has any of them it is in Ship.
 */
export function migrateStage(input: Flow): Flow {
  let f = input;
  const shipped = f.commits || f.push || f.pr || (f.gate && !f.gate.verify);
  if (f.stage === 'code-review' && shipped) {
    f = { ...f, stage: 'ship' };
  }
  // A preview from before the commits were records: `short-hash title`. It has no full hash.
  if (f.push?.commits?.some((c) => typeof c === 'string')) {
    f = {
      ...f,
      push: {
        ...f.push,
        commits: (f.push.commits as unknown as (string | Push['commits'][number])[]).map((c) => {
          if (typeof c !== 'string') {
            return c;
          }
          const [short = '', ...title] = c.split(' ');
          return { sha: '', short, title: title.join(' ') };
        })
      }
    };
  }
  // A preview from before the Push section kept everything in one long line. The section has it now.
  if (f.push && !f.push.pushedAt && f.need?.actions.some((a) => a.id === 'approvePush')) {
    f = { ...f, need: { ...f.need, detail: DRY_RUN_NOTE } };
  }
  // The preview button changed its words. A saved next step keeps the old ones, so it is renamed here.
  const word = f.push ? 'Refresh the preview' : 'Preview the push';
  if (f.need?.actions.some((a) => a.id === 'showPush' && a.label !== word)) {
    f = {
      ...f,
      need: {
        ...f.need,
        actions: f.need.actions.map((a) => (a.id === 'showPush' ? { ...a, label: word } : a))
      }
    };
  }
  return f;
}

/** The record with its next step filled in, when it had none. */
export function withNextStep(input: Flow): Flow {
  const f = migrateStage(input);
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
  // The pre-push gate passed, and the push is not shown yet. A gate from before the push step has no
  // checked commit recorded: a push needs one, so the gate runs again. Otherwise the push is next.
  if (
    f.stage === 'ship' &&
    f.gate?.ok &&
    !f.gate.verify &&
    !f.push &&
    !runActive(f) &&
    f.need?.kind === 'decision'
  ) {
    const has = (id: string) => f.need!.actions.some((a) => a.id === id);
    if (f.gate.head && !has('showPush')) {
      return {
        ...f,
        need: {
          ...f.need,
          actions: [{ id: 'showPush', label: 'Preview the push' }, ...f.need.actions]
        }
      };
    }
    if (!f.gate.head && !has('startGate')) {
      return {
        ...f,
        need: {
          ...f.need,
          detail:
            f.need.detail ??
            'This check ran before the push step existed. Prepare the push again to record the commit that it checks.',
          actions: [{ id: 'startGate', label: 'Prepare the push again' }, ...f.need.actions]
        }
      };
    }
  }
  const need = restingNeed(f);
  return need ? { ...f, need } : f;
}
