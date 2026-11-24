import { describe, expect, it } from 'vitest';
import {
  accentOf,
  activityText,
  planStartable,
  runActive,
  runLine,
  runText,
  shotLabel,
  spentText,
  STAGES,
  STATE_ACCENT
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
      ['code-review', 'green']
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
