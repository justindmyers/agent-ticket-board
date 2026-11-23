import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENTS_DIR, PR_FILE } from './paths';
import { readJson, writeJson } from './files';
import { reconcile } from './reconcile';
import { afterMergeFor } from './after-merge';
import type { Flow, Pr } from './types';

// Agent records (one JSON file for each ticket in ~/.agent-ticket-board/agents) and the shared
// pull request cache. Until the service exists, the records are sample files.
export const FLOWS: Record<string, Flow> = {};
export const PRS: Record<string, Pr | null> = {};
export const STATUS: Record<string, string> = {};

export async function loadAgents() {
  const files = await readdir(AGENTS_DIR).then(
    (all) => all.filter((f) => f.endsWith('.json')),
    () => [] as string[]
  );
  for (const f of files) {
    const rec = await readJson<Flow | null>(join(AGENTS_DIR, f), null);
    if (rec) {
      FLOWS[f.slice(0, -5)] = rec;
    }
  }
  return FLOWS;
}

export async function loadPrCache() {
  Object.assign(PRS, await readJson<Record<string, Pr | null>>(PR_FILE, {}));
}

export async function refreshPrs(
  find: (key: string) => Promise<Pr | null>,
  keys = Object.keys(FLOWS)
) {
  await Promise.all(
    keys.map(async (k) => {
      try {
        PRS[k] = await find(k);
      } catch {
        // Keep the cached value. The next refresh tries again.
      }
    })
  );
  await writeJson(PR_FILE, PRS);
}

export function flowFor(key: string, status = STATUS[key]): Flow | null {
  return reconcile(FLOWS[key] ?? null, status, PRS[key], afterMergeFor(key, PRS[key]));
}
