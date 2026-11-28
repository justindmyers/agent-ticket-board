import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { outsideMark } from './look';
import { planPushFlow } from './push';
import {
  changesCode,
  findOutside,
  hasOutside,
  outsideCommits,
  outsideFiles,
  snapshotWorktree,
  withOutside,
  type OutsideWork
} from './outside';
import type { Flow, Gate } from './types';

describe('outsideFiles', () => {
  it('says what happened to each file, sorted', () => {
    const z = ' M b.ts\0?? a/new.ts\0 D gone.ts\0A  added.ts\0R  new-name.ts\0old-name.ts\0';
    expect(outsideFiles(z)).toEqual([
      { path: 'a/new.ts', kind: 'new' },
      { path: 'added.ts', kind: 'new' },
      { path: 'b.ts', kind: 'changed' },
      { path: 'gone.ts', kind: 'deleted' },
      { path: 'new-name.ts', kind: 'changed' }
    ]);
  });
  it('is empty for a clean worktree', () => {
    expect(outsideFiles('')).toEqual([]);
  });
});

describe('outsideMark', () => {
  it('marks a file as a diff does', () => {
    const kinds = ['changed', 'new', 'deleted'] as const;
    expect(kinds.map(outsideMark)).toEqual(['M', '+', '−']);
  });
});

describe('outsideCommits', () => {
  const log = `${'a'.repeat(40)}\tfeat(a): one\n${'b'.repeat(40)}\tfix(b): two\twith a tab\n`;
  it('lists the commits that the board did not make', () => {
    expect(outsideCommits(log, [{ sha: 'a'.repeat(9) }])).toEqual([
      { sha: 'b'.repeat(40), short: 'b'.repeat(9), title: 'fix(b): two\twith a tab' }
    ]);
  });
  it('lists all of them when the board made none', () => {
    expect(outsideCommits(log, [])).toHaveLength(2);
  });
});

describe('findOutside in a real repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'atb-outside-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const origin = join(root, 'origin.git');
  const wt = join(root, 'wt');
  const base = CONFIG.repo.baseBranch;
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', base);
  git(root, 'clone', origin, 'wt');
  writeFileSync(join(wt, 'base.txt'), 'base\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-m', 'base');
  git(wt, 'push', 'origin', `HEAD:${base}`);
  git(wt, 'fetch', 'origin');
  git(wt, 'checkout', '-b', 'feature/X-1');

  const flow = (done: { title: string; sha: string }[] = []): Flow => ({
    stage: 'development',
    worktree: wt,
    commits: { plan: [], done }
  });

  it('is null without a worktree', async () => {
    expect(await findOutside({ stage: 'development' })).toBeNull();
    expect(await findOutside(null)).toBeNull();
  });
  it('shows nothing for a clean branch', async () => {
    const o = await findOutside(flow());
    expect(o).toEqual({ files: [], commits: [], head: git(wt, 'rev-parse', 'HEAD'), ahead: 0 });
    expect(hasOutside(o)).toBe(false);
  });
  it('shows uncommitted files, new, changed and deleted', async () => {
    writeFileSync(join(wt, 'base.txt'), 'changed\n');
    mkdirSync(join(wt, 'dir'));
    writeFileSync(join(wt, 'dir', 'new.ts'), 'x\n');
    const o = await findOutside(flow());
    expect(o?.files).toEqual([
      { path: 'base.txt', kind: 'changed' },
      { path: 'dir/new.ts', kind: 'new' }
    ]);
    expect(hasOutside(o)).toBe(true);
  });
  it('shows a commit that the board did not make, and not one that it made', async () => {
    git(wt, 'add', '.');
    git(
      wt,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@e.com',
      'commit',
      '-m',
      'feat(x): by hand (X-1)'
    );
    const byHand = git(wt, 'rev-parse', 'HEAD');
    writeFileSync(join(wt, 'two.ts'), '2\n');
    git(wt, 'add', '.');
    git(
      wt,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@e.com',
      'commit',
      '-m',
      'feat(x): by the board (X-1)'
    );
    const byBoard = git(wt, 'rev-parse', 'HEAD');
    const o = await findOutside(
      flow([{ title: 'feat(x): by the board (X-1)', sha: byBoard.slice(0, 9) }])
    );
    expect(o?.files).toEqual([]);
    expect(o?.commits.map((c) => c.sha)).toEqual([byHand]);
    expect(o?.ahead).toBe(2);
    expect(o?.head).toBe(byBoard);
    expect(o?.commits[0]?.title).toBe('feat(x): by hand (X-1)');
  });
  it('still lists the files when the base branch cannot be read', async () => {
    writeFileSync(join(wt, 'late.ts'), 'late\n');
    git(wt, 'update-ref', '-d', `refs/remotes/origin/${base}`);
    const o = await findOutside(flow());
    expect(o?.files).toEqual([{ path: 'late.ts', kind: 'new' }]);
    expect(o?.commits).toEqual([]);
  });
});

