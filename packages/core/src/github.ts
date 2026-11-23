import { execFile } from 'node:child_process';
import { CONFIG } from './config';
import { TOOL_ENV } from './jira';
import type { Pr } from './types';

// Read-only GitHub access through gh. Finds the pull request for a ticket key.
const REVIEW: Record<string, string> = {
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  REVIEW_REQUIRED: 'Waiting for review'
};

type Check = { conclusion?: string; state?: string };
type RawPr = {
  number: number;
  url: string;
  state: string;
  isDraft: boolean;
  title: string;
  headRefName: string;
  reviewDecision: string;
  statusCheckRollup?: Check[];
  comments?: unknown[];
};

const FAILED = ['FAILURE', 'ERROR', 'TIMED_OUT'];
const RUNNING = ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED'];

export function toPr(p: RawPr): Pr {
  const runs = p.statusCheckRollup ?? [];
  const result = (c: Check) => c.conclusion || c.state || '';
  const failing = runs.filter((c) => FAILED.includes(result(c))).length;
  const pending = runs.filter((c) => !result(c) || RUNNING.includes(result(c))).length;
  const checks = !runs.length
    ? 'No checks'
    : failing
      ? `${failing} of ${runs.length} failing`
      : pending
        ? `${pending} of ${runs.length} running`
        : `${runs.length} passing`;
  const state =
    p.state === 'MERGED'
      ? 'Merged'
      : p.state === 'CLOSED'
        ? 'Closed'
        : p.isDraft
          ? 'Draft'
          : 'Open';
  const reviews = p.state === 'MERGED' ? 'Merged' : (REVIEW[p.reviewDecision] ?? 'No reviews yet');
  return {
    number: p.number,
    branch: p.headRefName,
    url: p.url,
    state,
    draft: p.isDraft,
    checks,
    failing,
    reviews,
    comments: (p.comments ?? []).length
  };
}

export async function findPr(key: string): Promise<Pr | null> {
  const cwd = CONFIG.repo.path;
  if (!cwd) {
    return null;
  }
  const fields =
    'number,url,state,isDraft,title,headRefName,reviewDecision,statusCheckRollup,comments';
  const out = await new Promise<string>((resolve, reject) =>
    execFile(
      'gh',
      ['pr', 'list', '--state', 'all', '--search', key, '--limit', '5', '--json', fields],
      { cwd, timeout: 20_000, env: TOOL_ENV },
      (e, so) => (e ? reject(e) : resolve(so))
    )
  );
  const list = JSON.parse(out) as RawPr[];
  const p = list.find((x) =>
    `${x.title} ${x.headRefName}`.toUpperCase().includes(key.toUpperCase())
  );
  return p ? toPr(p) : null;
}
