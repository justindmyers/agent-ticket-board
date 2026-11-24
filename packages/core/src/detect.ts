import { execFile } from 'node:child_process';
import { CONFIG } from './config';
import { detectRepo, type Gap } from './detect-repo';
import { detectTracker } from './detect-tracker';
import { TOOL_ENV } from './jira';

export type Confidence = 'high' | 'medium' | 'low';

export type Proposal = {
  key: string;
  value: unknown;
  source: string;
  confidence: Confidence;
};

export type Run = (cmd: string, args: string[], cwd?: string) => Promise<string>;

export const run: Run = (cmd, args, cwd) =>
  new Promise((resolve, reject) =>
    execFile(
      cmd,
      args,
      { cwd, env: TOOL_ENV, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) =>
        err ? reject(new Error((stderr || err.message).trim().slice(0, 400))) : resolve(stdout)
    )
  );

export type Check = { name: string; ok: boolean; detail: string };

export const SECTIONS = ['tracker', 'repo'] as const;

export type Section = (typeof SECTIONS)[number];

export const isSection = (s: string): s is Section => (SECTIONS as readonly string[]).includes(s);

export type Detection = { proposals: Proposal[]; gaps: Gap[]; checks: Check[] };

type GhHosts = { hosts?: Record<string, { active?: boolean; login?: string; state?: string }[]> };

async function github(runner: Run): Promise<Check> {
  const out = await runner('gh', ['auth', 'status', '--json', 'hosts']).catch(() => null);
  const accounts = Object.values((out && (JSON.parse(out) as GhHosts).hosts) ?? {}).flat();
  const active = accounts.find((a) => a.active && a.state === 'success');
  return active
    ? { name: 'GitHub (gh)', ok: true, detail: `Signed in to github.com as ${active.login}` }
    : { name: 'GitHub (gh)', ok: false, detail: 'Not signed in. Run: gh auth login' };
}

const jira = (signedIn: boolean): Check =>
  signedIn
    ? { name: 'Jira (acli)', ok: true, detail: 'Signed in' }
    : { name: 'Jira (acli)', ok: false, detail: 'Not signed in. Run: acli jira auth login' };

export async function detect({
  run: runner = run,
  only,
  repoPath = CONFIG.repo.path
}: { run?: Run; only?: Section; repoPath?: string | null } = {}): Promise<Detection> {
  const tracker = only === 'repo' ? [] : await detectTracker(runner);
  const repo =
    only === 'tracker' || !repoPath
      ? { proposals: [], gaps: [] }
      : await detectRepo(runner, repoPath);
  const checks = only ? [] : [jira(tracker.length > 0), await github(runner)];
  return { proposals: [...tracker, ...repo.proposals], gaps: repo.gaps, checks };
}

export function mergeDetection(
  before: Detection | undefined,
  next: Detection,
  only?: Section
): Detection {
  if (!only || !before) {
    return next;
  }
  return {
    proposals: [
      ...before.proposals.filter((p) => !p.key.startsWith(`${only}.`)),
      ...next.proposals
    ],
    gaps: only === 'repo' ? next.gaps : before.gaps,
    checks: before.checks
  };
}
