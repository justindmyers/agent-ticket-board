export * from './types';
export * from './paths';
export * from './files';
export * from './config';
export * from './jira';
export * from './github';
export * from './sprint';
export * from './agents';
export * from './reconcile';
export * from './lanes';
export * from './comments';
export * from './moves';
export * from './settings';
export * from './after-merge';
export * from './adf-md';

import { loadConfig } from './config';
import { loadAgents, loadPrCache } from './agents';
import { loadSettings } from './settings';

/** Loads the config, the agent records and the pull request cache. Call once at start. */
export async function loadState() {
  await loadConfig();
  await Promise.all([loadAgents(), loadPrCache(), loadSettings()]);
}