describe('findOutside after the board looked', () => {
  const root = mkdtempSync(join(tmpdir(), 'atb-seen-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const git = (cwd: string, ...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@e.com', ...a], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
  const base = CONFIG.repo.baseBranch;
  const origin = join(root, 'o.git');
  const wt = join(root, 'wt');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', base);
  git(root, 'clone', origin, 'wt');
  writeFileSync(join(wt, 'base.txt'), 'base\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-m', 'base');
  git(wt, 'push', 'origin', `HEAD:${base}`);
  git(wt, 'fetch', 'origin');
  git(wt, 'checkout', '-b', 'feature/X-2');
  const flow = async (done: { title: string; sha: string }[] = []): Promise<Flow> => ({
    stage: 'development',
    worktree: wt,
    commits: { plan: [], done },
    seen: await snapshotWorktree(wt)
  });

  it('does not call the code that a run left outside work', async () => {
    writeFileSync(join(wt, 'agent.ts'), 'by the agent\n');
    writeFileSync(join(wt, 'base.txt'), 'edited by the agent\n');
    const f = await flow();
    expect((await findOutside(f))?.files).toEqual([]);
  });
  it('shows a file that changed after the board looked, and one that is new', async () => {
    const f = await flow();
    writeFileSync(join(wt, 'agent.ts'), 'edited by hand\n');
    writeFileSync(join(wt, 'hand.ts'), 'new by hand\n');
    expect((await findOutside(f))?.files).toEqual([
      { path: 'agent.ts', kind: 'new' },
      { path: 'hand.ts', kind: 'new' }
    ]);
  });
  it('does not show a file that was edited and then put back as the board saw it', async () => {
    const f = await flow();
    const was = readFileSync(join(wt, 'agent.ts'), 'utf8');
    writeFileSync(join(wt, 'agent.ts'), 'something else\n');
    expect((await findOutside(f))?.files.map((x) => x.path)).toContain('agent.ts');
    writeFileSync(join(wt, 'agent.ts'), was);
    expect((await findOutside(f))?.files.map((x) => x.path)).not.toContain('agent.ts');
  });
  it('shows a tracked file that the developer deleted', async () => {
    const f = await flow();
    rmSync(join(wt, 'base.txt'));
    expect((await findOutside(f))?.files).toContainEqual({ path: 'base.txt', kind: 'deleted' });
  });
  it('shows only the commits after the board looked', async () => {
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'feat(x): before the look (X-2)');
    const f = await flow();
    expect((await findOutside(f))?.commits).toEqual([]);
    writeFileSync(join(wt, 'later.ts'), 'later\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-m', 'feat(x): after the look (X-2)');
    const o = await findOutside(f);
    expect(o?.commits.map((c) => c.title)).toEqual(['feat(x): after the look (X-2)']);
    expect(o?.ahead).toBe(2);
  });
});

