import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { reconcile } from './reconcile';
import type { Flow } from './types';

CONFIG.tracker.finished = ['Done', 'Verifying'];
CONFIG.tracker.afterMerge = 'Verifying';

const dev: Flow = {
  stage: 'development',
  steps: [{ n: 1, text: 'a', covers: [], state: 'current' }],
  checks: [{ name: 'Lint', ok: null }]
};
const pr = (state: string, failing = 0) => ({
  number: 7,
  url: 'https://example.com/7',
  state,
  draft: false,
  checks: failing ? `${failing} of 3 failing` : '3 passing',
  failing,
  reviews: 'x',
  comments: 0
});

describe('reconcile', () => {
  it('closes local work on a merge and asks for the move when Jira is behind', () => {
    const f = reconcile(dev, 'Code Review', pr('Merged'))!;
    expect(f.closed?.reason).toBe('merged');
    expect(f.steps!.every((s) => s.state === 'done')).toBe(true);
    expect(f.need?.from).toBe('sync');
    expect(f.need?.actions[0].id).toBe('move:Verifying');
  });

  it('closes local work with no ask when the tracker status is finished', () => {
    for (const status of ['Done', 'Verifying']) {
      const f = reconcile(dev, status, pr('Merged'))!;
      expect(f.closed?.reason).toBe('tracker');
      expect(f.need).toBeUndefined();
    }
    expect(reconcile(dev, 'Done', null)!.closed?.reason).toBe('tracker');
  });

  it('shows a pull request that closed without a merge as a problem', () => {
    expect(reconcile({ stage: 'code-review' }, 'Code Review', pr('Closed'))!.need?.kind).toBe(
      'problem'
    );
  });

  it('shows failing checks as a problem and clears it when they pass', () => {
    expect(reconcile({ stage: 'code-review' }, 'Code Review', pr('Open', 2))!.need?.kind).toBe(
      'problem'
    );
    expect(reconcile({ stage: 'code-review' }, 'Code Review', pr('Open'))!.need).toBeUndefined();
  });

  it('does not change open work that has no pull request', () => {
    expect(reconcile(dev, 'In Progress', null)).toEqual(dev);
  });
});
