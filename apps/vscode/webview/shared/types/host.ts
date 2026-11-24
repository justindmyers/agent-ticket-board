import type { SectionId, SettingsView } from './settings';

export type Kind = 'problem' | 'decision' | 'running' | 'waiting' | 'finished';

export type Agent = {
  stage: string;
  stageLabel: string;
  kind: Kind;
  closed?: string;
  ask?: string;
  detail?: string;
  action?: { id: string; label: string };
  progress?: string;
};

import type { TrackerState } from '@agent-ticket-board/core/look';
import type { AgentRun, Answered, Evidence, Question } from '@agent-ticket-board/core/types';

export type { AgentRun, Answered, Evidence, Question, TrackerState };

export type LocalWork = { branch: string; worktree: string | null; changed: number; label: string };

export type QueueTicket = {
  key: string;
  state?: TrackerState;
  local?: LocalWork | null;
  summary: string;
  status: string;
  type?: string;
  points: number | null;
  updated: string | null;
  agent: Agent | null;
};

export type Group = { group: string; state?: TrackerState; tickets: QueueTicket[] };

export type Snapshot = { at: string | null; groups: Group[]; updating: boolean; pending: number };

export type Need = {
  kind: 'problem' | 'decision';
  from?: 'sync';
  ask: string;
  detail?: string;
  actions: { id: string; label: string }[];
};

export type Write = { method: string; path: string; why: string };

export type Flow = {
  stage: 'planning' | 'development' | 'testing' | 'code-review';
  need?: Need;
  requirements?: {
    id: string;
    text: string;
    check: string;
  }[];
  questions?: Question[];
  answered?: Answered[];
  assumptions?: string[];
  writes?: Write[];
  steps?: {
    n: number;
    text: string;
    covers: string[];
    state: 'done' | 'current' | 'todo';
    note?: string;
  }[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  evidence?: Record<string, Evidence>;
  approved?: string;
  spent?: number;
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
  run?: AgentRun;
  closed?: { reason: 'tracker' | 'merged'; text: string };
};

export type JiraInfo = {
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

export type Detail = {
  ticket: QueueTicket & {
    priority?: string;
    labels?: string[];
    reporter?: string;
    description?: unknown;
  };
  flow: Flow | null;
  tracker?: { state: TrackerState; label: string; notice: string | null };
  adopt?: { stage: Flow['stage']; stageLabel: string; text: string } | null;
  comments: { id: string; text: string; at: string; ran?: boolean }[];
  jira?: JiraInfo;
  fresh: boolean;
};

export type HostMsg =
  | ({ type: 'data' } & Snapshot)
  | { type: 'warn' | 'error'; message: string }
  | { type: 'loading' }
  | ({ type: 'ticket' } & Detail)
  | { type: 'select'; key: string }
  | { type: 'current'; key: string | null }
  | { type: 'layout'; queue: boolean }
  | { type: 'settings'; view: SettingsView }
  | { type: 'detecting'; only: SectionId | null }
  | { type: 'settingsSaved'; saved: string[]; errors: Record<string, string> };
