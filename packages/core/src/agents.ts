import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENTS_DIR, PR_FILE } from './paths';
import { readJson, writeJson } from './files';
import { reconcile } from './reconcile';
import { afterMergeFor } from './after-merge';
import { audit, recordChanges, type Source } from './audit';
import { runActive } from './look';
import { migrateStage, withNextStep } from './next-step';
import { answerEarlier, answerQuestion } from './planning';
import type { Flow, Pr } from './types';

// Agent records (one JSON file for each ticket in ~/.agent-ticket-board/agents) and the shared
// pull request cache. The service writes the records; every client reads them.
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

// How many times each record was saved in this process. A read of the file that was started before a
// save must not replace the record that the save made.
const saves: Record<string, number> = {};
// How many saves of each record are still being written. While there is one, the file is older.
const writing: Record<string, number> = {};

/** Writes one agent record and logs the fields that changed. The service and explicit actions call this. */
export async function saveFlow(key: string, f: Flow, source: Source = 'board') {
  const before = FLOWS[key] ?? (await readJson<Flow | null>(join(AGENTS_DIR, `${key}.json`), null));
  FLOWS[key] = f;
  saves[key] = (saves[key] ?? 0) + 1;
  writing[key] = (writing[key] ?? 0) + 1;
  try {
    await writeJson(join(AGENTS_DIR, `${key}.json`), f);
  } finally {
    writing[key] = writing[key]! - 1;
  }
  const changes = recordChanges(before, f);
  if (changes.length) {
    await audit(key, source, 'record', { fields: changes.map((c) => c.field), changes });
  }
}

/**
 * Reads one agent record from disk again, because another process may have changed it. When this
 * process has a save of the record that is not on disk yet, or saved it while the file was being read,
 * the file is older than the record in memory: the record in memory stays, and is the answer.
 */
export async function loadFlow(key: string) {
  const seen = saves[key] ?? 0;
  const behind = (writing[key] ?? 0) > 0;
  const f = await readJson<Flow | null>(join(AGENTS_DIR, `${key}.json`), null);
  if (behind || (saves[key] ?? 0) !== seen || (writing[key] ?? 0) > 0) {
    return FLOWS[key] ?? f;
  }
  if (f) {
    FLOWS[key] = f;
  } else {
    delete FLOWS[key];
  }
  return f;
}

/** Saves the developer's answer to plan question `n` (1-based). Refused while an agent run is active. */
export async function saveAnswer(key: string, n: number, text: string) {
  const f = await loadFlow(key);
  if (!f) {
    throw new Error(`${key}: there is no plan to answer.`);
  }
  if (runActive(f)) {
    throw new Error(`${key}: wait until the agent run ends, or stop it.`);
  }
  const out = answerQuestion(f, n - 1, text);
  await audit(key, 'developer', 'answer', { n, text });
  await saveFlow(key, out, 'developer');
  return out;
}

/** Changes earlier answer `n` (1-based). Refused while an agent run is active. */
export async function saveEarlierAnswer(key: string, n: number, text: string) {
  const f = await loadFlow(key);
  if (!f) {
    throw new Error(`${key}: there is no plan.`);
  }
  if (runActive(f)) {
    throw new Error(`${key}: wait until the agent run ends, or stop it.`);
  }
  const out = answerEarlier(f, n - 1, text);
  await audit(key, 'developer', 'answer.changed', { n, text });
  await saveFlow(key, out, 'developer');
  return out;
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
  const f = reconcile(
    FLOWS[key] ? migrateStage(FLOWS[key]!) : null,
    status,
    PRS[key],
    afterMergeFor(key, PRS[key])
  );
  return f && withNextStep(f);
}