describe('changesCode', () => {
  it('is true for the runs that write code', () => {
    expect(changesCode({ stage: 'development' })).toBe(true);
    expect(changesCode({ stage: 'code-review', task: 'review-fix' })).toBe(true);
    expect(changesCode({ stage: 'testing' })).toBe(false);
    expect(changesCode({ stage: 'code-review' })).toBe(false);
    expect(changesCode({ stage: 'code-review', task: 'commit-plan' })).toBe(false);
  });
});

describe('withOutside', () => {
  const commit = (n: number) => ({
    sha: `${n}`.repeat(40),
    short: `${n}`.repeat(9),
    title: `c${n}`
  });
  const gate = (head: string): Gate => ({ at: 'n', ok: true, merged: false, head, steps: [] });
  const previewed = (): Flow =>
    planPushFlow(
      {
        stage: 'ship',
        worktree: '/w',
        gate: gate('h3'),
        commits: { plan: [], done: [] }
      },
      {
        branch: 'feature/X-1',
        head: 'h3',
        commits: [commit(1), commit(2), commit(3)],
        dryRun: 'ok'
      },
      'n'
    );
  const now = (o: Partial<OutsideWork>): OutsideWork => ({
    files: [],
    commits: [],
    head: 'h3',
    ahead: 3,
    ...o
  });

  it('leaves the record alone when nothing changed', () => {
    const f = previewed();
    expect(withOutside(f, now({}))).toBe(f);
  });
  it('says that the branch changed after the preview, with the real count, and drops the approval', () => {
    const f = withOutside(
      previewed(),
      now({ head: 'h5', ahead: 5, commits: [commit(4), commit(5)] })
    )!;
    expect(f.need?.ask).toBe(
      'The branch changed after the preview: it has 5 commits beyond origin/main now, and the preview showed 3.'
    );
    expect(f.need?.detail).toBe(
      '2 commits were made outside the board. Prepare the push again so the checks cover the branch as it is now.'
    );
    expect(f.need?.actions.map((a) => a.id)).toEqual(['startGate', 'openWorktree']);
    expect(f.push?.stale).toBe(true);
  });
  it('does not save anything on the record that it was given', () => {
    const f = previewed();
    withOutside(f, now({ head: 'h4', ahead: 4, commits: [commit(4)] }));
    expect(f.push?.stale).toBeUndefined();
    expect(f.need?.actions.map((a) => a.id)).toContain('approvePush');
  });
  it('says one commit, not "1 commits", and adds the uncommitted files', () => {
    const f = withOutside(
      previewed(),
      now({
        head: 'h4',
        ahead: 4,
        commits: [commit(4)],
        files: [{ path: 'a.ts', kind: 'changed' }]
      })
    )!;
    expect(f.need?.detail).toBe(
      '1 commit was made outside the board. 1 file is changed and not committed. Prepare the push again so the checks cover the branch as it is now.'
    );
  });
  it('says only the preview is old when the checks passed on the branch as it is now', () => {
    const f = previewed();
    const out = withOutside(
      { ...f, gate: gate('h5') },
      now({ head: 'h5', ahead: 5, commits: [commit(4), commit(5)] })
    )!;
    expect(out.need?.ask).toBe(
      'The checks passed on the branch as it is now, but the preview is old: it showed 3 commits, and the branch has 5 beyond origin/main.'
    );
    expect(out.need?.actions.map((a) => a.id)).toEqual(['showPush', 'openWorktree']);
    expect(out.push?.stale).toBe(true);
  });
  it('handles a passed gate with no preview yet', () => {
    const f: Flow = {
      stage: 'ship',
      worktree: '/w',
      gate: gate('h3'),
      need: { kind: 'decision', ask: 'x', actions: [] }
    };
    const out = withOutside(f, now({ head: 'h4', ahead: 4, commits: [commit(4)] }))!;
    expect(out.need?.ask).toBe(
      'The branch changed after the checks: it has 4 commits beyond origin/main now.'
    );
    expect(out.push).toBeUndefined();
    expect(out.need?.actions[0]?.id).toBe('startGate');
  });
  it('blocks the push for uncommitted files, with no button that would be refused', () => {
    const f = withOutside(
      previewed(),
      now({
        files: [
          { path: 'a.ts', kind: 'new' },
          { path: 'b.ts', kind: 'changed' }
        ]
      })
    )!;
    expect(f.need?.ask).toBe('2 files changed in the worktree and not committed.');
    expect(f.need?.actions.map((a) => a.id)).toEqual(['openWorktree']);
    expect(f.push?.stale).toBeUndefined();
  });
  it('says so when the branch moved after the push', () => {
    const pushed: Flow = { ...previewed(), push: { ...previewed().push!, pushedAt: 'p' } };
    expect(withOutside(pushed, now({}))).toBe(pushed);
    const moved = withOutside(pushed, now({ head: 'h4' }))!;
    expect(moved.need?.ask).toBe('The branch has changed since it was pushed (h3).');
    expect(moved.need?.actions.map((a) => a.id)).toEqual(['openWorktree']);
  });
  describe('a result that the outside work came after', () => {
    const edited = (n = 2) =>
      now({
        files: Array.from({ length: n }, (_, i) => ({ path: `f${i}.ts`, kind: 'changed' as const }))
      });
    const tested: Flow = {
      stage: 'testing',
      evidence: { R1: { verdict: 'pass', note: 'ok', shots: [] } } as unknown as Flow['evidence'],
      need: {
        kind: 'decision',
        ask: 'Testing is done.',
        actions: [{ id: 'approveTesting', label: 'Approve' }]
      }
    };
    it('offers Test again first, keeps the approval, and says what the result lacks', () => {
      const f = withOutside(tested, edited())!;
      expect(f.stage).toBe('testing');
      expect(f.need?.ask).toBe('Testing is done.');
      expect(f.need?.detail).toBe(
        '2 files changed outside the board after Testing ran. The result does not include them.'
      );
      expect(f.need?.actions.map((a) => a.id)).toEqual(['startTesting', 'approveTesting']);
    });
    it('offers Review again for a review, and counts commits too', () => {
      const f = withOutside(
        { stage: 'code-review', codeReview: { at: 'n', summary: 's', findings: [], checks: [] } },
        now({ files: [{ path: 'a.ts', kind: 'new' }], commits: [commit(1), commit(2)] })
      )!;
      expect(f.need?.ask).toBe(
        '1 file changed and 2 commits made outside the board after the review ran. The result does not include them.'
      );
      expect(f.need?.actions.map((a) => a.id)).toEqual(['startCodeReview', 'openWorktree']);
    });
    it('names Testing as well when the review came after it', () => {
      const f = withOutside(
        {
          stage: 'code-review',
          evidence: tested.evidence,
          codeReview: { at: 'n', summary: 's', findings: [], checks: [] }
        },
        edited(1)
      )!;
      expect(f.need?.ask).toContain('after the review and Testing ran');
    });
    it('says nothing when nothing came from outside, or nothing has run', () => {
      expect(withOutside(tested, now({}))).toBe(tested);
      const fresh: Flow = { stage: 'testing' };
      expect(withOutside(fresh, edited())).toBe(fresh);
    });
    it('does not repeat the button when it is there already', () => {
      const again: Flow = {
        ...tested,
        need: { kind: 'decision', ask: 'x', actions: [{ id: 'startTesting', label: 'Test again' }] }
      };
      expect(
        withOutside(again, edited())!.need?.actions.filter((a) => a.id === 'startTesting')
      ).toHaveLength(1);
    });
  });

  it('leaves other stages, closed tickets and active runs alone', () => {
    const moved = now({ head: 'h9', ahead: 9 });
    const f = previewed();
    expect(withOutside({ ...f, stage: 'code-review' }, moved)).toEqual({
      ...f,
      stage: 'code-review'
    });
    expect(withOutside(f, null)).toBe(f);
    const running = {
      ...f,
      run: { id: 'r', state: 'running', stage: 'ship', task: 'gate', started: 'n', model: 'none' }
    } as Flow;
    expect(withOutside(running, moved)).toBe(running);
  });
});
