import type { Write } from './writes';
import type { AgentKind, Stage } from './look';

export { STAGES, type AgentKind, type Stage } from './look';

export type Action = { id: string; label: string };

/** What the agent or the sync needs from the developer: one line, plus the actions for it. */
export type Need = {
  kind: 'problem' | 'decision';
  from?: 'sync';
  /** One short line: the list shows it. */
  ask: string;
  /** The longer reason: the ticket shows it, and the list shows it as a tooltip. */
  detail?: string;
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
};

/** A planning question. `recommended` is the index of the option that the agent recommends. */
export type Question = {
  q: string;
  a?: string;
  why?: string;
  options?: string[];
  recommended?: number;
};

/** An answer from an earlier plan. */
export type Answered = { q: string; a: string };

/** The evidence that one requirement works: a passing test, or screenshots that the agent checked. */
export type Evidence = {
  ok: boolean;
  test?: string;
  shots?: string[];
  seen?: string;
  /**
   * Where the evidence came from. real: data of the real backend. fake: any faked API answer
   * (mock.js) took part. none: a test alone proves it, with no app data.
   */
  data?: 'real' | 'fake' | 'none';
  /** A failing requirement: what should be true, in one plain sentence. */
  expected?: string;
  /** A failing requirement: what the test found instead, naming the case. */
  found?: string;
  note?: string;
};

/** What Testing did with an approved write: made against the backend, or not made, and why. */
export type WriteRun = { method: string; path: string; made: boolean; result: string };

/** The push of the branch: what the developer saw, and when it ran. */
export type Push = {
  branch: string;
  head: string;
  commits: { sha: string; short: string; title: string }[];
  command: string;
  dryRun: string;
  /** The web address of the repository on origin, when it is on GitHub. Links need it. */
  url?: string;
  at: string;
  pushedAt?: string;
};

export type Step = {
  n: number;
  text: string;
  covers: string[];
  state: 'done' | 'current' | 'todo';
  /** The agent's note, for example why a step is not done. */
  note?: string;
};

/** One finding of the code review. */
export type Finding = {
  id: string;
  reviewer: string;
  file: string;
  line: number;
  problem: string;
  fix: string;
  severity: 'blocking' | 'style';
  state: 'fixed' | 'open' | 'dropped';
  note: string;
  /** The developer's choice: fix it, also a dropped one, or let it be. */
  decision?: 'fix' | 'dismiss';
};

/** The result of the review round: the findings, the repository checks and a summary. */
export type CodeReview = {
  at: string;
  summary: string;
  findings: Finding[];
  checks: { name: string; ok: boolean; note?: string }[];
};

/** The pre-push gate: each step, in order. It stops at the first step that fails. */
export type Gate = {
  at: string;
  ok: boolean;
  /** True when the merge of the base branch brought changes. */
  merged: boolean;
  /** True when the checks ran on the change before the commits: nothing was merged. */
  verify?: true;
  /** A fingerprint of the content that the checks passed on. The pre-push gate skips a repeat pass on it. */
  tree?: string;
  /** The commit that the pre-push gate checked, after its merge. A push needs the same commit. */
  head?: string;
  /** `name` is the description. `command` is what ran, when the name is not already the command. */
  steps: { name: string; command?: string; ok: boolean; note?: string }[];
};

/** The commits of Code review: the plan that the developer approves, and the commits made. */
export type Commits = {
  plan: { title: string; files: string[] }[];
  done: { title: string; sha: string }[];
  summary?: string;
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

/** One agent run for a stage. The service writes it; `session` is the Claude Code session id. */
export type AgentRun = {
  /** The run's folder name in the audit log. */
  id?: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'stopped';
  stage: Stage;
  /** `gate`: the pre-push checks. The board runs them, with no agent. */
  task?: 'gate' | 'verify' | 'review-fix' | 'commit-plan' | 'commit';
  started: string;
  model: string;
  ended?: string;
  session?: string;
  cost?: number;
  error?: string;
  /** Testing: the run waits for the developer to log in to the browser. */
  waiting?: 'login';
  /** Testing: the address of the worktree's app. */
  app?: string;
  /** What the agent does now, from its last tool call. */
  activity?: string;
};

/** The local agent record for one ticket. The service writes it; every client reads it. */
/** A change that the developer asked for after the build. */
export type Change = { text: string; at: string; planned?: boolean };

export type Flow = {
  stage: Stage;
  need?: Need;
  requirements?: Req[];
  questions?: Question[];
  /** Answers to the questions of earlier plans. Each re-plan gets them. */
  answered?: Answered[];
  /** What the agent decided where the ticket is not clear. */
  assumptions?: string[];
  steps?: Step[];
  /** The writes to the backend that testing may make. Moving the ticket to Testing approves them. */
  writes?: Write[];
  /** What the developer asked to change after the build. A re-plan plans the pending ones. */
  changes?: Change[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  /** Testing: the evidence for each requirement id. */
  evidence?: Record<string, Evidence>;
  /** The result of each approved write, from the last test run. */
  writeRuns?: WriteRun[];
  /** Code review: the push, shown as a dry run first, and then made. */
  push?: Push;
  /** Code review: what the reviewers found and what the agent fixed. */
  codeReview?: CodeReview;
  /** Code review: the last run of the pre-push checks. */
  gate?: Gate;
  commits?: Commits;
  /** When the developer approved the tested change. */
  approved?: string;
  /** The cost of every agent run of this ticket, in US dollars. */
  spent?: number;
  /** Testing: the port of the last test run. The next run uses it again, so the login stays valid. */
  testPort?: number;
  app?: string;
  pr?: Pr;
  branch?: string;
  worktree?: string;
  adopted?: string;
  /** The last hand-back from a Claude Code chat: what changed there. */
  chat?: { at: string; summary: string };
  run?: AgentRun;
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

/** The one-line agent summary that a queue row shows. */
export type Agent = {
  stage: Stage;
  stageLabel: string;
  kind: AgentKind;
  closed?: string;
  ask?: string;
  detail?: string;
  action?: Action;
  progress?: string;
};
