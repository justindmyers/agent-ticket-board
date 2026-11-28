import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accentOf,
  actionHelp,
  activityText,
  checkLabel,
  dryRunText,
  pushLinks,
  planStartable,
  runActive,
  runLine,
  runText,
  shotLabel,
  spentText,
  stepView,
  STAGES,
  STATE_ACCENT,
  writesText
} from './look';

describe('accentOf', () => {
  it.each([
    [{ kind: 'problem', stage: 'development' }, undefined, 'red'],
    [{ kind: 'finished', stage: 'code-review' }, undefined, 'green'],
    [{ kind: 'waiting', stage: 'testing' }, 'done', 'amber'],
    [{ kind: 'running', stage: 'unknown' }, undefined, 'neutral']
  ] as const)('colors an agent %o by its kind, then its stage', (agent, state, accent) => {
    expect(accentOf(agent, state)).toBe(accent);
  });

  it.each([
    ['todo', 'neutral'],
    ['active', 'blue'],
    ['blocked', 'red'],
    ['done', 'green'],
    [undefined, 'neutral']
  ] as const)('colors a ticket with no agent by its state %s', (state, accent) => {
    expect(accentOf(null, state)).toBe(accent);
  });
});

describe('the shared look', () => {
  it('gives each stage an accent, in workflow order', () => {
    expect(STAGES.map((s) => [s.id, s.accent])).toEqual([
      ['planning', 'blue'],
      ['development', 'aqua'],
      ['testing', 'amber'],
      ['code-review', 'green'],
      ['ship', 'rose']
    ]);
    expect(Object.keys(STATE_ACCENT)).toEqual(['todo', 'active', 'blocked', 'done']);
  });
});

describe('planStartable', () => {
  const run = (state: string) => ({ run: { state } });
  it('allows a start with no record, or after a stopped run with no plan', () => {
    expect(planStartable(null)).toBe(true);
    expect(planStartable(run('stopped'))).toBe(true);
  });
  it('refuses while a run is active, or once a plan or a need exists', () => {
    expect(planStartable(run('running'))).toBe(false);
    expect(planStartable(run('queued'))).toBe(false);
    expect(planStartable({ ...run('done'), requirements: [{}] })).toBe(false);
    expect(planStartable({ ...run('failed'), need: {} })).toBe(false);
    expect(planStartable({ stage: 'development' } as never)).toBe(false);
    expect(runActive(run('running'))).toBe(true);
  });
});

describe('runLine', () => {
  it('says how the last run ended, with the model and the cost', () => {
    expect(runLine({ state: 'done', model: 'sonnet', cost: 0.2661 })).toBe(
      'The last agent run finished (sonnet, $0.27).'
    );
    expect(runLine({ state: 'stopped', model: 'sonnet' })).toBe(
      'The last agent run was stopped (sonnet).'
    );
    expect(runLine({ state: 'running', model: 'sonnet' })).toBeNull();
    expect(runLine(undefined)).toBeNull();
  });
});

describe('runText', () => {
  const run = { state: 'running' as const, model: 'sonnet' };
  it('says what each stage does, and when Testing waits for the login', () => {
    expect(runText({ ...run, stage: 'planning' }).title).toBe('Planning now');
    expect(runText({ ...run, stage: 'development' })).toMatchObject({
      title: 'Building now',
      accent: 'aqua'
    });
    expect(runText({ ...run, stage: 'testing', app: 'http://localhost:3002/' })).toEqual({
      title: 'Testing now',
      caption:
        'The agent checks each requirement in the live app at http://localhost:3002/ with sonnet, and fixes what looks wrong.',
      accent: 'amber'
    });
    expect(runText({ ...run, stage: 'testing', waiting: 'login' })).toEqual({
      title: 'Log in to test',
      caption:
        'A browser window opened for this ticket. Log in there. The test continues by itself.',
      accent: 'amber'
    });
    expect(runText({ ...run, state: 'queued', stage: 'testing' }).title).toBe('Queued');
  });
});

describe('shotLabel and spentText', () => {
  it('names a screenshot by its scheme and size', () => {
    expect(shotLabel('/s/PROJ-7/R2-sorted-dark-390x844.png')).toBe('dark 390×844');
    expect(shotLabel('/s/other.png')).toBe('other.png');
  });
  it('shows the cost so far', () => {
    expect(spentText(6.674)).toBe('$6.67 so far');
    expect(spentText(undefined)).toBeNull();
  });
});

