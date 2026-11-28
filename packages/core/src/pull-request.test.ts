import { describe, expect, it } from 'vitest';
import {
  dropPendingPr,
  madePrFlow,
  MAX_SHOTS,
  pickShots,
  parseTitle,
  planPrFlow,
  prBody,
  prProblem,
  prTitle,
  prTitleProblem,
  prUrlOf,
  type BodyFacts
} from './pull-request';
import type { Flow } from './types';

const KEY = 'PROJ-1234';
// The commits of PROJ-1234, oldest first, and the template of the repository.
const COMMITS = [
  'feat(form): add an error class to the text input (PROJ-1234)',
  'feat(list-api): add list settings and request hooks (PROJ-1234)',
  'feat(list): add sort controls to list management (PROJ-1234)',
  'feat(list): use in-card headers for list sections (PROJ-1234)',
  'feat(list): simplify the list and the card (PROJ-1234)'
].map((title) => ({ title }));
const TEMPLATE =
  '## Description\n\n## What type of change is this?\n\n- [ ] Feature\n- [ ] Bug Fix\n- [ ] Refactor\n- [ ] CI/CD\n\n## Jira Ticket(s)\n\n## Validation Steps';

describe('parseTitle and prTitleProblem', () => {
  it('reads the parts', () => {
    expect(parseTitle(COMMITS[2]!.title)).toEqual({
      type: 'feat',
      scope: 'list',
      description: 'add sort controls to list management',
      key: KEY
    });
    expect(parseTitle('Add sort controls')).toBeNull();
  });
  it('accepts a title of the commit rule, with a long type, scope and key', () => {
    const d = 'a'.repeat(72);
    expect(prTitleProblem(`feat(list-sort-controls): ${d} (${KEY})`, KEY)).toBeNull();
  });
  it.each([
    ['Add sort controls', /must be type\(scope\)/],
    ['feat(list): add a sort (OTHER-1)', /end with the key of this ticket/],
    ['feat(list): Add a sort (PROJ-1234)', /lowercase/],
    [`feat(list): ${'a'.repeat(73)} (PROJ-1234)`, /73 characters/],
    ['feat(list): add a sort. (PROJ-1234)', /period/]
  ])('refuses %s', (title, why) => {
    expect(prTitleProblem(title, KEY)).toMatch(why);
  });
});

describe('prTitle', () => {
  it('is the first commit of the area with most commits, never a summary', () => {
    expect(prTitle(COMMITS, KEY)).toBe(
      'feat(list): add sort controls to list management (PROJ-1234)'
    );
  });
  it('is the only commit when there is one', () => {
    expect(prTitle([COMMITS[0]!], KEY)).toBe(COMMITS[0]!.title);
  });
  it('takes the last area when the areas tie', () => {
    expect(
      prTitle(
        COMMITS.slice(0, 3).filter((_, i) => i !== 2),
        KEY
      )
    ).toBe(COMMITS[1]!.title);
  });
  it('ignores commits of other tickets and returns null when none fit', () => {
    expect(prTitle([{ title: 'feat(a): b (OTHER-1)' }, { title: 'wip' }], KEY)).toBeNull();
  });
});

