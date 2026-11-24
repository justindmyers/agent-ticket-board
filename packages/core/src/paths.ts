import { homedir } from 'node:os';
import { join } from 'node:path';

// Shared home for every client (VS Code extension, Claude Code pane, CLI). Override with ATB_HOME.
export const home = () => process.env.ATB_HOME || join(homedir(), '.agent-ticket-board');
export const HOME = home();
export const CACHE_FILE = join(HOME, 'cache', 'sprint.json');
export const PR_FILE = join(HOME, 'cache', 'prs.json');
export const COMMENTS_FILE = join(HOME, 'comments.json');
export const TICKETS_FILE = join(HOME, 'tickets.json');
export const EVENTS_FILE = join(HOME, 'events.jsonl');
export const AGENTS_DIR = join(HOME, 'agents');
export const IGNORED_FILE = join(HOME, 'ignored-work.json');
/** The running service: its port, its token and its pid. Only the owner can read it. */
export const SERVICE_FILE = join(HOME, 'service.json');
export const PROCESSES_FILE = join(HOME, 'processes.json');
export const SERVICE_LOG = join(HOME, 'service.log');
/** One folder for each ticket: handoff files and run logs. */
export const TICKETS_DIR = join(HOME, 'tickets');
/** The copy of the Claude Code plugin that agent sessions load (the guards). */
export const PLUGIN_DIR = join(HOME, 'plugin');
/** The node and the CLI that `pnpm install-local` installed. */
export const ENV_FILE = join(HOME, 'bin', 'env.json');
