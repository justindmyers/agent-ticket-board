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
    task?: 'gate' | 'verify' | 'review-fix' | 'commit-plan' | 'commit';
    model: string;
    cost?: number;
    waiting?: 'login';
    app?: string;
    activity?: string;
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
  }[];
  questions?: { q: string; a?: string; why?: string; options?: string[]; recommended?: number }[];
  answered?: { q: string; a: string }[];
  assumptions?: string[];
  writes?: { method: string; path: string; why: string }[];
  steps?: { n: number; text: string; covers: string[]; state: string; note?: string }[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  codeReview?: {
    at: string;
    summary: string;
    findings: {
      id: string;
      reviewer: string;
      file: string;
      line: number;
      problem: string;
      fix: string;
      severity: 'blocking' | 'style';
      state: 'fixed' | 'open' | 'dropped';
      note: string;
      decision?: 'fix' | 'dismiss';
    }[];
    checks: { name: string; ok: boolean; note?: string }[];
  };
  writeRuns?: { method: string; path: string; made: boolean; result: string }[];
  push?: {
    branch: string;
    head: string;
    commits: { sha: string; short: string; title: string }[];
    command: string;
    dryRun: string;
    url?: string;
    at: string;
    pushedAt?: string;
  };
  commits?: {
    plan: { title: string; files: string[] }[];
    done: { title: string; sha: string }[];
    summary?: string;
  };
  gate?: {
    at: string;
    ok: boolean;
    merged: boolean;
    verify?: true;
    steps: { name: string; command?: string; ok: boolean; note?: string }[];
  };
  evidence?: Record<
    string,
    {
      ok: boolean;
      test?: string;
      shots?: string[];
      seen?: string;
      data?: 'real' | 'fake' | 'none';
      expected?: string;
      found?: string;
      note?: string;
    }
  >;
  approved?: string;
  spent?: number;
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
