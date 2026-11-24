import { describe, expect, it } from 'vitest';
import { accentOf, STAGES, STATE_ACCENT } from './look';

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
