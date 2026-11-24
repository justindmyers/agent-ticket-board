import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { trackerInfo, trackerState } from './tracker-state';

beforeAll(() => {
  CONFIG.tracker.columns = ['In Progress', 'To Do', 'Code Review', 'Verifying', 'Done'];
  CONFIG.tracker.notStarted = ['To Do', 'Backlog'];
  CONFIG.tracker.finished = ['Verifying', 'Done'];
  CONFIG.tracker.blocked = ['Blocked', 'On Hold'];
});

describe('trackerState', () => {
  it.each([
    ['To Do', 'todo'],
    ['backlog', 'todo'],
    ['In Progress', 'active'],
    ['Code Review', 'active'],
    ['verifying', 'done'],
    ['Done', 'done'],
    ['Blocked', 'blocked'],
    ['on hold', 'blocked'],
    ['Waiting', 'active']
  ])('reads %s as %s from the config', (status, state) => {
    expect(trackerState(status)).toBe(state);
  });
});

describe('trackerInfo', () => {
  it('says when Jira has finished a ticket that the board has no agent work for', () => {
    expect(trackerInfo('Verifying')).toEqual({
      state: 'done',
      label: 'Finished in Jira',
      notice: 'Jira says Verifying. The board has no agent work for this ticket.'
    });
  });

  it('says when the work started outside the board', () => {
    expect(trackerInfo('In Progress')).toEqual({
      state: 'active',
      label: 'In Progress in Jira',
      notice: 'Jira says In Progress. This work started outside the board.'
    });
  });

  it('says started locally when a not-started ticket has local work', () => {
    const local = { branch: 'feat/PROJ-12-x', worktree: '/wt/proj-12-x', changed: 6 };
    expect(trackerInfo('To Do', local)).toEqual({
      state: 'active',
      label: 'Started locally',
      notice: 'Jira says To Do. Worktree proj-12-x, 6 changed files.'
    });
  });

  it('names the local work next to an active Jira status', () => {
    const local = { branch: 'b', worktree: null, changed: 0 };
    expect(trackerInfo('In Progress', local).notice).toBe(
      'Jira says In Progress. Branch b, no worktree.'
    );
  });

  it('keeps a finished ticket finished, and names the branch that is left', () => {
    const local = { branch: 'b', worktree: '/wt/x', changed: 2 };
    expect(trackerInfo('Done', local)).toEqual({
      state: 'done',
      label: 'Finished in Jira',
      notice: 'Jira says Done. Worktree x, 2 changed files. It is still on this machine.'
    });
  });

  it('keeps a blocked ticket blocked, even with local work', () => {
    const local = { branch: 'b', worktree: null, changed: 0 };
    expect(trackerInfo('Blocked', local)).toMatchObject({
      state: 'blocked',
      label: 'Blocked in Jira'
    });
  });

  it('says not started, with no notice, for a not-started status', () => {
    expect(trackerInfo('To Do')).toEqual({ state: 'todo', label: 'Not started', notice: null });
  });
});
