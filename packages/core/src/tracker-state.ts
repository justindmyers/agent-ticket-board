import { CONFIG } from './config';
import { localLabel, type LocalWork } from './local-work';

import type { TrackerState } from './look';

export type { TrackerState };

export type TrackerInfo = { state: TrackerState; label: string; notice: string | null };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function trackerState(status: string): TrackerState {
  if (CONFIG.tracker.finished.some((s) => same(s, status))) {
    return 'done';
  }
  if (CONFIG.tracker.blocked.some((s) => same(s, status))) {
    return 'blocked';
  }
  return CONFIG.tracker.notStarted.some((s) => same(s, status)) ? 'todo' : 'active';
}

/** The state a client colors a ticket by: Jira first, then local work moves a not-started ticket to active. */
export function workState(status: string, local?: LocalWork | null): TrackerState {
  const state = trackerState(status);
  return state === 'todo' && local ? 'active' : state;
}

// What a client shows for a ticket that has no agent record: Jira and the local git state are the truth.
export function trackerInfo(status: string, local?: LocalWork | null): TrackerInfo {
  const state = workState(status, local);
  const here = local ? localLabel(local) : null;
  if (state === 'done') {
    return {
      state,
      label: 'Finished in Jira',
      notice: here
        ? `Jira says ${status}. ${here}. It is still on this machine.`
        : `Jira says ${status}. The board has no agent work for this ticket.`
    };
  }
  if (here) {
    const label = trackerState(status) === 'todo' ? 'Started locally' : `${status} in Jira`;
    return { state, label, notice: `Jira says ${status}. ${here}.` };
  }
  if (state === 'active' || state === 'blocked') {
    return {
      state,
      label: `${status} in Jira`,
      notice: `Jira says ${status}. This work started outside the board.`
    };
  }
  return { state, label: 'Not started', notice: null };
}
