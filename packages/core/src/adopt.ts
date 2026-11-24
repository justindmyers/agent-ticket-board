import { join } from 'node:path';
import { FLOWS, flowFor, PRS, STATUS } from './agents';
import { writeJson } from './files';
import { ignoreWork, LOCAL, localLabel } from './local-work';
import { AGENTS_DIR } from './paths';
import { trackerState } from './tracker-state';
import { STAGES, type Flow, type Stage } from './types';

export type AdoptOffer = { stage: Stage; stageLabel: string; text: string };

/** Local work that the board can take over: no agent record yet, and Jira has not finished the ticket. */
export function adoptOffer(key: string): AdoptOffer | null {
  const w = LOCAL[key];
  const status = STATUS[key];
  if (!w || flowFor(key) || (status && trackerState(status) === 'done')) {
    return null;
  }
  const pr = PRS[key];
  const stage: Stage = pr && pr.state === 'Open' ? 'code-review' : 'development';
  const where = w.worktree ? `${localLabel(w)}, on branch ${w.branch}` : localLabel(w);
  return { stage, stageLabel: STAGES.find((s) => s.id === stage)!.label, text: `${where}.` };
}

/** Writes the agent record only. Nothing runs: the developer starts the agent later. */
export async function adoptWork(key: string, stage: Stage) {
  const w = LOCAL[key];
  if (!w) {
    throw new Error(`${key}: no local work to adopt.`);
  }
  const rec: Flow = {
    stage,
    branch: w.branch,
    ...(w.worktree ? { worktree: w.worktree } : {}),
    adopted: new Date().toISOString()
  };
  await writeJson(join(AGENTS_DIR, `${key}.json`), rec);
  FLOWS[key] = rec;
  return rec;
}

export { ignoreWork };

export const isStage = (s: string): s is Stage => STAGES.some((x) => x.id === s);
