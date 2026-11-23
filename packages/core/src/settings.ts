import { TICKETS_FILE } from './paths';
import { readJson, writeJson } from './files';

// Settings for each ticket, set by the developer in a client. Kept in memory for fast sync reads.
export type TicketSettings = { agentMayMoveJira?: boolean; afterMerge?: string };

export const SETTINGS: Record<string, TicketSettings> = {};

export async function loadSettings() {
  const all = await readJson<Record<string, TicketSettings>>(TICKETS_FILE, {});
  for (const k of Object.keys(SETTINGS)) {
    delete SETTINGS[k];
  }
  Object.assign(SETTINGS, all);
  return SETTINGS;
}

export async function updateSettings(key: string, change: TicketSettings) {
  await loadSettings();
  const next: TicketSettings = { ...SETTINGS[key], ...change };
  for (const k of Object.keys(next) as (keyof TicketSettings)[]) {
    if (next[k] === undefined) {
      delete next[k];
    }
  }
  SETTINGS[key] = next;
  await writeJson(TICKETS_FILE, SETTINGS);
  return next;
}
