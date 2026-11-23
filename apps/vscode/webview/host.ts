// Bridge to the extension host. Every client (VS Code, Claude Code pane) sends the same messages.
import { useEffect, useState } from 'react';

export type Kind = 'problem' | 'decision' | 'running' | 'waiting' | 'finished';
export type Agent = {
  stage: string;
  stageLabel: string;
  kind: Kind;
  closed?: string;
  ask?: string;
  action?: { id: string; label: string };
  progress?: string;
};
export type QueueTicket = {
  key: string;
  summary: string;
  status: string;
  type?: string;
  points: number | null;
  updated: string | null;
  agent: Agent | null;
};
export type Group = { group: string; tickets: QueueTicket[] };
export type Snapshot = { at: string | null; groups: Group[]; updating: boolean; pending: number };

export type Need = {
  kind: 'problem' | 'decision';
  from?: 'sync';
  ask: string;
  actions: { id: string; label: string }[];
};
export type Flow = {
  stage: 'planning' | 'development' | 'testing' | 'code-review';
  need?: Need;
  requirements?: {
    id: string;
    text: string;
    check: string;
    evidence?: { kind: string; label: string };
    met?: boolean;
  }[];
  questions?: { q: string; a?: string }[];
  steps?: { n: number; text: string; covers: string[]; state: 'done' | 'current' | 'todo' }[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  app?: string;
  pr?: {
    number: number;
    url: string;
    state?: string;
    checks: string;
    failing?: number;
    reviews: string;
    comments: number;
  };
  branch?: string;
  session?: string;
  closed?: { reason: 'tracker' | 'merged'; text: string };
};
export type Detail = {
  ticket: QueueTicket & {
    priority?: string;
    labels?: string[];
    reporter?: string;
    description?: unknown;
  };
  flow: Flow | null;
  comments: { id: string; text: string; at: string; ran?: boolean }[];
  jira?: {
    agentMayMove: boolean;
    afterMerge: { to: string | null; source: 'ticket' | 'rule' | 'default'; rule?: string };
    defaultAfterMerge: string;
    afterMergeOptions: string[];
    moves: {
      at: string;
      from?: string;
      to: string;
      by: 'you' | 'agent';
      ok: boolean;
      dryRun?: boolean;
    }[];
  };
  fresh: boolean;
};

declare function acquireVsCodeApi(): {
  postMessage(m: unknown): void;
  getState(): Record<string, unknown> | undefined;
  setState(s: unknown): void;
};
const api = acquireVsCodeApi();
export const send = (m: Record<string, unknown>) => api.postMessage(m);

/** Webview state survives tab switches and reloads (width, selection, open tab per ticket, drafts). */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => ((api.getState() ?? {})[key] as T | undefined) ?? initial);
  useEffect(() => {
    api.setState({ ...(api.getState() ?? {}), [key]: v });
  }, [key, v]);
  return [v, setV];
}

/** Messages from the extension host. */
export type HostMsg =
  | ({ type: 'data' } & Snapshot)
  | { type: 'warn' | 'error'; message: string }
  | { type: 'loading' }
  | ({ type: 'ticket' } & Detail)
  | { type: 'select'; key: string }
  | { type: 'current'; key: string | null }
  | { type: 'layout'; queue: boolean };

export function useHostMessages(on: (m: HostMsg) => void) {
  useEffect(() => {
    const h = (e: MessageEvent) => on(e.data);
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [on]);
}