describe('activityText', () => {
  it('says in a few words what the agent does now', () => {
    const bash = (command: string) => activityText('Bash', { command });
    expect(
      bash('pnpm exec playwright-cli -s=kb-X goto http://localhost:3002/94/settings/edges')
    ).toBe('Opening /94/settings/edges');
    expect(bash('pnpm exec playwright-cli -s=kb-X snapshot')).toBe('Reading the page');
    expect(bash('pnpm exec playwright-cli -s=kb-X click e12')).toBe('Using the page');
    expect(bash('/x/browser.sh shots PROJ-1 R2-states')).toBe('Taking screenshots: R2-states');
    expect(bash('pnpm --filter nq test:once src/a.test.ts')).toBe(
      'Running pnpm --filter nq test:once src/a.test.ts'
    );
    expect(activityText('Read', { file_path: '/s/R2-dark-390x844.png' })).toBe(
      'Viewing a screenshot: dark 390×844'
    );
    expect(activityText('Read', { file_path: '/w/src/EdgesList.tsx' })).toBe(
      'Reading EdgesList.tsx'
    );
    expect(activityText('Edit', { file_path: '/w/src/EdgesList.tsx' })).toBe(
      'Editing EdgesList.tsx'
    );
    expect(activityText('Grep', { pattern: 'x' })).toBe('Searching the code');
    expect(activityText('mcp__board__step', {})).toBeNull();
  });
});

describe('writesText', () => {
  it('says that moving to Testing approves the list, and what happens to other writes', () => {
    expect(writesText('planning', 2)).toMatch(/Moving the ticket to Testing approves them/);
    expect(writesText('planning', 0)).toMatch(/^None/);
    expect(writesText('testing', 1)).toMatch(/refuses every other write/);
    expect(writesText('testing', 0)).toMatch(/^No writes approved/);
  });
});

describe('dryRunText', () => {
  it('says in plain words what the dry run shows', () => {
    expect(dryRunText('To x.git\n * [new branch]      HEAD -> feature/a', 'feature/a')).toBe(
      'Creates the branch feature/a on origin.'
    );
    expect(dryRunText('To x.git\n   1a2b3c4..5d6e7f8  HEAD -> feature/a', 'feature/a')).toBe(
      'Adds the commits to feature/a on origin.'
    );
    expect(dryRunText('Everything up-to-date', 'feature/a')).toBe(
      'Origin has these commits already.'
    );
    expect(dryRunText('', 'feature/a')).toBe('The dry run reports no problem.');
  });
});

describe('pushLinks', () => {
  const pushed = {
    branch: 'feature/PROJ-1-edge controls',
    url: 'https://github.com/org/repo',
    pushedAt: 'n',
    commits: [{ sha: 'a'.repeat(40) }]
  };

  it('has no links before the push: GitHub has nothing to show', () => {
    expect(pushLinks({ ...pushed, pushedAt: undefined })).toBeNull();
    expect(pushLinks(undefined)).toBeNull();
  });

  it('has no links without the address of the repository', () => {
    expect(pushLinks({ ...pushed, url: undefined })).toBeNull();
  });

  it('links the branch, a new pull request and each commit that the push holds', () => {
    const l = pushLinks(pushed)!;
    expect(l.branch).toBe('https://github.com/org/repo/tree/feature/PROJ-1-edge%20controls');
    expect(l.pullRequest).toBe(
      'https://github.com/org/repo/pull/new/feature/PROJ-1-edge%20controls'
    );
    expect(l.commit('a'.repeat(40))).toBe(`https://github.com/org/repo/commit/${'a'.repeat(40)}`);
  });

  it('refuses a commit that is not in the push, so no other address can be opened', () => {
    expect(pushLinks(pushed)!.commit('b'.repeat(40))).toBeNull();
    expect(pushLinks(pushed)!.commit('../../evil')).toBeNull();
  });
});

