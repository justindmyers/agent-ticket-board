import { CONFIG } from './config';
import { loadSettings, SETTINGS } from './settings';
import { moveEvents } from './moves';
import type { AfterMerge, Pr } from './types';

/**
 * The Jira status for a ticket after its merge. Order: the developer's choice for this ticket,
 * then the first branch rule that matches the pull request branch, then the configured default.
 */
export function afterMergeFor(key: string, pr: Pr | null | undefined): AfterMerge {
  const own = SETTINGS[key]?.afterMerge;
  if (own) {
    return { to: own, source: 'ticket' };
  }
  const branch = pr?.branch ?? '';
  const rule = CONFIG.tracker.afterMergeRules.find((r) => new RegExp(r.branch).test(branch));
  if (rule) {
    return { to: rule.to, source: 'rule', rule: rule.branch };
  }
  return { to: CONFIG.tracker.afterMerge, source: 'default' };
}

/** The statuses that a developer can pick for after the merge. */
export function afterMergeOptions(): string[] {
  const fromRules = CONFIG.tracker.afterMergeRules.map((r) => r.to).filter((s): s is string => !!s);
  return [...new Set([...CONFIG.tracker.finished, CONFIG.tracker.afterMerge, ...fromRules])];
}

/** The Jira section of a ticket page, the same in every client. */
export async function jiraPanel(key: string, pr: Pr | null | undefined) {
  await loadSettings();
  return {
    agentMayMove: !!SETTINGS[key]?.agentMayMoveJira,
    afterMerge: afterMergeFor(key, pr),
    defaultAfterMerge: CONFIG.tracker.afterMerge,
    afterMergeOptions: afterMergeOptions(),
    moves: (await moveEvents(key)).slice(-3).reverse()
  };
}
