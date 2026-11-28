import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// A temporary home, so the test never touches the developer's agent records.
const home = mkdtempSync(join(tmpdir(), 'atb-'));
process.env.ATB_HOME = home;

let adopt: typeof import('./adopt');
let agents: typeof import('./agents');
let local: typeof import('./local-work');
let config: typeof import('./config');

const WORK = { branch: 'feat/PROJ-12-sort', worktree: '/code/wt/proj-12-sort', changed: 6 };

beforeAll(async () => {
  adopt = await import('./adopt');
  agents = await import('./agents');
  local = await import('./local-work');
  config = await import('./config');
  config.CONFIG.tracker.finished = ['Done'];
  config.CONFIG.tracker.notStarted = ['To Do'];
});

beforeEach(() => {
  for (const k of Object.keys(agents.FLOWS)) {
    delete agents.FLOWS[k];
  }
  for (const k of Object.keys(agents.PRS)) {
    delete agents.PRS[k];
  }
  local.LOCAL['PROJ-12'] = { ...WORK };
  agents.STATUS['PROJ-12'] = 'To Do';
});

describe('adoptOffer', () => {
  it('proposes development for a worktree with no pull request', () => {
    expect(adopt.adoptOffer('PROJ-12')).toEqual({
      stage: 'development',
      stageLabel: 'Development',
      text: 'Worktree proj-12-sort, 6 changed files, on branch feat/PROJ-12-sort.'
    });
  });

  it('proposes the Ship stage when the branch has an open pull request', () => {
    agents.PRS['PROJ-12'] = {
      number: 7,
      url: 'https://example.com/7',
      state: 'Open',
      draft: false,
      checks: '',
      failing: 0,
      reviews: '',
      comments: 0
    };
    expect(adopt.adoptOffer('PROJ-12')?.stage).toBe('ship');
  });

  it('offers nothing for a finished ticket, a ticket with an agent record, or no local work', () => {
    agents.STATUS['PROJ-12'] = 'Done';
    expect(adopt.adoptOffer('PROJ-12')).toBeNull();
    agents.STATUS['PROJ-12'] = 'To Do';
    agents.FLOWS['PROJ-12'] = { stage: 'planning' };
    expect(adopt.adoptOffer('PROJ-12')).toBeNull();
    delete agents.FLOWS['PROJ-12'];
    delete local.LOCAL['PROJ-12'];
    expect(adopt.adoptOffer('PROJ-12')).toBeNull();
  });
});

describe('adoptWork', () => {
  it('writes an agent record that points at the worktree, at the chosen stage', async () => {
    await adopt.adoptWork('PROJ-12', 'development');
    const rec = JSON.parse(readFileSync(join(home, 'agents', 'PROJ-12.json'), 'utf8'));
    expect(rec).toMatchObject({
      stage: 'development',
      branch: WORK.branch,
      worktree: WORK.worktree
    });
    expect(agents.FLOWS['PROJ-12']?.stage).toBe('development');
    expect(adopt.adoptOffer('PROJ-12')).toBeNull();
  });

  it('refuses when there is no local work to adopt', async () => {
    delete local.LOCAL['PROJ-12'];
    await expect(adopt.adoptWork('PROJ-12', 'development')).rejects.toThrow(/no local work/);
  });
});

describe('ignoreWork', () => {
  it('hides that branch for the ticket, but not a new branch', async () => {
    await adopt.ignoreWork('PROJ-12');
    const run = async (_c: string, args: string[]) =>
      args[0] === 'worktree'
        ? `worktree ${WORK.worktree}\nbranch refs/heads/${WORK.branch}\n`
        : args[0] === 'for-each-ref'
          ? `${WORK.branch}\nfix/PROJ-13-other\n`
          : '';
    config.CONFIG.repo.path = '/code/app';
    await local.refreshLocalWork(['PROJ-12', 'PROJ-13'], run);
    expect(local.LOCAL['PROJ-12']).toBeUndefined();
    expect(local.LOCAL['PROJ-13']?.branch).toBe('fix/PROJ-13-other');
  });
});
