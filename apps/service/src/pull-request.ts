import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  audit,
  CONFIG,
  dropPendingPr,
  loadFlow,
  madePrFlow,
  planPrFlow,
  prBody,
  prProblem,
  prTitle,
  prTitleProblem,
  pickShots,
  prUrlOf,
  saveFlow,
  ticketUrl,
  webUrl,
  type BodyFacts,
  type Flow,
  type PrPlan
} from '@agent-ticket-board/core';
import { gitIn, type Git } from './push';
import { lastChangedFile } from './stages';

// The draft pull request, in two steps like the push. `planPr` builds the title, the body and the
// screenshots and shows them. `doPr` makes exactly that, as a draft, and nothing else.

export type Gh = (args: string[], cwd: string) => Promise<{ code: number; out: string }>;

/** Runs gh. No shell and no prompt: the arguments reach gh as they are. */
export const ghIn: Gh = (args, cwd) =>
  new Promise((resolve) => {
    execFile(
      'gh',
      args,
      {
        cwd,
        timeout: 180_000,
        maxBuffer: 4_000_000,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }
      },
      (e, stdout, stderr) =>
        resolve({
          code: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          out: `${stdout}${stderr}`
        })
    );
  });

const tail = (out: string) => out.trim().split('\n').slice(-8).join('\n');

/** The pull request template of the repository, from the worktree. Null when it has none. */
export function readTemplate(worktree: string): string | null {
  for (const p of [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'docs/pull_request_template.md',
    'pull_request_template.md'
  ]) {
    const file = join(worktree, p);
    if (existsSync(file)) {
      return readFileSync(file, 'utf8');
    }
  }
  return null;
}

/**
 * The screenshots for the pull request. Only current ones: a screenshot that is older than the newest
 * change of the code does not show the interface that the pull request holds. One for each view, and
 * a few at most. The note says what was left out.
 */
function screenshots(f: Flow, worktree: string) {
  const changed = lastChangedFile(worktree);
  const sets: { text: string; shots: string[] }[] = [];
  const checks: BodyFacts['checks'] = [];
  const stale = new Set<string>();
  for (const r of f.requirements ?? []) {
    const e = f.evidence?.[r.id];
    if (!e) {
      continue;
    }
    checks.push({ text: r.text, ok: e.ok, ...(e.data ? { data: e.data } : {}) });
    const fresh = (e.shots ?? []).filter((p) => {
      try {
        const st = statSync(p);
        if (!st.isFile()) {
          return false;
        }
        if (st.mtimeMs < changed.at) {
          stale.add(p);
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });
    sets.push({ text: r.text, shots: fresh });
  }
  const attach: PrPlan['attach'] = pickShots(sets).map((p, i) => ({
    path: p.path,
    name: `${i + 1}-${basename(p.path)}`,
    alt: p.alt
  }));
  const note = !stale.size
    ? undefined
    : attach.length
      ? `${stale.size} older screenshot${stale.size === 1 ? ' is' : 's are'} left out: ${changed.file} changed after ${stale.size === 1 ? 'it' : 'them'}.`
      : `The screenshots are older than the code: ${changed.file} changed after them. None are attached. Run Testing again to take new ones.`;
  return {
    attach,
    checks,
    shots: attach.map((a) => ({ ref: `./${a.name}`, alt: a.alt })),
    note
  };
}

async function live(f: Flow, git: Git, gh: Gh) {
  const base = CONFIG.repo.baseBranch;
  const [branch, head, log] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['rev-parse', 'HEAD']),
    git(['log', '--reverse', '--format=%s', `origin/${base}..HEAD`])
  ]);
  const name = branch.code ? null : branch.out.trim();
  // A pull request for the branch is a reason to stop. If GitHub cannot tell, nothing is made.
  const listed = name
    ? await gh(
        [
          'pr',
          'list',
          '--head',
          name,
          '--state',
          'open',
          '--json',
          'url',
          '-R',
          await slug(git, f)
        ],
        f.worktree!
      )
    : { code: 0, out: '[]' };
  if (listed.code) {
    throw new Error(
      `GitHub did not say whether the branch has a pull request. Nothing was made.\n${tail(listed.out)}`
    );
  }
  return {
    base,
    branch: name,
    head: head.out.trim(),
    commits: log.code
      ? []
      : log.out
          .split('\n')
          .filter(Boolean)
          .map((title) => ({ title })),
    existing: (JSON.parse(listed.out || '[]') as { url: string }[])[0]?.url ?? null
  };
}

