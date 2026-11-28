import { describe, expect, it } from 'vitest';
import { migrateStage, withNextStep } from './next-step';
import type { Flow } from './types';

const open = { id: 'openWorktree', label: 'Open worktree' };
const approved: Flow = {
  stage: 'testing',
  approved: '2026-01-01T00:00:00Z',
  need: { kind: 'decision', ask: 'Approved for code review.', actions: [open] }
};

describe('withNextStep for an approved change', () => {
  it('offers the review when an old approval has only "Open worktree"', () => {
    const f = withNextStep(approved);
    expect(f.need?.actions.map((a) => a.id)).toEqual(['startCodeReview', 'openWorktree']);
    expect(f.need?.ask).toBe('Approved for code review.');
  });

  it('adds nothing twice, and nothing once the review ran or runs', () => {
    const once = withNextStep(approved);
    expect(withNextStep(once)).toEqual(once);
    expect(
      withNextStep({ ...approved, codeReview: { at: 'n', summary: '', findings: [], checks: [] } })
    ).toEqual({
      ...approved,
      codeReview: { at: 'n', summary: '', findings: [], checks: [] }
    });
    const running = {
      ...approved,
      run: { state: 'running' as const, stage: 'code-review' as const, started: 'n', model: 'opus' }
    };
    expect(withNextStep(running)).toEqual(running);
  });
});

describe('migrateStage', () => {
  const at = (over: Partial<Flow>): Flow => ({ stage: 'code-review', ...over });

  it('moves a record from before the Ship stage once it has commits, a push, a gate or a pull request', () => {
    expect(migrateStage(at({ commits: { plan: [], done: [] } })).stage).toBe('ship');
    expect(migrateStage(at({ gate: { at: 'n', ok: true, merged: false, steps: [] } })).stage).toBe(
      'ship'
    );
    expect(migrateStage(at({ push: {} as never })).stage).toBe('ship');
    expect(migrateStage(at({ pr: {} as never })).stage).toBe('ship');
  });

  it('keeps a ticket in Code review while it has a review and board checks only', () => {
    const f = at({
      codeReview: { at: 'n', summary: 's', findings: [], checks: [] },
      gate: { at: 'n', ok: true, merged: false, verify: true, steps: [] }
    });
    expect(migrateStage(f)).toBe(f);
  });

  it('gives the preview button the words that fit: it is a preview until the preview exists', () => {
    const need = (label: string): Flow['need'] => ({
      kind: 'decision',
      ask: 'x',
      actions: [{ id: 'showPush', label }]
    });
    const first = migrateStage(
      at({ gate: { at: 'n', ok: true, merged: false, steps: [] }, need: need('Show the push') })
    );
    expect(first.need?.actions[0]?.label).toBe('Preview the push');
    const again = migrateStage(
      at({
        push: { branch: 'b', head: 'h', commits: [], command: 'c', dryRun: '', at: 'n' },
        need: need('Show the push again')
      })
    );
    expect(again.need?.actions[0]?.label).toBe('Refresh the preview');
  });

  it('reads a preview whose commits were saved as one string each', () => {
    const f = migrateStage(
      at({
        push: {
          branch: 'b',
          head: 'h',
          commits: ['bfe23713e feat(edges): add update controls (K-1)'] as never,
          command: 'c',
          dryRun: '',
          at: 'n'
        }
      })
    );
    expect(f.push?.commits).toEqual([
      { sha: '', short: 'bfe23713e', title: 'feat(edges): add update controls (K-1)' }
    ]);
  });

  it('leaves the other stages alone', () => {
    const f: Flow = { stage: 'testing', gate: { at: 'n', ok: true, merged: false, steps: [] } };
    expect(migrateStage(f)).toBe(f);
  });

  it('is applied by withNextStep, and the pre-push button then belongs to Ship', () => {
    const f = withNextStep({
      stage: 'code-review',
      worktree: '/wt',
      gate: { at: 'n', ok: true, merged: false, steps: [] },
      need: {
        kind: 'decision',
        ask: 'x',
        actions: [{ id: 'openWorktree', label: 'Open worktree' }]
      }
    });
    expect(f.stage).toBe('ship');
    expect(f.need?.actions[0]?.id).toBe('startGate');
  });
});

describe('withNextStep after the pre-push gate passed', () => {
  const passed = (gate: Partial<NonNullable<Flow['gate']>>, over: Partial<Flow> = {}): Flow => ({
    stage: 'ship',
    worktree: '/wt',
    gate: { at: 'n', ok: true, merged: false, steps: [], ...gate },
    need: {
      kind: 'decision',
      ask: 'Every check passes.',
      actions: [{ id: 'openWorktree', label: 'Open worktree' }]
    },
    ...over
  });
  const ids = (f: Flow) => f.need?.actions.map((a) => a.id);

  it('offers the gate again to a gate from before the push step, which has no checked commit', () => {
    const f = withNextStep(passed({}));
    expect(ids(f)).toEqual(['startGate', 'openWorktree']);
    expect(f.need?.actions[0]?.label).toBe('Prepare the push again');
    expect(f.need?.detail).toMatch(/before the push step existed/);
  });

  it('offers the push to a gate that recorded its commit', () => {
    expect(ids(withNextStep(passed({ head: 'abc' })))).toEqual(['showPush', 'openWorktree']);
  });

  it('adds nothing twice, and nothing when the push is shown, the gate failed or it only verified', () => {
    const once = withNextStep(passed({}));
    expect(ids(withNextStep(once))).toEqual(['startGate', 'openWorktree']);
    expect(ids(withNextStep(passed({ head: 'abc' }, { push: {} as never })))).toEqual([
      'openWorktree'
    ]);
    expect(ids(withNextStep(passed({ ok: false })))).toEqual(['openWorktree']);
    expect(ids(withNextStep(passed({ verify: true })))).toEqual(['openWorktree']);
  });
});
