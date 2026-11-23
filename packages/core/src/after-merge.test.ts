import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { SETTINGS } from './settings';
import { afterMergeFor, afterMergeOptions } from './after-merge';
import { reconcile } from './reconcile';

const pr = (branch: string) => ({
  number: 9,
  url: 'https://example.com/9',
  branch,
  state: 'Merged',
  draft: false,
  checks: '3 passing',
  failing: 0,
  reviews: 'Merged',
  comments: 0
});

beforeEach(() => {
  CONFIG.tracker.columns = ['To Do', 'In Progress', 'Code Review', 'Verifying', 'Done'];
  CONFIG.tracker.finished = ['Done', 'Verifying'];
  CONFIG.tracker.afterMerge = 'Verifying';
  CONFIG.tracker.afterMergeRules = [{ branch: '^(hotfix|infra)/', to: null }];
  delete SETTINGS['PROJ-1'];
});

describe('afterMergeFor', () => {
  it('uses the default for a feature branch', () => {
    expect(afterMergeFor('PROJ-1', pr('feature/PROJ-1-x'))).toEqual({
      to: 'Verifying',
      source: 'default'
    });
  });

  it('uses the branch rule for a hotfix or infra branch', () => {
    expect(afterMergeFor('PROJ-1', pr('hotfix/PROJ-1-x'))).toMatchObject({
      to: null,
      source: 'rule'
    });
    expect(afterMergeFor('PROJ-1', pr('infra/PROJ-1-x'))).toMatchObject({
      to: null,
      source: 'rule'
    });
  });

  it("uses the developer's choice for the ticket before any rule", () => {
    SETTINGS['PROJ-1'] = { afterMerge: 'Done' };
    expect(afterMergeFor('PROJ-1', pr('hotfix/PROJ-1-x'))).toEqual({
      to: 'Done',
      source: 'ticket'
    });
  });

  it('offers the finished statuses and the rule targets', () => {
    CONFIG.tracker.afterMergeRules.push({ branch: '^release/', to: 'Released' });
    expect(afterMergeOptions()).toEqual(['Done', 'Verifying', 'Released']);
  });
});

describe('reconcile with an after-merge target', () => {
  const flow = { stage: 'code-review' as const };

  it('gives the agent one status to apply when the target is known', () => {
    const f = reconcile(
      flow,
      'Code Review',
      pr('feature/x'),
      afterMergeFor('PROJ-1', pr('feature/x'))
    )!;
    expect(f.need?.to).toBe('Verifying');
    expect(f.need?.actions[0].id).toBe('move:Verifying');
  });

  it('asks the developer to pick when a rule says ask, and gives the agent nothing to apply', () => {
    const f = reconcile(
      flow,
      'Code Review',
      pr('hotfix/x'),
      afterMergeFor('PROJ-1', pr('hotfix/x'))
    )!;
    expect(f.need?.to).toBeUndefined();
    expect(f.need?.ask).toMatch(/Pick the Jira status/);
    expect(f.need?.actions.map((a) => a.id)).toEqual(['move:Done', 'move:Verifying', 'openPr']);
  });
});
