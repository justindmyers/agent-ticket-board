import { DESCRIPTION_MAX } from './commits';
import type { Flow, PrPlan, Push } from './types';

// The draft pull request of a ticket. The board makes a draft only, with a title that follows the
// rule of the commits and a body from the repository's own template. The developer sees the title,
// the body and the screenshots first, and approves exactly that.

export const DEFAULT_TEMPLATE =
  '## Description\n\n## What type of change is this?\n\n- [ ] Feature\n- [ ] Bug Fix\n- [ ] Refactor\n\n## Jira Ticket(s)\n\n## Validation Steps\n';

const TITLE = /^([a-z0-9-]+)\(([a-z0-9-]+)\): (.+) \(([A-Z][A-Z0-9]*-\d+)\)$/;

/** The parts of `type(scope): description (KEY)`, or null. */
export function parseTitle(title: string) {
  const m = TITLE.exec(title.trim());
  return m ? { type: m[1]!, scope: m[2]!, description: m[3]!, key: m[4]! } : null;
}

/** What is wrong with the title, or null. The rule is the one of the commits. */
export function prTitleProblem(title: string, key: string): string | null {
  const t = parseTitle(title);
  if (!t) {
    return `The title must be type(scope): description (${key}).`;
  }
  if (t.key !== key) {
    return `The title must end with the key of this ticket: (${key}).`;
  }
  if (!/^[a-z0-9`@(]/.test(t.description)) {
    return `The description must start with a lowercase letter: ${title}`;
  }
  if (t.description.length > DESCRIPTION_MAX) {
    return `The description is ${t.description.length} characters. The limit is ${DESCRIPTION_MAX}, without the type, the scope and the key.`;
  }
  if (t.description.trim().endsWith('.')) {
    return 'The title must not end with a period.';
  }
  return null;
}

/**
 * The title of the pull request, from the commits and never from the ticket summary. It is the first
 * commit of the area with the most commits. When the areas tie, the last area wins: the supporting
 * changes come first and the main change last.
 */
export function prTitle(commits: { title: string }[], key: string): string | null {
  const parsed = commits
    .map((c) => ({ title: c.title, t: parseTitle(c.title) }))
    .filter((c) => c.t && c.t.key === key);
  if (!parsed.length) {
    return null;
  }
  const groups = new Map<string, typeof parsed>();
  for (const c of parsed) {
    const g = groups.get(c.t!.scope) ?? [];
    g.push(c);
    groups.set(c.t!.scope, g);
  }
  let best: typeof parsed = [];
  for (const g of groups.values()) {
    if (g.length >= best.length) {
      best = g;
    }
  }
  return best[0]!.title;
}

/** Which box of the template each commit type ticks. */
const KIND: [RegExp, RegExp][] = [
  [/^feat$/, /feature/i],
  [/^fix$/, /bug/i],
  [/^refactor$/, /refactor/i],
  [/^(ci|build|chore)$/, /ci\/cd|chore|build/i]
];

export type BodyFacts = {
  key: string;
  jiraUrl: string | null;
  commits: { title: string }[];
  summary?: string;
  /** Each requirement with its result. */
  checks: { text: string; ok: boolean; data?: 'real' | 'fake' | 'none' }[];
  /** A few screenshots, one for each view. They go under the list, not under each requirement. */
  shots: { ref: string; alt: string }[];
};

/** The most screenshots on a pull request. A reviewer needs the views, not every size of each. */
export const MAX_SHOTS = 6;

/**
 * The screenshots for the pull request: the first one of each requirement, once. A view that many
 * requirements show has the same files in each, so it counts once. No more than `max`.
 */
export function pickShots(
  sets: { text: string; shots: string[] }[],
  max = MAX_SHOTS
): { path: string; alt: string }[] {
  const out: { path: string; alt: string }[] = [];
  for (const s of sets) {
    const first = s.shots[0];
    if (first && out.length < max && !out.some((o) => o.path === first)) {
      out.push({ path: first, alt: s.text.slice(0, 100) });
    }
  }
  return out;
}

const without = (title: string, key: string) => title.replace(new RegExp(`\\s*\\(${key}\\)$`), '');

function description(x: BodyFacts) {
  const lines = x.commits.map((c) => `- ${without(c.title, x.key)}`);
  return [x.summary?.trim(), lines.length ? lines.join('\n') : ''].filter(Boolean).join('\n\n');
}

function types(x: BodyFacts, body: string) {
  const used = x.commits.map((c) => parseTitle(c.title)?.type).filter((t): t is string => !!t);
  return body
    .split('\n')
    .map((line) => {
      const box = /^- \[[ x]\] (.+)$/.exec(line);
      if (!box) {
        return line;
      }
      const tick = used.some((t) =>
        KIND.some(([type, label]) => type.test(t) && label.test(box[1]!))
      );
      return tick ? `- [x] ${box[1]}` : line;
    })
    .join('\n');
}

function validation(x: BodyFacts) {
  const list = x.checks
    .map(
      (c) =>
        `- [${c.ok ? 'x' : ' '}] ${c.text}${c.data === 'fake' ? ' (tested with mocked data)' : ''}`
    )
    .join('\n');
  const shots = x.shots.map((s) => `![${s.alt}](${s.ref})`).join('\n\n');
  return [list, shots].filter(Boolean).join('\n\n');
}

/** The body: the template of the repository, with each part filled from the record. */
export function prBody(template: string | null, x: BodyFacts): string {
  const parts = (template?.trim() ? template : DEFAULT_TEMPLATE)
    .replace(/\r\n/g, '\n')
    .split(/^(?=## )/m);
  return (
    parts
      .map((part) => {
        const heading = /^## (.*)$/m.exec(part)?.[1] ?? '';
        const rest = part.replace(/^## .*\n?/, '').replace(/^\n+/, '');
        const fill = (text: string) =>
          `## ${heading}\n\n${text.trim() ? text.trim() + '\n' : ''}\n`;
        if (/description/i.test(heading)) {
          return fill(description(x));
        }
        if (/type of change/i.test(heading)) {
          return fill(types(x, rest));
        }
        if (/jira|ticket/i.test(heading)) {
          return fill(x.jiraUrl ? `[${x.key}](${x.jiraUrl})` : x.key);
        }
        if (/validation|test/i.test(heading)) {
          return fill(validation(x) || rest);
        }
        return part;
      })
      .join('')
      .trimEnd() + '\n'
  );
}

