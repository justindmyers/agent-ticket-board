import { CONFIG } from './config';
import type { AfterMerge, Flow, Pr } from './types';

// The local agent record yields to the tracker (status) and GitHub (code). When the tracker is behind
// GitHub, the developer approves the move, or allows the agent to make it.
export function reconcile(
  f: Flow | null,
  status: string | undefined,
  pr: Pr | null | undefined,
  target: AfterMerge = { to: CONFIG.tracker.afterMerge, source: 'default' }
): Flow | null {
  if (!f) {
    return null;
  }
  const out: Flow = { ...f, ...(pr ? { pr } : {}) };
  const merged = pr?.state === 'Merged';
  const finished =
    !!status && CONFIG.tracker.finished.some((s) => s.toLowerCase() === status.toLowerCase());

  if (finished || merged) {
    out.stage = 'ship';
    out.closed = finished
      ? {
          reason: 'tracker',
          text: `Jira says ${status}.${merged ? ` Pull request #${pr.number} merged.` : ''}`
        }
      : { reason: 'merged', text: `Pull request #${pr!.number} merged on GitHub.` };
    out.steps = out.steps?.map((s) => ({ ...s, state: 'done' as const }));
    out.checks = undefined;
    delete out.need;
    if (merged && !finished) {
      const jira = status ?? 'an open status';
      if (target.to) {
        out.need = {
          kind: 'decision',
          from: 'sync',
          to: target.to,
          ask: `Pull request #${pr.number} merged, but Jira still says ${jira}.`,
          actions: [
            { id: `move:${target.to}`, label: `Move to ${target.to}` },
            { id: 'openPr', label: 'View the PR' }
          ]
        };
      } else {
        // A branch rule says: ask. The agent never picks the status for this ticket.
        out.need = {
          kind: 'decision',
          from: 'sync',
          ask: `Pull request #${pr.number} merged from ${pr.branch ?? 'its branch'}. Pick the Jira status (now ${jira}).`,
          actions: [
            ...CONFIG.tracker.finished.map((s) => ({ id: `move:${s}`, label: `Move to ${s}` })),
            { id: 'openPr', label: 'View the PR' }
          ]
        };
      }
    }
    return out;
  }

  if (pr?.state === 'Closed') {
    out.need = {
      kind: 'problem',
      ask: `Pull request #${pr.number} closed without a merge.`,
      actions: [
        { id: 'openPr', label: 'View the PR' },
        { id: 'replan', label: 'Re-plan' }
      ]
    };
    return out;
  }
  if (f.stage === 'ship' && pr) {
    out.checks = undefined;
    if (pr.failing) {
      out.need = {
        kind: 'problem',
        ask: `CI: ${pr.checks} on pull request #${pr.number}.`,
        actions: [
          { id: 'fix', label: 'Fix' },
          { id: 'openPr', label: 'View the PR' }
        ]
      };
    } else if (!f.need?.actions.some((a) => a.id === 'createPr')) {
      // An update that waits for approval stays: it is the step that the developer is in.
      delete out.need;
    }
  }
  return out;
}