describe('checkLabel', () => {
  it.each([
    ['pnpm --filter web check:types', 'Type check of web: the code compiles without type errors'],
    ['pnpm exec tsc --noEmit', 'Type check: the code compiles without type errors'],
    [
      'pnpm exec eslint --quiet {changed}',
      'Lint of the changed files: ESLint rules, formatting included'
    ],
    ['pnpm exec prettier --check {changed}', 'Format check of the changed files'],
    ['pnpm --filter web exec vitest run {tests:apps/web/}', 'Tests of the changed files in web'],
    ['pnpm --filter web check:contracts', 'Generated contract files are up to date'],
    [
      'node hooks/check-comment-bloat.mjs --all {changed}',
      'Comment length check, on the changed lines only'
    ],
    [
      'node hooks/check-legacy-imports.mjs --all {changed}',
      'Legacy import check on the changed files'
    ],
    ['node hooks/lint-docs.mjs --base origin/main', 'Documentation style check']
  ])('describes %s', (cmd, want) => {
    expect(checkLabel(cmd)).toBe(want);
  });

  it('says when a check runs only for some changes', () => {
    expect(
      checkLabel(
        "if git diff --name-only origin/main | grep -q '^libs/ui/'; then pnpm --filter ui check:types; fi"
      )
    ).toBe('Type check of ui: the code compiles without type errors (only if libs/ui/ changed)');
    expect(
      checkLabel("if git diff --name-only | grep -qE '\\.(md|mdx)$'; then node lint-docs.mjs; fi")
    ).toBe('Documentation style check (only if a document changed)');
  });

  it('knows nothing about a command that it does not know: the command stays its own name', () => {
    expect(checkLabel('make verify')).toBeNull();
    expect(checkLabel('echo hello')).toBeNull();
  });
});

describe('stepView', () => {
  it('shows a recorded description with its command', () => {
    expect(
      stepView({ name: 'Format check of the changed files', command: 'prettier --check a' })
    ).toEqual({
      label: 'Format check of the changed files',
      command: 'prettier --check a'
    });
  });

  it('describes a step that was saved with the command as its name, and keeps the merge suffix', () => {
    expect(stepView({ name: 'pnpm exec eslint --quiet {changed}' })).toEqual({
      label: 'Lint of the changed files: ESLint rules, formatting included',
      command: 'pnpm exec eslint --quiet {changed}'
    });
    expect(stepView({ name: 'pnpm --filter web check:types (after the merge)' })).toEqual({
      label: 'Type check of web: the code compiles without type errors (after the merge)',
      command: 'pnpm --filter web check:types'
    });
  });

  it('leaves a step that is not a command as it is', () => {
    expect(stepView({ name: 'Clean worktree' })).toEqual({ label: 'Clean worktree' });
    expect(stepView({ name: 'make verify' })).toEqual({ label: 'make verify' });
  });
});

describe('actionHelp', () => {
  // Every button that the board makes in a banner has an id and a label in the source.
  const ids = (() => {
    const dirs = [join(__dirname), join(__dirname, '../../../apps/service/src')];
    const found = new Set<string>();
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.includes('.test.'))) {
        for (const m of readFileSync(join(dir, f), 'utf8').matchAll(
          /\{ id: '([A-Za-z:]+)',\s*label:/g
        )) {
          found.add(m[1]!);
        }
      }
    }
    // The stage tabs have an id and a label too. They are not buttons that run something.
    for (const s of STAGES) {
      found.delete(s.id);
    }
    // No client handles this id yet: a press does nothing, so there is nothing to describe.
    found.delete('fix');
    return [...found].sort();
  })();

  it('finds the ids of the banner buttons in the source', () => {
    expect(ids).toEqual(expect.arrayContaining(['startGate', 'approvePush', 'createPr', 'showPr']));
  });
  it.each(ids)('describes the button %s', (id) => {
    expect(actionHelp(id)).toBeTruthy();
  });
  it('writes sentences of 25 words at most, and says what runs', () => {
    for (const id of [...ids, 'openJira', 'openChat', 'stopRun', 'choose:fix', 'move:Done']) {
      for (const sentence of actionHelp(id, { prPlan: { update: true } })!.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length, `${id}: ${sentence}`).toBeLessThanOrEqual(25);
      }
    }
  });
  it('names the command that a write runs', () => {
    expect(actionHelp('approvePush', { push: { branch: 'feature/X-1' } })).toContain(
      'git push origin HEAD:feature/X-1'
    );
    expect(actionHelp('showPush')).toContain('git push --dry-run');
    expect(actionHelp('createPr')).toContain('gh pr create --draft');
    expect(actionHelp('createPr', { prPlan: { update: true } })).toContain('gh pr edit');
    expect(actionHelp('startGate')).toContain('never rebases');
  });
  it('tells a new pull request from an update, and a first preview from a rebuild', () => {
    expect(actionHelp('showPr')).toContain('whether it has a pull request');
    expect(actionHelp('showPr', { prPlan: { createdAt: 'x' } })).toContain('again');
  });
  it('says that a Jira move is the only write to Jira, and uses the status', () => {
    const h = actionHelp('move:Verifying')!;
    expect(h).toContain('Verifying');
    expect(h).toContain('only write to Jira');
  });
  it('has nothing for an id that it does not know', () => {
    expect(actionHelp('nope')).toBeUndefined();
  });
});
