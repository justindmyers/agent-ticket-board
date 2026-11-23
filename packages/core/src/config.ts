import { homedir } from 'node:os';
import { join } from 'node:path';
import { HOME } from './paths';
import { readJson } from './files';

// Organization settings live on this machine (~/.agent-ticket-board/config.json), never in the repository.
export type Config = {
  tracker: {
    kind: 'jira-acli';
    site: string;
    project: string;
    jql: string;
    pointsField: string | null;
    columns: string[];
    finished: string[];
    afterMerge: string;
    /** Rules on the pull request branch, for example infra or hotfix work. `to: null` means: ask the developer. */
    afterMergeRules: { branch: string; to: string | null }[];
  };
  repo: { path: string | null };
};

export const DEFAULTS: Config = {
  tracker: {
    kind: 'jira-acli',
    site: '',
    project: '',
    jql: 'assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC',
    pointsField: null,
    columns: ['To Do', 'In Progress', 'Code Review', 'Done'],
    finished: ['Done'],
    afterMerge: 'Done',
    afterMergeRules: []
  },
  repo: { path: null }
};

export const CONFIG: Config = structuredClone(DEFAULTS);

const expand = (p: string | null) => (p?.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

export async function loadConfig(): Promise<Config> {
  const file = await readJson<Partial<Config>>(join(HOME, 'config.json'), {});
  CONFIG.tracker = { ...DEFAULTS.tracker, ...file.tracker };
  CONFIG.repo = { ...DEFAULTS.repo, ...file.repo, path: expand(file.repo?.path ?? null) };
  return CONFIG;
}

export const ticketUrl = (key: string) => {
  const site = CONFIG.tracker.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return site ? `https://${site}/browse/${key}` : null;
};
