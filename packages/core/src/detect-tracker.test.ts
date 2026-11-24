import { describe, expect, it } from 'vitest';
import { detectTracker } from './detect-tracker';
import type { Run } from './detect';

const AUTH = `✓ Authenticated
  Site: example.atlassian.net
  Email: dev@example.com
  Authentication Type: oauth
`;

const status = (name: string, category: 'new' | 'indeterminate' | 'done') => ({
  name,
  statusCategory: { key: category }
});

const SPRINT = JSON.stringify([
  { key: 'PROJ-3', fields: { status: status('Code Review', 'indeterminate') } },
  { key: 'PROJ-1', fields: { status: status('Done', 'done') } },
  { key: 'PROJ-7', fields: { status: status('To Do', 'new') } },
  { key: 'PROJ-9', fields: { status: status('In Progress', 'indeterminate') } },
  { key: 'PROJ-4', fields: { status: status('In Progress', 'indeterminate') } }
]);

const fakeRun =
  (out: Record<string, string>): Run =>
  async (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    const hit = Object.keys(out).find((k) => key.startsWith(k));
    if (hit === undefined) {
      throw new Error(`not signed in: ${key}`);
    }
    return out[hit];
  };

const byKey = (ps: Awaited<ReturnType<typeof detectTracker>>) =>
  Object.fromEntries(ps.map((p) => [p.key, p]));

describe('detectTracker', () => {
  it('reads the site from acli auth status', async () => {
    const ps = byKey(await detectTracker(fakeRun({ 'acli jira auth status': AUTH })));
    expect(ps['tracker.site']).toMatchObject({
      value: 'example.atlassian.net',
      source: 'acli jira auth status',
      confidence: 'high'
    });
  });

  it('orders statuses by category, then by first appearance', async () => {
    const ps = byKey(
      await detectTracker(
        fakeRun({ 'acli jira auth status': AUTH, 'acli jira workitem search': SPRINT })
      )
    );
    expect(ps['tracker.project']).toMatchObject({ value: 'PROJ', confidence: 'high' });
    expect(ps['tracker.jql'].value).toBe(
      'project = PROJ AND assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC'
    );
    expect(ps['tracker.columns']).toMatchObject({
      value: ['To Do', 'Code Review', 'In Progress', 'Done'],
      confidence: 'medium'
    });
    expect(ps['tracker.finished'].value).toEqual(['Done']);
    expect(ps['tracker.afterMerge'].value).toBe('Done');
  });

  it('reads the statuses from the whole project, not only from my tickets', async () => {
    const team = JSON.stringify([
      { key: 'PROJ-20', fields: { status: status('Verifying', 'indeterminate') } },
      { key: 'PROJ-21', fields: { status: status('Closed', 'done') } },
      { key: 'PROJ-22', fields: { status: status('To Do', 'new') } }
    ]);
    const ps = byKey(
      await detectTracker(
        fakeRun({
          'acli jira auth status': AUTH,
          'acli jira workitem search --jql project = PROJ AND updated': team,
          'acli jira workitem search': SPRINT
        })
      )
    );
    expect(ps['tracker.columns'].value).toEqual([
      'To Do',
      'Code Review',
      'In Progress',
      'Verifying',
      'Done',
      'Closed'
    ]);
    expect(ps['tracker.finished'].value).toEqual(['Done', 'Closed']);
    expect(ps['tracker.afterMerge']).toMatchObject({ value: 'Done', confidence: 'low' });
  });

  it('falls back to the most recent project when no ticket is in an open sprint', async () => {
    const ps = byKey(
      await detectTracker(
        fakeRun({
          'acli jira auth status': AUTH,
          'acli jira workitem search': '[]',
          'acli jira project list': JSON.stringify([{ key: 'DEMO' }, { key: 'PROJ' }])
        })
      )
    );
    expect(ps['tracker.project']).toMatchObject({ value: 'DEMO', confidence: 'low' });
    expect(ps['tracker.columns']).toBeUndefined();
  });

  it('finds the points field as the one numeric custom field with point-like values', async () => {
    const view = (fields: Record<string, unknown>) => JSON.stringify({ key: 'PROJ-1', fields });
    const ps = byKey(
      await detectTracker(
        fakeRun({
          'acli jira auth status': AUTH,
          'acli jira workitem search': SPRINT,
          'acli jira workitem view PROJ-3': view({
            customfield_10100: 'Team A',
            customfield_10200: 1735689600,
            customfield_10300: 5
          }),
          'acli jira workitem view PROJ-1': view({
            customfield_10200: 1735776000,
            customfield_10300: 2
          }),
          'acli jira workitem view PROJ-7': view({ customfield_10300: null })
        })
      )
    );
    expect(ps['tracker.pointsField']).toMatchObject({
      value: 'customfield_10300',
      source: 'acli jira workitem view',
      confidence: 'medium'
    });
  });

  it('proposes no points field when no custom field holds points', async () => {
    const ps = byKey(
      await detectTracker(
        fakeRun({
          'acli jira auth status': AUTH,
          'acli jira workitem search': SPRINT,
          'acli jira workitem view': JSON.stringify({ fields: { customfield_10100: 'Team A' } })
        })
      )
    );
    expect(ps['tracker.pointsField']).toBeUndefined();
  });

  it('proposes nothing when acli is not signed in', async () => {
    expect(await detectTracker(fakeRun({}))).toEqual([]);
  });
});
