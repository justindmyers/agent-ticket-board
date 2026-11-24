import { describe, expect, it } from 'vitest';
import { STAGE_SPECS } from './stages';

describe('the development stage', () => {
  it('keeps the built steps of a plan revised for a change: the build makes only the new ones', () => {
    const f = STAGE_SPECS.development.begin({
      stage: 'planning',
      changes: [{ text: 'Stricter', at: 'now', planned: true }],
      steps: [
        { n: 1, text: 'Built', covers: ['R1'], state: 'done' },
        { n: 2, text: 'New', covers: ['R1'], state: 'todo' },
        { n: 3, text: 'Was current', covers: ['R1'], state: 'current' }
      ]
    });
    expect(f.steps?.map((s) => s.state)).toEqual(['done', 'todo', 'todo']);
  });
});
