import { expect, test } from 'claude-code/testing';

const PANE = {
  plugin: 'agent-ticket-board',
  component: 'Pane',
  requestId: 'board',
  viewport: { columns: 160, rows: 60, isFullscreen: true },
  props: {
    title: 'My sprint',
    isFocused: true,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 50 },
    view: {}
  }
} as const;

const decision = {
  stage: 'testing',
  stageLabel: 'Testing',
  kind: 'decision',
  ask: 'Ready to test. 3 of 3 requirements have evidence.',
  action: { id: 'openApp', label: 'Open app' }
};
const SPRINT = {
  at: '2026-11-23T18:39:01Z',
  groups: [
    {
      group: 'Needs you',
      tickets: [
        {
          key: 'PROJ-102',
          summary: 'Restore the view on Back',
          status: 'To Do',
          type: 'Bug',
          points: 2,
          agent: decision
        }
      ]
    },
    {
      group: 'Verifying',
      tickets: [
        { key: 'PROJ-105', summary: 'Saved filters', status: 'Verifying', points: 2, agent: null }
      ]
    },
    {
      group: 'Done',
      tickets: [
        { key: 'PROJ-106', summary: 'Settings page', status: 'Done', points: 3, agent: null }
      ]
    }
  ]
};
const TICKET = {
  ticket: {
    key: 'PROJ-102',
    summary: 'Restore the view on Back',
    status: 'To Do',
    type: 'Bug',
    points: 2,
    priority: 'Medium'
  },
  group: 'Needs you',
  agent: decision,
  jiraUrl: 'https://example.atlassian.net/browse/PROJ-102',
  flow: {
    stage: 'testing',
    app: 'http://localhost:3001/map',
    need: {
      kind: 'decision',
      ask: 'Ready to test. 3 of 3 requirements have evidence.',
      actions: [
        { id: 'openApp', label: 'Open app' },
        { id: 'approve', label: 'Approve' }
      ]
    },
    requirements: [
      {
        id: 'R1',
        text: 'Back restores view',
        check: 'Test: popstate',
        met: true,
        evidence: { kind: 'test', label: 'test passes' }
      }
    ],
    steps: [{ n: 1, text: 'Hook', covers: ['R1'], state: 'done' }]
  },
  sections: [
    { title: null, kind: 'context', md: 'Back should restore the map.' },
    { title: "Claude's take", kind: 'notes', md: 'Store zoom in the URL.' }
  ],
  comments: []
};

function stubAtb(on, calls: string[][]) {
  on('process.run', ($, e) => {
    const args = e.argv.slice(2);
    calls.push(args);
    const out = args[0] === 'sprint' ? SPRINT : args[0] === 'ticket' ? TICKET : { id: 'x' };
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } };
  });
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('git push is refused and never reaches the tool', async ($, on) => {
  let ran = 0;
  on('tool.call', () => {
    ran += 1;
    return { result: 'ran' };
  });
  for (const command of [
    'git push',
    'git push -u origin HEAD',
    'cd x && git push --force',
    'git -C repo push origin main'
  ]) {
    const r = await $.tool.call({ tool: 'Bash', command });
    expect(r.deny).toMatch(/git push is not allowed/);
  }
  expect(ran).toBe(0);
});

test('Jira writes are refused, Jira reads and atb move pass, self-approval is refused', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }));
  expect(
    (
      await $.tool.call({
        tool: 'Bash',
        command: 'acli jira workitem transition --key PROJ-1 --status Done'
      })
    ).deny
  ).toMatch(/never writes to Jira directly/);
  expect(
    (
      await $.tool.call({
        tool: 'Bash',
        command: 'node ~/.agent-ticket-board/bin/atb.cjs move PROJ-1 Verifying'
      })
    ).deny
  ).toBeUndefined();
  expect(
    (await $.tool.call({ tool: 'Bash', command: 'node atb.cjs move PROJ-1 Done --approved' })).deny
  ).toMatch(/only the developer approves/);
  expect(
    (await $.tool.call({ tool: 'Bash', command: 'acli jira workitem view PROJ-1' })).deny
  ).toBeUndefined();
});

test('the pane never opens in VS Code', async ($, on) => {
  const opened: string[] = [];
  on('session.surfaces', () => ({ value: ['vscode'] }));
  on('ui.open', ($, e) => {
    opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  const r = await $.command.run({ command: 'board', args: '' });
  expect(r.text).toMatch(/activity bar/);
  expect(opened.length).toBe(0);
});

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: queue groups, collapse, ticket stages, comment`, async ($, on) => {
    const calls: string[][] = [];
    stubAtb(on, calls);
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run({ command: 'board', args: '' });
    await tick();
    expect(calls[0]).toEqual(['sprint', '--cached']);
    let ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /2 need you|1 need you/ })).toBeDefined();
    expect(await ui.find({ key: 'grp-Needs you' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /Ready to test/ })).toBeDefined();
    // Done starts collapsed; Verifying collapses on press.
    expect(await ui.find({ key: 'open-PROJ-106' })).toBeUndefined();
    await ui.press({ key: 'grp-Verifying' });
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ key: 'open-PROJ-105' })).toBeUndefined();
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();

    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /Agent needs you/ })).toBeDefined();
    expect(await ui.find({ key: 'act-openApp' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /Test checklist/ })).toBeDefined();
    await ui.press({ key: 'tab-planning' });
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /Claude's take/ })).toBeDefined();
    await ui.input({ key: 'comment', text: 'Forward is wrong on Safari', kind: 'change' });
    await ui.press({ key: 'comment-run' });
    expect(calls.find((c) => c[0] === 'comment')).toEqual([
      'comment',
      'PROJ-102',
      'Forward is wrong on Safari',
      '--run'
    ]);
    await ui.unmount();
  });
}

test('desktop: Jira move needs the confirm press; permission toggle', async ($, on) => {
  const calls: string[][] = [];
  const synced = {
    ...TICKET,
    jira: {
      agentMayMove: false,
      moves: [],
      afterMerge: { to: 'Verifying', source: 'default' },
      defaultAfterMerge: 'Verifying',
      afterMergeOptions: ['Done', 'Verifying']
    },
    flow: {
      stage: 'code-review',
      closed: { reason: 'merged', text: 'Pull request #7 merged on GitHub.' },
      need: {
        kind: 'decision',
        from: 'sync',
        ask: 'Pull request #7 merged, but Jira still says Code Review.',
        actions: [{ id: 'move:Verifying', label: 'Move to Verifying' }]
      }
    }
  };
  on('process.run', ($, e) => {
    const a = e.argv.slice(2);
    calls.push(a);
    const out = a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? synced : {};
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } };
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run({ command: 'board', args: '' });
  await tick();
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'open-PROJ-102' });
  await tick();
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: /Out of sync with Jira/ })).toBeDefined();
  await ui.press({ key: 'act-move:Verifying' });
  await ui.unmount();
  expect(calls.find((c) => c[0] === 'move')).toBeUndefined();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'confirm-move' });
  await tick();
  expect(calls.find((c) => c[0] === 'move')).toEqual([
    'move',
    'PROJ-102',
    'Verifying',
    '--approved'
  ]);
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'agent-move' });
  await tick();
  expect(calls.find((c) => c[0] === 'agent-may-move')).toEqual([
    'agent-may-move',
    'PROJ-102',
    'on'
  ]);
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(await ui.find({ key: 'am-auto' })).toBeDefined();
  await ui.press({ key: 'am-Done' });
  await tick();
  expect(calls.find((c) => c[0] === 'after-merge')).toEqual(['after-merge', 'PROJ-102', 'Done']);
  await ui.unmount();
});