describe('prBody', () => {
  const facts = (over: Partial<BodyFacts> = {}): BodyFacts => ({
    key: KEY,
    jiraUrl: 'https://example.atlassian.net/browse/PROJ-1234',
    commits: COMMITS,
    summary: 'Sort controls for the list, in two cards.',
    checks: [
      { text: 'The list shows the sort order', ok: true, data: 'real' },
      { text: 'The toggle saves', ok: false, data: 'fake' }
    ],
    shots: [{ ref: './1-card.png', alt: 'The sort order' }],
    ...over
  });
  const body = prBody(TEMPLATE, facts());

  it('keeps the headings of the template, in order', () => {
    expect([...body.matchAll(/^## (.*)$/gm)].map((m) => m[1])).toEqual([
      'Description',
      'What type of change is this?',
      'Jira Ticket(s)',
      'Validation Steps'
    ]);
  });
  it('describes the change from the summary and the commits, without the key on each line', () => {
    expect(body).toContain('Sort controls for the list, in two cards.');
    expect(body).toContain('- feat(list): add sort controls to list management\n');
    expect(body).not.toMatch(/^- feat.*\(PROJ-1234\)$/m);
  });
  it('ticks the type of change that the commits have, and only that', () => {
    expect(body).toContain('- [x] Feature');
    expect(body).toContain('- [ ] Bug Fix');
    expect(body).toContain('- [ ] CI/CD');
  });
  it('links the ticket', () => {
    expect(body).toContain('[PROJ-1234](https://example.atlassian.net/browse/PROJ-1234)');
    expect(prBody(TEMPLATE, facts({ jiraUrl: null }))).toMatch(
      /## Jira Ticket\(s\)\n\nPROJ-1234\n/
    );
  });
  it('lists each requirement with its result and its data, as text only', () => {
    expect(body).toContain(
      '- [x] The list shows the sort order\n- [ ] The toggle saves (tested with mocked data)'
    );
    expect(body.match(/!\[/g)).toHaveLength(1);
  });
  it('puts the screenshots under the list, one after the other', () => {
    const two = prBody(
      TEMPLATE,
      facts({
        shots: [
          { ref: './1-list.png', alt: 'The list' },
          { ref: './2-details.png', alt: 'The details' }
        ]
      })
    );
    expect(two).toContain(
      'mocked data)\n\n![The list](./1-list.png)\n\n![The details](./2-details.png)'
    );
  });
  it('has no image lines when there are no screenshots', () => {
    expect(prBody(TEMPLATE, facts({ shots: [] }))).not.toContain('![');
  });
  it('uses a plain template when the repository has none', () => {
    expect(prBody(null, facts())).toMatch(/^## Description\n\nSort controls for the list/);
    expect(prBody('   ', facts())).toContain('## Validation Steps');
  });
  it('leaves a heading that it does not know as it was', () => {
    const out = prBody('## Description\n\n## Screenshots\n\nPaste here.\n', facts());
    expect(out).toContain('## Screenshots\n\nPaste here.');
  });
  it('leaves the validation heading empty when no requirement ran', () => {
    const out = prBody(TEMPLATE, facts({ checks: [], shots: [] }));
    expect(out).toMatch(/## Validation Steps\n$/);
  });
});

describe('pickShots', () => {
  const six = (set: string) =>
    ['light-1400', 'dark-1400', 'light-3440', 'dark-3440', 'light-390', 'dark-390'].map(
      (v) => `/s/${set}-${v}.png`
    );
  it('takes one screenshot for each view, however many requirements show it', () => {
    const list = six('list');
    const details = six('details');
    const picked = pickShots([
      { text: 'R1 list', shots: list },
      { text: 'R2 list again', shots: list },
      { text: 'R3 nothing', shots: [] },
      { text: 'R4 list again', shots: list },
      { text: 'R5 details', shots: details },
      { text: 'R6 both', shots: [...list, ...details] }
    ]);
    expect(picked).toEqual([
      { path: '/s/list-light-1400.png', alt: 'R1 list' },
      { path: '/s/details-light-1400.png', alt: 'R5 details' }
    ]);
  });
  it('takes no more than the limit', () => {
    const sets = Array.from({ length: 11 }, (_, i) => ({ text: `R${i}`, shots: [`/s/${i}.png`] }));
    expect(pickShots(sets)).toHaveLength(MAX_SHOTS);
    expect(pickShots(sets, 3).map((s) => s.path)).toEqual(['/s/0.png', '/s/1.png', '/s/2.png']);
  });
  it('shortens a long requirement for the alt text', () => {
    expect(pickShots([{ text: 'x'.repeat(300), shots: ['/s/a.png'] }])[0]!.alt).toHaveLength(100);
  });
});

describe('prProblem', () => {
  const pushed = (over: Partial<Flow['push']> = {}): Flow => ({
    stage: 'ship',
    push: {
      branch: 'feature/X',
      head: 'h1',
      commits: [],
      command: 'c',
      dryRun: '',
      at: 'n',
      pushedAt: 'p',
      ...over
    }
  });
  const here = { branch: 'feature/X', head: 'h1', base: 'main' };
  it('is clear when the branch is pushed and unchanged', () => {
    expect(prProblem(pushed(), here, false)).toBeNull();
  });
  it('wants the push first', () => {
    expect(prProblem(pushed({ pushedAt: undefined }), here, false)).toMatch(
      /Push the branch first/
    );
    expect(prProblem({ stage: 'ship' }, here, false)).toMatch(/Push the branch first/);
  });
  it('refuses a branch that moved after the push', () => {
    expect(prProblem(pushed(), { ...here, head: 'h2' }, false)).toMatch(/changed after the push/);
  });
  it('refuses the base branch, another branch and a second pull request', () => {
    expect(prProblem(pushed(), { ...here, branch: 'main' }, false)).toMatch(/not on the branch/);
    expect(prProblem(pushed(), { ...here, branch: 'other' }, false)).toMatch(/but the push was/);
    expect(prProblem(pushed(), here, true)).toMatch(/pull request already/);
  });
});

describe('the record', () => {
  const plan = {
    title: COMMITS[2]!.title,
    body: 'b',
    base: 'main',
    head: 'feature/X',
    attach: [{ path: '/s/1.png', name: '1-card.png', alt: 'one' }],
    commits: 5
  };
  it('offers to create the draft, and to show it again', () => {
    const f = planPrFlow({ stage: 'ship' }, plan, 'n');
    expect(f.prPlan?.at).toBe('n');
    expect(f.need?.ask).toBe('Ready to create a draft pull request from feature/X into main.');
    expect(f.need?.detail).toContain('1 screenshot go with it.');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['createPr', 'showPr', 'openWorktree']);
  });
  it('records the address and a warning after the draft is made', () => {
    const f = madePrFlow(
      planPrFlow({ stage: 'ship' }, plan, 'n'),
      'https://github.com/o/r/pull/7',
      'm',
      'one screenshot did not upload'
    );
    expect(f.prPlan).toMatchObject({ createdAt: 'm', url: 'https://github.com/o/r/pull/7' });
    expect(f.need?.detail).toBe('one screenshot did not upload');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['openWorktree']);
  });
  it('offers to update an open pull request, and records the update', () => {
    const open = madePrFlow(
      planPrFlow({ stage: 'ship' }, plan, 'n'),
      'https://github.com/o/r/pull/7',
      'm'
    );
    const f = planPrFlow(
      open,
      { ...plan, update: true, url: 'https://github.com/o/r/pull/7' },
      'later'
    );
    expect(f.need?.ask).toBe(
      'Ready to update the draft pull request https://github.com/o/r/pull/7.'
    );
    expect(f.need?.actions.map((a) => [a.id, a.label])).toEqual([
      ['createPr', 'Update the pull request'],
      ['showPr', 'Build the preview again'],
      ['openWorktree', 'Open worktree']
    ]);
    const done = madePrFlow(f, 'https://github.com/o/r/pull/7', 'then');
    expect(done.prPlan).toMatchObject({ updatedAt: 'then', url: 'https://github.com/o/r/pull/7' });
    expect(done.prPlan?.update).toBeUndefined();
    expect(done.need?.ask).toBe('The pull request is updated: https://github.com/o/r/pull/7');
  });
  it('reads the address from the output of gh', () => {
    expect(prUrlOf('Creating draft pull request\nhttps://github.com/o/r/pull/12\n')).toBe(
      'https://github.com/o/r/pull/12'
    );
    expect(prUrlOf('nothing')).toBeNull();
  });
});

describe('updates that the board builds by itself', () => {
  const URL = 'https://github.com/o/r/pull/7';
  const plan = {
    title: 'feat(x): add it (PROJ-1)',
    body: 'b',
    base: 'main',
    head: 'feature/X',
    attach: [],
    commits: 1
  };
  const open = () =>
    madePrFlow(planPrFlow({ stage: 'ship' }, { ...plan, fingerprint: 'one' }, 'n'), URL, 'm');
  it('remembers what GitHub got last', () => {
    expect(open().prPlan).toMatchObject({ sent: 'one', createdAt: 'm' });
  });
  it('shows the update when nothing else is on the ticket, and when only a note about the pull request is', () => {
    const upd = { ...plan, update: true, url: URL };
    expect(planPrFlow(open(), upd, 'x', true).need?.actions[0]?.id).toBe('createPr');
    const noted = {
      ...open(),
      need: {
        kind: 'decision' as const,
        ask: 'Pushed.',
        actions: [{ id: 'showPr', label: 'Show' }]
      }
    };
    expect(planPrFlow(noted, upd, 'x', true).need?.actions[0]?.id).toBe('createPr');
  });
  it('keeps a problem or a question on top, and still saves the update', () => {
    const problem = {
      ...open(),
      need: {
        kind: 'problem' as const,
        ask: 'A check fails.',
        actions: [{ id: 'startGate', label: 'Fix' }]
      }
    };
    const f = planPrFlow(problem, { ...plan, update: true, url: URL }, 'x', true);
    expect(f.need?.ask).toBe('A check fails.');
    expect(f.prPlan?.update).toBe(true);
  });
  it('drops an update that matches GitHub now, and its banner, but keeps another note', () => {
    const waiting = planPrFlow(open(), { ...plan, update: true, url: URL }, 'x');
    const f = dropPendingPr(waiting);
    expect(f.prPlan?.update).toBeUndefined();
    expect(f.need).toBeUndefined();
    const other = {
      ...waiting,
      need: {
        kind: 'problem' as const,
        ask: 'A check fails.',
        actions: [{ id: 'startGate', label: 'Fix' }]
      }
    };
    expect(dropPendingPr(other).need?.ask).toBe('A check fails.');
  });
});
