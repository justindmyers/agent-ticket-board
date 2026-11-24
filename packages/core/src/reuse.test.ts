import { describe, expect, it } from 'vitest';
import { buildPrompt } from './development';
import { planPrompt } from './planning';
import { REUSE_RULES } from './reuse';
import { testPrompt } from './testing';

const t = {
  key: 'PROJ-9',
  summary: 'S',
  status: 'To Do',
  type: 'Story',
  priority: 'Low',
  labels: [],
  points: 1,
  updated: null,
  description: ''
};
const f = {
  stage: 'development' as const,
  requirements: [{ id: 'R1', text: 'x', check: 'y' }],
  steps: [{ n: 1, text: 'a', covers: ['R1'] }]
};

describe('REUSE_RULES', () => {
  it('says to look in the shared code and the test setup before making a helper or a mock', () => {
    const text = REUSE_RULES.join(' ');
    expect(text).toMatch(/shared library/);
    expect(text).toMatch(/test setup/);
    expect(text).toMatch(/Do not mock a global that the test setup already provides/);
  });
  it('is in the plan, build and test prompts', () => {
    const line = REUSE_RULES[0]!;
    expect(planPrompt(t as never, [])).toContain(line);
    expect(buildPrompt(t as never, f as never, [])).toContain(line);
    expect(
      testPrompt(t as never, f as never, [], { url: 'u', session: 's', shots: 'x', commands: [] })
    ).toContain(line);
  });
  it('makes the plan name what each step reuses', () => {
    expect(planPrompt(t as never, [])).toMatch(/name the existing code that the step reuses/);
  });
  it('makes the build check its diff for duplicates before the final gate', () => {
    expect(buildPrompt(t as never, f as never, [])).toMatch(
      /Before the final gate, read your diff/
    );
  });
});
