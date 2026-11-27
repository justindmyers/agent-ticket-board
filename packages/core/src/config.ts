import { homedir } from 'node:os';
import { join } from 'node:path';
import { set } from 'lodash-es';
import { checkValue, CONFIG_FIELDS } from './config-fields';
import { HOME } from './paths';
import { readJson, writeJson } from './files';

// Organization settings live on this machine (~/.agent-ticket-board/config.json), never in the repository.
export type Config = {
  tracker: {
    kind: 'jira-acli';
    site: string;
    project: string;
    jql: string;
    pointsField: string | null;
    columns: string[];
    notStarted: string[];
    blocked: string[];
    finished: string[];
    afterMerge: string;
    /** Rules on the pull request branch, for example infra or hotfix work. `to: null` means: ask the developer. */
    afterMergeRules: { branch: string; to: string | null }[];
  };
  repo: {
    path: string | null;
    remote: string | null;
    worktreeScript: string | null;
    branch: string;
    prTitle: string | null;
    /** The branch that a pull request targets, and that the gate merges. */
    baseBranch: string;
    /** The pre-push checks, in order. `{changed}` and `{tests}` are lists of files. */
    checks: string[];
    /** Commands that run in the worktree before the commit plan: generators, and checks of uncommitted files. */
    beforeCommit: string[];
    /** Test files that contain this text count as changed tests: they mock a shared package whole. */
    testMock: string | null;
    /** The commit and pull request types that the repository accepts. Empty: the common list. */
    commitTypes: string[];
  };
  app: {
    devCommand: string | null;
    ownerPort: number;
    buildPorts: [number, number];
    /** host:port of a service that must answer before Testing, for example a login service. */
    loginCheck: string | null;
    /** A localStorage key that the app reads its colour scheme from at load. Screenshots set it. */
    themeKey: string | null;
    /** The screenshot sizes, like 1400x900. Each is taken in light and in dark. */
    shotSizes: string[];
  };
};

export const DEFAULTS: Config = {
  tracker: {
    kind: 'jira-acli',
    site: '',
    project: '',
    jql: 'assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC',
    pointsField: null,
    columns: ['To Do', 'In Progress', 'Code Review', 'Done'],
    notStarted: ['To Do', 'Open', 'Backlog'],
    blocked: ['Blocked', 'On Hold'],
    finished: ['Done'],
    afterMerge: 'Done',
    afterMergeRules: []
  },
  repo: {
    path: null,
    remote: null,
    worktreeScript: null,
    branch: '{type}/{key}-{slug}',
    prTitle: null,
    baseBranch: 'main',
    checks: [],
    beforeCommit: [],
    testMock: null,
    commitTypes: []
  },
  app: {
    devCommand: null,
    ownerPort: 3000,
    buildPorts: [3001, 3005],
    loginCheck: null,
    themeKey: null,
    shotSizes: ['1400x900', '3440x1440', '390x844']
  }
};

export const CONFIG: Config = structuredClone(DEFAULTS);

const expand = (p: string | null) => (p?.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

const CONFIG_FILE = () => join(HOME, 'config.json');

type ConfigFile = { [S in keyof Config]?: Partial<Config[S]> };

export async function loadConfig(): Promise<Config> {
  const file = await readJson<ConfigFile>(CONFIG_FILE(), {});
  CONFIG.tracker = { ...DEFAULTS.tracker, ...file.tracker };
  CONFIG.repo = { ...DEFAULTS.repo, ...file.repo, path: expand(file.repo?.path ?? null) };
  CONFIG.app = { ...DEFAULTS.app, ...file.app };
  return CONFIG;
}

export async function setConfigValue(key: string, value: unknown) {
  const field = CONFIG_FIELDS.find((f) => f.key === key);
  if (!field) {
    throw new Error(`Unknown config key: ${key}`);
  }
  const problem = checkValue(field, value);
  if (problem) {
    throw new Error(problem);
  }
  const file = await readJson<ConfigFile>(CONFIG_FILE(), {});
  await writeJson(CONFIG_FILE(), set(file, key, value));
  return loadConfig();
}

export const ticketUrl = (key: string) => {
  const site = CONFIG.tracker.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return site ? `https://${site}/browse/${key}` : null;
};
