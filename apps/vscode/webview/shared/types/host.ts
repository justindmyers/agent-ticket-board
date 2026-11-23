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
  | { type: 'layout'; queue: boolean };
