import type { AgentKind, TrackerState } from './look.gen';

// The JSON shapes that the `atb` CLI prints (`atb sprint`, `atb ticket <KEY>`).
export type Agent = {
  stage: string;
  stageLabel: string;
  kind: AgentKind;
  closed?: string;
  ask?: string;
  detail?: string;
  action?: { id: string; label: string };
  progress?: string;
} | null;

export type Row = {
  key: string;
  state?: TrackerState;
  summary: string;
  status: string;
  type?: string;
  points: number | null;
  local?: { label: string } | null;
  agent: Agent;
};

export type Sprint = { at: string | null; groups: { group: string; tickets: Row[] }[] };

export type Flow = {
  stage: string;
  run?: {
    state: 'queued' | 'running' | 'done' | 'failed' | 'stopped';
    stage?: string;
    model: string;
    cost?: number;
  };
  closed?: { reason: string; text: string };
  need?: {
    kind: 'problem' | 'decision';
    from?: 'sync';
    ask: string;
    detail?: string;
    actions: { id: string; label: string }[];
  };
  requirements?: {
    id: string;
    text: string;
    check: string;
    met?: boolean;
    evidence?: { label: string };
  }[];
  questions?: { q: string; a?: string; why?: string; options?: string[]; recommended?: number }[];
  answered?: { q: string; a: string }[];
  assumptions?: string[];
  steps?: { n: number; text: string; covers: string[]; state: string; note?: string }[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  app?: string;
  pr?: {
    number: number;
    url: string;
    state: string;
    checks: string;
    failing: number;
    reviews: string;
    comments: number;
  };
};

export type Jira = {
  agentMayMove: boolean;
  afterMerge: { to: string | null; source: 'ticket' | 'rule' | 'default'; rule?: string };
  defaultAfterMerge: string;
  afterMergeOptions: string[];
  moves: { from?: string; to: string; by: string; ok: boolean }[];
};

export type Detail = {
  ticket: Row & { priority?: string };
  flow: Flow | null;
  tracker?: { state: TrackerState; label: string; notice: string | null };
  adopt?: { stage: string; stageLabel: string; text: string } | null;
  comments: { id: string; text: string; ran?: boolean }[];
  sections: { title: string | null; kind: string; md: string }[] | null;
  jira?: Jira;
  jiraUrl: string | null;
};
