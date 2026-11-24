import { CONFIG } from './config';
import { flowFor, STATUS } from './agents';
import { LOCAL, localView } from './local-work';
import { trackerState, workState } from './tracker-state';
import { STAGES, type Agent, type Ticket } from './types';

// One queue model for every client: VS Code sidebar, inbox, board, Claude Code pane and CLI.
export function agentFor(key: string): Agent | null {
  const f = flowFor(key);
  if (!f) {
    return null;
  }
  const stageLabel = STAGES.find((s) => s.id === f.stage)!.label;
  if (f.closed && !f.need) {
    const label = f.closed.reason === 'merged' ? 'Merged' : 'Finished';
    return { stage: f.stage, stageLabel: label, kind: 'finished', closed: f.closed.text };
  }
  if (f.need) {
    return {
      stage: f.stage,
      stageLabel,
      kind: f.need.kind,
      ask: f.need.ask,
      action: f.need.actions[0]
    };
  }
  if (f.stage === 'development') {
    const cur = (f.steps ?? []).findIndex((s) => s.state === 'current');
    return {
      stage: f.stage,
      stageLabel,
      kind: 'running',
      progress: cur >= 0 ? `${cur + 1}/${f.steps!.length}` : undefined
    };
  }
  return { stage: f.stage, stageLabel, kind: 'waiting' };
}

export function groupOf(t: Ticket, a: Agent | null): string {
  if (a?.kind === 'problem' || a?.kind === 'decision') {
    return 'Needs you';
  }
  if (a?.kind === 'running') {
    return 'Running';
  }
  return t.status;
}

/** Needs you (problems first), Running, then the tracker columns. Empty groups drop out. */
export function grouped<T extends Ticket>(tickets: T[]) {
  for (const t of tickets) {
    STATUS[t.key] = t.status;
  }
  const map = new Map<string, T[]>();
  for (const t of tickets) {
    const g = groupOf(t, agentFor(t.key));
    map.set(g, [...(map.get(g) ?? []), t]);
  }
  const rank = (t: T) => (agentFor(t.key)?.kind === 'problem' ? 0 : 1);
  map.get('Needs you')?.sort((a, b) => rank(a) - rank(b));
  const order = CONFIG.tracker.columns;
  const rest = [...map.keys()].filter(
    (k) => k !== 'Needs you' && k !== 'Running' && !order.includes(k)
  );
  return ['Needs you', 'Running', ...order, ...rest]
    .filter((g) => map.has(g))
    .map((g) => ({
      group: g,
      state: g === 'Needs you' || g === 'Running' ? undefined : trackerState(g),
      tickets: map.get(g)!
    }));
}

/** The JSON shape that the CLI prints and the Claude Code pane reads. */
export function shapeSprint(s: { at: string | null; tickets: Ticket[] }) {
  return {
    at: s.at,
    groups: grouped(s.tickets).map((g) => ({
      group: g.group,
      state: g.state,
      tickets: g.tickets.map((t) => ({
        key: t.key,
        summary: t.summary,
        status: t.status,
        type: t.type,
        points: t.points,
        updated: t.updated,
        state: workState(t.status, LOCAL[t.key]),
        local: localView(t.key),
        agent: agentFor(t.key)
      }))
    }))
  };
}