/** `owner/repo` of origin. The pull request is made with it, so no folder has to be a repository. */
async function slug(git: Git, f: Flow) {
  const url =
    f.push?.url ??
    (await git(['remote', 'get-url', 'origin']).then((r) => (r.code ? null : webUrl(r.out))));
  const m = url && /github\.com\/([\w.-]+\/[\w.-]+)$/.exec(url);
  if (!m) {
    throw new Error('The remote is not on GitHub. The board makes pull requests on GitHub only.');
  }
  return m[1]!;
}

/** Builds what the board would send now. Nothing is saved and nothing changes on GitHub. */
async function buildPlan(
  key: string,
  f: Flow,
  git: Git,
  gh: Gh
): Promise<{ plan: Omit<PrPlan, 'at'>; own: boolean }> {
  const x = await live(f, git, gh);
  // A pull request that the board opened can be updated. Any other is not the board's to change.
  const own = !!x.existing && x.existing === f.prPlan?.url;
  const problem = prProblem(f, x, !!x.existing && !own);
  if (problem) {
    throw new Error(problem);
  }
  const title = prTitle(x.commits, key);
  if (!title) {
    throw new Error(`No commit has a title of the form type(scope): description (${key}).`);
  }
  const bad = prTitleProblem(title, key);
  if (bad) {
    throw new Error(bad);
  }
  const { attach, checks, shots, note } = screenshots(f, f.worktree!);
  const body = prBody(readTemplate(f.worktree!), {
    key,
    jiraUrl: ticketUrl(key),
    commits: x.commits,
    ...(f.commits?.summary ? { summary: f.commits.summary } : {}),
    checks,
    shots
  });
  return {
    own,
    plan: {
      title,
      body,
      base: x.base,
      head: x.branch!,
      attach,
      commits: x.commits.length,
      fingerprint: fingerprint(title, body, attach),
      ...(note ? { warning: note } : {}),
      ...(own
        ? {
            update: true,
            url: x.existing!,
            createdAt: f.prPlan!.createdAt,
            ...(f.prPlan!.sent ? { sent: f.prPlan!.sent } : {})
          }
        : {})
    }
  };
}

/** A hash of what GitHub would get: the title, the body and each screenshot file as it is now. */
function fingerprint(title: string, body: string, attach: PrPlan['attach']) {
  const h = createHash('sha1').update(title).update('\0').update(body);
  for (const a of attach) {
    const st = statSync(a.path);
    h.update(`\0${a.name}:${st.size}:${Math.round(st.mtimeMs)}`);
  }
  return h.digest('hex');
}

export async function planPr(
  key: string,
  gitFor: (cwd: string) => Git = gitIn,
  gh: Gh = ghIn,
  now = () => new Date().toISOString()
) {
  const f = await loadFlow(key);
  if (!f?.worktree) {
    throw new Error(`${key}: the ticket has no worktree.`);
  }
  const { plan, own } = await buildPlan(key, f, gitFor(f.worktree), gh);
  const next = planPrFlow(f, plan, now());
  await saveFlow(key, next, 'service');
  await audit(key, 'service', 'pr.planned', {
    title: plan.title,
    attach: plan.attach.length,
    commits: plan.commits,
    update: own,
    ...(plan.warning ? { note: plan.warning } : {})
  });
  return next;
}

/**
 * After work that could change the pull request, builds the update by itself. It changes nothing on
 * GitHub. It shows the update only when the title, the body or a screenshot differs from what GitHub
 * got last. Returns the new record, or null when nothing differs or the board cannot tell.
 */
