import { countBy, maxBy, sortBy, uniqBy } from 'lodash-es';
import type { Proposal, Run } from './detect';

type Category = 'new' | 'indeterminate' | 'done';
type Item = {
  key: string;
  fields?: { status?: { name?: string; statusCategory?: { key?: Category } } };
};

const AUTH = ['jira', 'auth', 'status'];
const SEARCH = [
  'jira',
  'workitem',
  'search',
  '--jql',
  'assignee = currentUser() AND sprint in openSprints()',
  '--fields',
  'key,status',
  '--json',
  '--paginate'
];
const teamSearch = (project: string) => [
  'jira',
  'workitem',
  'search',
  '--jql',
  `project = ${project} AND updated >= -90d ORDER BY updated DESC`,
  '--fields',
  'key,status',
  '--json',
  '--limit',
  '300'
];
const RECENT = ['jira', 'project', 'list', '--recent', '--json'];
const VIEW = ['jira', 'workitem', 'view'];
const VIEW_ARGS = ['--fields', '*all', '--json'];
const SAMPLE = 3;
const CATEGORY_ORDER: Category[] = ['new', 'indeterminate', 'done'];

const source = (args: string[]) => ['acli', ...args.slice(0, 3)].join(' ');

async function acliJson<T>(run: Run, args: string[]): Promise<T | null> {
  try {
    return JSON.parse(await run('acli', args)) as T;
  } catch {
    return null;
  }
}

const jqlFor = (project: string) =>
  `project = ${project} AND assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC`;

async function fromSprint(run: Run, items: Item[]): Promise<Proposal[]> {
  const src = source(SEARCH);
  const prefixes = countBy(items, (i) => i.key.split('-')[0]);
  const [project, n] = maxBy(Object.entries(prefixes), ([, c]) => c)!;
  const team = (await acliJson<Item[]>(run, teamSearch(project))) ?? [];
  const statuses = uniqBy(
    [...items, ...team].flatMap((i) => (i.fields?.status?.name ? [i.fields.status] : [])),
    (s) => s.name
  );
  const ordered = sortBy(statuses, (s) => CATEGORY_ORDER.indexOf(s.statusCategory?.key ?? 'new'));
  const finished = ordered.filter((s) => s.statusCategory?.key === 'done').map((s) => s.name!);
  const notStarted = ordered.filter((s) => s.statusCategory?.key === 'new').map((s) => s.name!);
  const proposals: Proposal[] = [
    {
      key: 'tracker.project',
      value: project,
      source: src,
      confidence: n === items.length ? 'high' : 'medium'
    },
    { key: 'tracker.jql', value: jqlFor(project), source: src, confidence: 'high' },
    { key: 'tracker.columns', value: ordered.map((s) => s.name), source: src, confidence: 'medium' }
  ];
  if (notStarted.length) {
    proposals.push({
      key: 'tracker.notStarted',
      value: notStarted,
      source: src,
      confidence: 'medium'
    });
  }
  if (finished.length) {
    proposals.push(
      { key: 'tracker.finished', value: finished, source: src, confidence: 'medium' },
      { key: 'tracker.afterMerge', value: finished[0], source: src, confidence: 'low' }
    );
  }
  return proposals;
}

const isPoints = (v: number) => v >= 0 && v <= 100 && Number.isInteger(v * 2);

async function pointsField(run: Run, keys: string[]): Promise<Proposal[]> {
  const views = await Promise.all(
    keys.map((k) => acliJson<{ fields?: Record<string, unknown> }>(run, [...VIEW, k, ...VIEW_ARGS]))
  );
  const numeric = views.flatMap((v) =>
    Object.entries(v?.fields ?? {}).filter(
      (e): e is [string, number] => e[0].startsWith('customfield_') && typeof e[1] === 'number'
    )
  );
  const bad = new Set(numeric.filter(([, n]) => !isPoints(n)).map(([k]) => k));
  const scores = countBy(
    numeric.filter(([k]) => !bad.has(k)),
    ([k]) => k
  );
  const best = maxBy(Object.entries(scores), ([, c]) => c);
  const tied = Object.values(scores).filter((c) => c === best?.[1]).length > 1;
  if (!best || tied) {
    return [];
  }
  return [
    { key: 'tracker.pointsField', value: best[0], source: source(VIEW), confidence: 'medium' }
  ];
}

async function fromRecent(run: Run): Promise<Proposal[]> {
  const recent = await acliJson<{ key: string }[]>(run, RECENT);
  const project = recent?.[0]?.key;
  if (!project) {
    return [];
  }
  return [
    { key: 'tracker.project', value: project, source: source(RECENT), confidence: 'low' },
    { key: 'tracker.jql', value: jqlFor(project), source: source(RECENT), confidence: 'low' }
  ];
}

export async function detectTracker(run: Run): Promise<Proposal[]> {
  const auth = await run('acli', AUTH).catch(() => null);
  const site = auth?.match(/^\s*Site:\s*(\S+)/m)?.[1];
  if (!site) {
    return [];
  }
  const items = (await acliJson<Item[]>(run, SEARCH)) ?? [];
  return [
    { key: 'tracker.site', value: site, source: source(AUTH), confidence: 'high' },
    ...(items.length ? await fromSprint(run, items) : await fromRecent(run)),
    ...(await pointsField(
      run,
      items.slice(0, SAMPLE).map((i) => i.key)
    ))
  ];
}