/** Why there is no draft pull request now, or null. */
export function prProblem(
  f: Flow,
  now: { branch: string | null; head: string; base: string },
  existing: boolean
): string | null {
  const p: Push | undefined = f.push;
  if (!p?.pushedAt) {
    return 'Push the branch first. A pull request needs the branch on origin.';
  }
  if (!now.branch || now.branch === now.base) {
    return `The worktree is not on the branch of the ticket (${p.branch}).`;
  }
  if (now.branch !== p.branch) {
    return `The worktree is on ${now.branch}, but the push was ${p.branch}.`;
  }
  if (now.head !== p.head) {
    return 'The branch changed after the push. The pull request would not hold the new commits. Push them first.';
  }
  if (existing) {
    return 'This branch has a pull request already.';
  }
  return null;
}

/** The record that shows the pull request, with the buttons to make it or update it, or to show it again. */
/** True when the note is about the pull request: a change of the plan may replace it. */
const aboutPr = (need: Flow['need']) =>
  !need ||
  need.actions.some((a) => a.id === 'createPr' || a.id === 'showPr') ||
  /^The (draft )?pull request is (open|updated)/.test(need.ask);

/**
 * The record with a plan. With `quiet`, the board built the plan by itself: it replaces the note only
 * when the note is empty or about the pull request, so that a problem or a question stays on top.
 */
export function planPrFlow(f: Flow, plan: Omit<PrPlan, 'at'>, at: string, quiet = false): Flow {
  const next = planPrFlowLoud(f, plan, at);
  return quiet && !aboutPr(f.need) ? { ...next, need: f.need! } : next;
}

/** The record when the pending update turns out to match what GitHub has: nothing is left to send. */
export function dropPendingPr(f: Flow): Flow {
  const plan = { ...f.prPlan! };
  delete plan.update;
  const out: Flow = { ...f, prPlan: plan };
  if (f.need?.actions.some((a) => a.id === 'createPr')) {
    delete out.need;
  }
  return out;
}

function planPrFlowLoud(f: Flow, plan: Omit<PrPlan, 'at'>, at: string): Flow {
  const n = plan.attach.length;
  const shots = n ? ` ${n} screenshot${n === 1 ? '' : 's'} go with it.` : '';
  return {
    ...f,
    prPlan: { ...plan, at },
    need: plan.update
      ? {
          kind: 'decision',
          ask: `Ready to update the draft pull request ${plan.url}.`,
          detail: `The title and the body below replace the ones on GitHub. The title is: ${plan.title}${shots}`,
          actions: [
            { id: 'createPr', label: 'Update the pull request' },
            { id: 'showPr', label: 'Build the preview again' },
            { id: 'openWorktree', label: 'Open worktree' }
          ]
        }
      : {
          kind: 'decision',
          ask: `Ready to create a draft pull request from ${plan.head} into ${plan.base}.`,
          detail: `It is a draft. The title is: ${plan.title}${shots}`,
          actions: [
            { id: 'createPr', label: 'Create the draft pull request' },
            { id: 'showPr', label: 'Build the preview again' },
            { id: 'openWorktree', label: 'Open worktree' }
          ]
        }
  };
}

/** The record after GitHub made the draft, or updated it. */
export function madePrFlow(f: Flow, url: string, at: string, warning?: string): Flow {
  const plan = f.prPlan!;
  const updated = !!plan.update;
  const rest: PrPlan = { ...plan };
  delete rest.update;
  return {
    ...f,
    prPlan: {
      ...rest,
      url,
      ...(plan.fingerprint ? { sent: plan.fingerprint } : {}),
      ...(updated ? { updatedAt: at } : { createdAt: at }),
      ...(updated && !plan.createdAt ? { createdAt: at } : {}),
      ...(warning ? { warning } : {})
    },
    need: {
      kind: 'decision',
      ask: updated
        ? `The pull request is updated: ${url}`
        : `The draft pull request is open: ${url}`,
      detail: warning ?? 'It is a draft. Mark it ready for review on GitHub when you are ready.',
      actions: [{ id: 'openWorktree', label: 'Open worktree' }]
    }
  };
}

/** The address in the output of `gh pr create`, or null. */
export const prUrlOf = (out: string) =>
  /https:\/\/github\.com\/[^\s]+\/pull\/\d+/.exec(out)?.[0] ?? null;
