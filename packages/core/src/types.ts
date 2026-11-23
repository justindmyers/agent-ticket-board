export type Stage = 'planning' | 'development' | 'testing' | 'code-review';

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'development', label: 'Development' },
  { id: 'testing', label: 'Testing' },
  { id: 'code-review', label: 'Code review' }
];

export type Action = { id: string; label: string };

/** What the agent or the sync needs from the developer: one line, plus the actions for it. */
export type Need = {
  kind: 'problem' | 'decision';
  from?: 'sync';
  ask: string;
  actions: Action[];
  /** For a sync need: the one status that the agent may apply by itself, if the developer allowed it. */
  to?: string;
};

/** Where a ticket goes in Jira after its pull request merges, and why. */
export type AfterMerge = {
  to: string | null;
  source: 'ticket' | 'rule' | 'default';
  rule?: string;
};

export type Req = {
  id: string;
  text: string;
  check: string;
  evidence?: { kind: 'test' | 'screenshot'; label: string };
  met?: boolean;
};

export type Step = {
  n: number;
  text: string;
  covers: string[];
  state: 'done' | 'current' | 'todo';
};

export type Pr = {
  number: number;
  branch?: string;
  url: string;
  state: string;
  draft: boolean;
  checks: string;
  failing: number;
  reviews: string;
  comments: number;
};

/** The local agent record for one ticket. The service writes it; every client reads it. */
export type Flow = {
  stage: Stage;
  need?: Need;
  requirements?: Req[];
  questions?: { q: string; a?: string }[];
  steps?: Step[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  app?: string;
  pr?: Pr;
  branch?: string;
  session?: string;
  closed?: { reason: 'tracker' | 'merged'; text: string };
};

export type Ticket = {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  labels: string[];
  points: number | null;
  updated: string | null;
  description?: unknown;
  reporter?: string;
  comments?: { author: string; created: string; body: unknown }[];
  detailAt?: string;
};

export type AgentKind = 'problem' | 'decision' | 'running' | 'waiting' | 'finished';

/** The one-line agent summary that a queue row shows. */
export type Agent = {
  stage: Stage;
  stageLabel: string;
  kind: AgentKind;
  closed?: string;
  ask?: string;
  action?: Action;
  progress?: string;
};