export async function refreshPr(
  key: string,
  gitFor: (cwd: string) => Git = gitIn,
  gh: Gh = ghIn,
  now = () => new Date().toISOString()
) {
  const f = await loadFlow(key);
  const cur = f?.prPlan;
  if (!f?.worktree || f.stage !== 'ship' || !cur?.createdAt || !cur.url) {
    return null;
  }
  let built;
  try {
    built = await buildPlan(key, f, gitFor(f.worktree), gh);
  } catch {
    // The branch is not ready, or GitHub does not answer. The next job looks again.
    return null;
  }
  if (!built.own) {
    return null;
  }
  const same = built.plan.fingerprint === cur.sent;
  if (same) {
    if (!cur.update) {
      return null;
    }
    // An update was waiting, and the work since then made it the same as GitHub: nothing is left to send.
    const next = dropPendingPr(f);
    await saveFlow(key, next, 'service');
    await audit(key, 'service', 'pr.planned', { auto: true, update: false, same: true });
    return next;
  }
  const next = planPrFlow(f, built.plan, now(), true);
  await saveFlow(key, next, 'service');
  await audit(key, 'service', 'pr.planned', {
    auto: true,
    title: built.plan.title,
    attach: built.plan.attach.length,
    commits: built.plan.commits,
    update: true
  });
  return next;
}

export async function doPr(
  key: string,
  gitFor: (cwd: string) => Git = gitIn,
  gh: Gh = ghIn,
  now = () => new Date().toISOString()
) {
  const f = await loadFlow(key);
  if (!f?.worktree) {
    throw new Error(`${key}: the ticket has no worktree.`);
  }
  const plan = f.prPlan;
  if (!plan) {
    throw new Error('Show the pull request first.');
  }
  if (plan.createdAt && !plan.update) {
    throw new Error(`The draft pull request is open already: ${plan.url}`);
  }
  const git = gitFor(f.worktree);
  const x = await live(f, git, gh);
  // An update needs the pull request that the plan names. A draft needs that there is none.
  const own = !!plan.update && x.existing === plan.url;
  const gone =
    plan.update && !own
      ? 'The pull request is no longer open on GitHub. Build the preview again.'
      : null;
  const problem =
    gone ??
    prProblem(f, x, !!x.existing && !own) ??
    (plan.head !== x.branch || plan.base !== x.base
      ? 'The branch changed after you looked at the pull request. Show it again.'
      : prTitleProblem(plan.title, key));
  if (problem) {
    throw new Error(problem);
  }
  // gh gets copies of the screenshots under the names of the body, so that the references match.
  const dir = mkdtempSync(join(tmpdir(), 'atb-pr-'));
  try {
    for (const a of plan.attach) {
      copyFileSync(a.path, join(dir, a.name));
    }
    writeFileSync(join(dir, 'body.md'), plan.body);
    const args = plan.update
      ? [
          'pr',
          'edit',
          plan.url!,
          '-R',
          await slug(git, f),
          '--title',
          plan.title,
          '--body-file',
          'body.md',
          ...plan.attach.flatMap((a) => ['--attach', `./${a.name}#${a.alt.replace(/#/g, '')}`])
        ]
      : [
          'pr',
          'create',
          '--draft',
          '-R',
          await slug(git, f),
          '--base',
          plan.base,
          '--head',
          plan.head,
          '--title',
          plan.title,
          '--body-file',
          'body.md',
          ...plan.attach.flatMap((a) => ['--attach', `./${a.name}#${a.alt.replace(/#/g, '')}`])
        ];
    const r = await gh(args, dir);
    // gh edit may print nothing: a clean exit on an update still means that the pull request is updated.
    const url = prUrlOf(r.out) ?? (plan.update && !r.code ? plan.url! : null);
    if (!url) {
      await audit(key, 'service', 'pr.failed', { output: tail(r.out) });
      throw new Error(
        `GitHub did not ${plan.update ? 'update' : 'make'} the pull request.\n${tail(r.out)}`
      );
    }
    // gh makes the pull request even when a screenshot fails to upload, and then exits with an error.
    const warning = r.code
      ? `The pull request is ${plan.update ? 'updated' : 'open'}, but a screenshot did not upload. Add it on GitHub.\n${tail(r.out)}`
      : undefined;
    const next = madePrFlow(f, url, now(), warning);
    await saveFlow(key, next, 'service');
    await audit(key, 'service', plan.update ? 'pr.updated' : 'pr.created', {
      url,
      attached: plan.attach.length,
      warning: !!warning
    });
    return next;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
