import { describe, expect, it } from 'vitest';
import { accentOf, planStartable, runActive, runLine, STAGES, STATE_ACCENT } from './look';

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
