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
      actions: [{ id: 'startDevelopment', label: 'Start again' }]
    };
  }
  return null;
}

/** The record with its next step filled in, when it had none. */
export function withNextStep(f: Flow): Flow {
  const need = restingNeed(f);
  return need ? { ...f, need } : f;
}
