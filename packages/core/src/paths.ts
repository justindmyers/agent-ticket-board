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
