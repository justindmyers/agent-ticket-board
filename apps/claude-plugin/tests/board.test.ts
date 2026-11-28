import type { On } from 'claude-code';
import { expect, test, type Engine } from 'claude-code/testing';

const BOARD = {
  command: 'board',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 }
} as const;

/** What the stubbed `atb` prints: one JSON value, exit code 0. */
const printed = (value: unknown) => ({
  value: {
    exitCode: 0,
    stdout: JSON.stringify(value),
    stderr: '',
    isStdoutTruncated: false,
    isStderrTruncated: false
  }
});

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
  ask: 'Tested: 1 of 1 requirements pass, with evidence.',
  action: { id: 'approveTesting', label: 'Approve for code review' }
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
    spent: 6.67,
    need: {
      kind: 'decision',
      ask: 'Tested: 1 of 1 requirements pass, with evidence.',
      actions: [
        { id: 'approveTesting', label: 'Approve for code review' },
        { id: 'openWorktree', label: 'Open worktree' }
      ]
    },
    requirements: [{ id: 'R1', text: 'Back restores view', check: 'Click path: zoom, go back' }],
    evidence: {
      R1: {
        ok: true,
        shots: ['/shots/PROJ-102/R1-back-light-1400x900.png'],
        seen: 'The map is back at the zoom it had.'
      }
    },
    steps: [{ n: 1, text: 'Hook', covers: ['R1'], state: 'done' }]
  },
  sections: [
    { title: null, kind: 'context', md: 'Back should restore the map.' },
    { title: "Claude's take", kind: 'notes', md: 'Store zoom in the URL.' }
  ],
  comments: []
};

function stubAtb(on: On, calls: string[][]) {
  on('process.run', ($, e) => {
    const args = e.argv.slice(2);
    calls.push(args);
    const out =
      args[0] === 'sprint'
        ? SPRINT
        : args[0] === 'ticket'
          ? TICKET
          : args[0] === 'handoff'
            ? { prompt: 'Read /h/PROJ-102/handoff.md and continue.', folder: null }
            : { id: 'x' };
    return printed(out);
  });
}
// The test environment has timers, but its types do not declare them.
declare const setTimeout: (fn: () => void, ms: number) => unknown;
const tick = () => new Promise<void>((r) => setTimeout(r, 20));

test('a heavy command waits for the lock within the engine limit of ten minutes, then runs and releases', async ($, on) => {
  const calls: { args: string[]; timeoutMs?: number }[] = [];
  on('process.run', ($$, e) => {
    calls.push({ args: e.argv.slice(2), timeoutMs: e.init?.timeoutMs });
    return printed({ ok: true });
  });
  on('tool.call', () => ({ result: 'ran' }));
  const r = await $.tool.call({ tool: 'Bash', command: 'pnpm --filter nq check:types' });
  expect(r.result).toBe('ran');
  expect(r.deny).toBeUndefined();
  expect(calls.map((c) => c.args.slice(0, 2).join(' '))).toEqual([
    'heavy acquire',
    'heavy release'
  ]);
  const wait = calls[0]!.timeoutMs;
  expect(wait).toBeLessThanOrEqual(10 * 60_000);
  expect(wait).toBeGreaterThan(0);
});

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
  const r = await $.command.run(BOARD);
  expect(r.text).toMatch(/activity bar/);
  expect(opened.length).toBe(0);
});

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: queue groups, collapse, ticket stages, comment`, async ($, on) => {
    const calls: string[][] = [];
    stubAtb(on, calls);
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    expect(calls[0]).toEqual(['sprint', '--cached']);
    let ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /2 need you|1 need you/ })).toBeDefined();
    expect(await ui.find({ key: 'grp-Needs you' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /Tested: 1 of 1 requirements pass/ })).toBeDefined();
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
    expect({
      approve: !!(await ui.find({ key: 'act-approveTesting' })),
      evidence: !!(await ui.find({ type: 'Button', text: /Evidence/ })),
      seen: !!(await ui.find({ type: 'Text', text: /The map is back at the zoom it had\./ })),
      shot: !!(await ui.find({ key: 'shot-R1-0-0' })),
      spent: !!(await ui.find({ type: 'Text', text: /\$6\.67 so far/ }))
    }).toEqual({ approve: true, evidence: true, seen: true, shot: true, spent: true });
    await ui.press({ key: 'shot-R1-0-0' });
    await tick();
    expect(calls).toContainEqual([
      'open-shot',
      'PROJ-102',
      '/shots/PROJ-102/R1-back-light-1400x900.png'
    ]);
    await ui.press({ key: 'act-approveTesting' });
    await tick();
    expect(calls).toContainEqual(['approve-testing', 'PROJ-102']);
    await ui.press({ key: 'tab-planning' });
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Button', text: /Claude's take/ })).toBeDefined();
    await ui.input({ key: 'comment', text: 'Forward is wrong on Safari', kind: 'change' });
    await ui.press({ key: 'comment-run' });
    expect(calls.find((c) => c[0] === 'change')).toEqual([
      'change',
      'PROJ-102',
      'Forward is wrong on Safari'
    ]);
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: continue in chat puts the handoff prompt in the prompt box`, async ($, on) => {
    const calls: string[][] = [];
    const filled: string[] = [];
    stubAtb(on, calls);
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    on('prompt.fill', ($, e) => {
      filled.push(e.text);
      return { isFilled: true };
    });
    on('ui.toast', () => ({ value: undefined }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'chat' });
    await tick();
    expect(calls).toContainEqual(['handoff', 'PROJ-102']);
    expect(filled).toEqual(['Read /h/PROJ-102/handoff.md and continue.']);
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
    return printed(out);
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run(BOARD);
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

const field = (key: string, label: string, text: string, extra = {}) => ({
  key,
  label,
  help: 'Help text.',
  kind: 'text',
  value: text,
  text,
  source: 'default',
  ...extra
});
const SETTINGS = {
  file: '/tmp/atb/config.json',
  sections: [
    {
      id: 'tracker',
      title: 'Tracker',
      fields: [
        field('tracker.project', 'Project key', 'PROJ', { source: 'config' }),
        field('tracker.columns', 'Board columns', 'To Do, Done', { kind: 'list' }),
        field('tracker.afterMergeRules', 'Branch rules after the merge', '^hotfix/ => ask me', {
          kind: 'rules'
        })
      ]
    },
    { id: 'repo', title: 'Repository', fields: [field('repo.branch', 'Branch name', '{key}')] }
  ],
  gaps: [],
  checks: []
};
const DETECTED = {
  ...SETTINGS,
  sections: SETTINGS.sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) =>
      f.key === 'tracker.columns'
        ? {
            ...f,
            proposal: {
              text: 'To Do, In Progress, Done',
              confidence: 'medium',
              source: 'acli jira workitem search',
              same: false
            }
          }
        : f
    )
  })),
  checks: [{ name: 'Jira (acli)', ok: true, detail: 'Signed in' }]
};

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: settings: detect, use a detected value, save`, async ($, on) => {
    const calls: string[][] = [];
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      const out =
        a[0] === 'sprint'
          ? SPRINT
          : a[0] === 'settings' && a[1] === 'save'
            ? { saved: Object.keys(JSON.parse(a[2] ?? '{}')), errors: {} }
            : a[0] === 'settings' && a.includes('--detect')
              ? DETECTED
              : a[0] === 'settings'
                ? SETTINGS
                : {};
      return printed(out);
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    const remount = async (ui?: { unmount: () => Promise<void> }) => {
      await tick();
      await ui?.unmount();
      return $.ui.mount({ ...PANE, surface });
    };
    let ui = await remount();
    await ui.press({ key: 'settings' });
    ui = await remount(ui);
    expect(calls.find((c) => c[0] === 'settings')).toEqual(['settings']);
    expect(await ui.find({ key: 'field-tracker.project' })).toBeDefined();
    await ui.press({ key: 'detect-all' });
    ui = await remount(ui);
    expect(calls.find((c) => c.includes('--detect'))).toEqual(['settings', '--detect']);
    expect(await ui.find({ type: 'Text', text: /Jira \(acli\)/ })).toBeDefined();
    await ui.press({ key: 'use-tracker.columns' });
    ui = await remount(ui);
    expect(await ui.find({ type: 'Text', text: /1 unsaved change/ })).toBeDefined();
    await ui.input({ key: 'field-tracker.project', text: 'DEMO', kind: 'change' });
    ui = await remount(ui);
    expect(await ui.find({ type: 'Text', text: /2 unsaved changes/ })).toBeDefined();
    await ui.press({ key: 'settings-save' });
    ui = await remount(ui);
    const save = calls.find((c) => c[1] === 'save');
    expect(JSON.parse(save?.[2] ?? '{}')).toEqual({
      'tracker.columns': 'To Do, In Progress, Done',
      'tracker.project': 'DEMO'
    });
    await ui.press({ key: 'detect-repo' });
    ui = await remount(ui);
    expect(calls.at(-1)).toEqual(['settings', '--detect', '--only=repo']);
    await ui.press({ key: 'settings-back' });
    ui = await remount(ui);
    expect(await ui.find({ key: 'grp-Needs you' })).toBeDefined();
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: settings: edit a list and the branch rules`, async ($, on) => {
    const calls: string[][] = [];
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      const out =
        a[0] === 'sprint'
          ? SPRINT
          : a[0] === 'settings' && a[1] === 'save'
            ? { saved: [], errors: {} }
            : a[0] === 'settings'
              ? SETTINGS
              : {};
      return printed(out);
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    const remount = async (ui?: { unmount: () => Promise<void> }) => {
      await tick();
      await ui?.unmount();
      return $.ui.mount({ ...PANE, surface });
    };
    let ui = await remount();
    await ui.press({ key: 'settings' });
    ui = await remount(ui);
    await ui.press({ key: 'down-tracker.columns-0' });
    ui = await remount(ui);
    await ui.input({ key: 'add-tracker.columns', text: 'Done' });
    ui = await remount(ui);
    expect(await ui.find({ type: 'Text', text: /in the list already/ })).toBeDefined();
    await ui.input({ key: 'add-tracker.columns', text: 'Verifying' });
    await ui.input({ key: 'add-tracker.afterMergeRules', text: '^(x' });
    ui = await remount(ui);
    expect(await ui.find({ type: 'Text', text: /not a valid regular expression/ })).toBeDefined();
    await ui.input({ key: 'add-tracker.afterMergeRules', text: '^release/' });
    ui = await remount(ui);
    await ui.select({ key: 'to-tracker.afterMergeRules-1', value: 'Done' });
    await ui.press({ key: 'remove-tracker.afterMergeRules-0' });
    ui = await remount(ui);
    await ui.press({ key: 'settings-save' });
    await tick();
    const save = calls.find((c) => c[1] === 'save');
    expect(JSON.parse(save?.[2] ?? '{}')).toEqual({
      'tracker.columns': 'Done, To Do, Verifying',
      'tracker.afterMergeRules': '^release/ => Done'
    });
    await ui.unmount();
  });
}

test('desktop: opening a ticket reads the sprint list again, so a new status shows there', async ($, on) => {
  const calls: string[][] = [];
  const moved = {
    ...SPRINT,
    groups: [
      {
        group: 'In Progress',
        tickets: [{ ...SPRINT.groups[0]!.tickets[0]!, status: 'In Progress' }]
      }
    ]
  };
  let opened = false;
  on('process.run', ($, e) => {
    const a = e.argv.slice(2);
    calls.push(a);
    if (a[0] === 'ticket' && !a.includes('--cached')) {
      opened = true;
    }
    return printed(a[0] === 'sprint' ? (opened ? moved : SPRINT) : a[0] === 'ticket' ? TICKET : {});
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run(BOARD);
  await tick();
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'open-PROJ-102' });
  await tick();
  const fresh = calls.findIndex((c) => c[0] === 'ticket' && !c.includes('--cached'));
  expect(calls.slice(fresh + 1)).toContainEqual(['sprint', '--cached']);
  await ui.press({ key: 'back' });
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(await ui.find({ key: 'grp-In Progress' })).toBeDefined();
  await ui.unmount();
});

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: Start planning asks the service, and Stop stops the run`, async ($, on) => {
    const calls: string[][] = [];
    let flow: unknown = null;
    const todo = () => ({
      ...TICKET,
      agent: null,
      flow,
      tracker: { state: 'todo', label: 'To Do in Jira', notice: '' }
    });
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      if (a[0] === 'plan') {
        flow = { stage: 'planning', run: { state: 'running', stage: 'planning', model: 'sonnet' } };
      }
      if (a[0] === 'stop') {
        flow = { stage: 'planning', run: { state: 'stopped', stage: 'planning', model: 'sonnet' } };
      }
      return printed(a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? todo() : {});
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'start' });
    await tick();
    expect(calls).toContainEqual(['plan', 'PROJ-102']);
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /^Planning now$/ })).toBeDefined();
    const box = (await ui.find({ key: 'run' })) as { props?: Record<string, unknown> } | undefined;
    expect(box?.props?.borderStyle).toBe('round');
    expect(await ui.find({ key: 'start' })).toBeUndefined();
    await ui.press({ key: 'stop-run' });
    await tick();
    expect(calls).toContainEqual(['stop', 'PROJ-102']);
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ key: 'start' })).toBeDefined();
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: plan questions come first and take an option or a typed answer`, async ($, on) => {
    const calls: string[][] = [];
    const planned = {
      ...TICKET,
      flow: {
        stage: 'planning',
        need: { kind: 'decision', ask: 'Answer 2 questions, then re-plan', actions: [] },
        questions: [
          {
            q: 'Which list?',
            why: 'Two lists show items.',
            options: ['Map list', 'Table'],
            recommended: 1
          },
          { q: 'Mobile too?', why: 'The mobile list is separate.', options: [] }
        ],
        answered: [{ q: 'Earlier?', a: 'Yes' }],
        assumptions: ['Desktop only'],
        requirements: [{ id: 'R1', text: 'Sorts', check: 'A test' }]
      }
    };
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      return printed(a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? planned : {});
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'tab-planning' });
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /Draft: it can change/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /^1\. Desktop only$/ })).toBeDefined();
    await ui.press({ key: 'opt-1-1' });
    await tick();
    expect(calls).toContainEqual(['answer', 'PROJ-102', '1', 'Table']);
    await ui.input({ key: 'other-2', text: 'Desktop only' });
    await tick();
    expect(calls).toContainEqual(['answer', 'PROJ-102', '2', 'Desktop only']);
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'earlier-toggle' });
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'earlier-change-1' });
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.input({ key: 'earlier-input-1', text: 'No' });
    await tick();
    expect(calls).toContainEqual(['answer', 'PROJ-102', '1', 'No', '--earlier']);
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: the audit log shows the last events, and Debug bundle makes the archive`, async ($, on) => {
    const calls: string[][] = [];
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      const out =
        a[0] === 'sprint'
          ? SPRINT
          : a[0] === 'ticket'
            ? TICKET
            : a[0] === 'audit' && a.includes('--bundle')
              ? { file: '/home/.agent-ticket-board/bundles/PROJ-102.tar.gz' }
              : a[0] === 'audit'
                ? { total: 2, text: '2026-01-01 10:00:00  service    run.started  run=r1' }
                : {};
      return printed(out);
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'audit-log' });
    await tick();
    expect(calls).toContainEqual(['audit', 'PROJ-102', '--json', '--tail=40']);
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /run\.started/ })).toBeDefined();
    await ui.press({ key: 'audit-bundle' });
    await tick();
    expect(calls).toContainEqual(['audit', 'PROJ-102', '--bundle']);
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: the commits and the push are in Ship, the findings are in Code review`, async ($, on) => {
    const flow = {
      stage: 'ship',
      codeReview: {
        at: 'n',
        summary: 'One fixed.',
        checks: [],
        findings: [
          {
            id: 'F1',
            reviewer: 'correctness',
            file: 'a.ts',
            line: 3,
            problem: 'The list can be empty.',
            fix: 'Guard it.',
            severity: 'blocking',
            state: 'fixed',
            note: ''
          }
        ]
      },
      commits: { plan: [], done: [{ title: 'feat(edges): add a sort (PROJ-1)', sha: 'abc1234' }] },
      gate: { at: 'n', ok: true, merged: false, steps: [{ name: 'Merge origin/main', ok: true }] }
    };
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      return printed(
        a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? { ...TICKET, flow } : { ok: true }
      );
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect({
      commit: !!(await ui.find({ type: 'Text', text: /feat\(edges\): add a sort/ })),
      gate: !!(await ui.find({ type: 'Text', text: /Merge origin\/main/ })),
      finding: !!(await ui.find({ type: 'Text', text: /The list can be empty\./ }))
    }).toEqual({ commit: true, gate: true, finding: false });
    await ui.press({ key: 'tab-code-review' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect({
      commit: !!(await ui.find({ type: 'Text', text: /feat\(edges\): add a sort/ })),
      finding: !!(await ui.find({ type: 'Text', text: /The list can be empty\./ }))
    }).toEqual({ commit: false, finding: true });
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  const pushed = (pushedAt?: string) => {
    const sha = 'a'.repeat(40);
    return {
      sha,
      flow: {
        stage: 'ship',
        push: {
          branch: 'feature/PROJ-1-edge',
          head: sha,
          commits: [{ sha, short: 'aaaaaaa', title: 'feat(edges): add a sort (PROJ-1)' }],
          command: 'git push origin HEAD:feature/PROJ-1-edge',
          dryRun: 'To x\n * [new branch]  HEAD -> feature/PROJ-1-edge',
          url: 'https://github.com/org/repo',
          at: 'n',
          ...(pushedAt ? { pushedAt } : {})
        }
      }
    };
  };
  const openShip = async ($: Engine, on: On, flow: unknown) => {
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      return printed(
        a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? { ...TICKET, flow } : { ok: true }
      );
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    return ui;
  };

  test(`${surface}: a section collapses to its title and expands again`, async ($, on) => {
    const flow = {
      stage: 'ship',
      commits: {
        plan: [],
        done: [{ title: 'feat(edges): add a sort (PROJ-1)', sha: 'abc1234' }]
      },
      gate: {
        at: 'n',
        ok: true,
        merged: false,
        steps: [{ name: 'Merge origin/main', command: 'git merge --no-edit origin/main', ok: true }]
      }
    };
    const shown = async (ui: Awaited<ReturnType<typeof openShip>>) => ({
      commit: !!(await ui.find({ type: 'Text', text: /feat\(edges\): add a sort/ })),
      commitsTitle: !!(await ui.find({ type: 'Button', text: /Commits/ })),
      gate: !!(await ui.find({ type: 'Text', text: /Merge origin\/main/ }))
    });
    let ui = await openShip($, on, flow);
    expect(await shown(ui)).toEqual({ commit: true, commitsTitle: true, gate: true });
    expect((await ui.find({ key: 'toggle-commits' }))?.text).toMatch(/^▾ Commits/);

    await ui.press({ key: 'toggle-commits' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    // The commits are hidden, and only they: the title stays, and the next section is untouched.
    expect(await shown(ui)).toEqual({ commit: false, commitsTitle: true, gate: true });
    expect((await ui.find({ key: 'toggle-commits' }))?.text).toMatch(/^▸ Commits/);

    await ui.press({ key: 'toggle-commits' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await shown(ui)).toEqual({ commit: true, commitsTitle: true, gate: true });
    await ui.unmount();
  });

  test(`${surface}: a check is described in words, with its command under it`, async ($, on) => {
    const ui = await openShip($, on, {
      stage: 'ship',
      gate: {
        at: 'n',
        ok: true,
        merged: false,
        steps: [
          { name: 'Clean worktree', command: 'git status --porcelain', ok: true },
          {
            name: 'Lint of the changed files: ESLint rules, formatting included',
            command: 'pnpm exec eslint --quiet {changed}',
            ok: true
          },
          { name: 'pnpm --filter web exec vitest run {tests:apps/web/}', ok: true }
        ]
      }
    });
    expect({
      words: !!(await ui.find({ type: 'Text', text: /Lint of the changed files: ESLint rules/ })),
      command: !!(await ui.find({ type: 'Text', text: /pnpm exec eslint --quiet \{changed\}/ })),
      git: !!(await ui.find({ type: 'Text', text: /git status --porcelain/ })),
      oldRecord: !!(await ui.find({ type: 'Text', text: /Tests of the changed files in web/ }))
    }).toEqual({ words: true, command: true, git: true, oldRecord: true });
    await ui.unmount();
  });

  test(`${surface}: the Push section shows the dry run in rows, and has no links yet`, async ($, on) => {
    const ui = await openShip($, on, pushed().flow);
    expect({
      title: !!(await ui.find({ type: 'Button', text: /Push/ })),
      branch: !!(await ui.find({ type: 'Text', text: /feature\/PROJ-1-edge/ })),
      words: !!(await ui.find({
        type: 'Text',
        text: /Creates the branch feature\/PROJ-1-edge on origin\./
      })),
      command: !!(await ui.find({
        type: 'Text',
        text: /git push origin HEAD:feature\/PROJ-1-edge/
      })),
      commit: !!(await ui.find({ type: 'Text', text: /feat\(edges\): add a sort/ })),
      links: !!(await ui.find({
        type: 'Link',
        text: /Open the branch|Open a pull request|aaaaaaa/
      }))
    }).toEqual({
      title: true,
      branch: true,
      words: true,
      command: true,
      commit: true,
      links: false
    });
    await ui.unmount();
  });

  test(`${surface}: after the push, the branch, the commits and a new pull request are links`, async ($, on) => {
    const p = pushed('n2');
    const ui = await openShip($, on, p.flow);
    const hrefs = (await ui.findAll({ type: 'Link' })).map((l) => String(l.props.href));
    expect(hrefs).toContain(`https://github.com/org/repo/commit/${p.sha}`);
    expect(hrefs).toContain('https://github.com/org/repo/tree/feature/PROJ-1-edge');
    expect(hrefs).toContain('https://github.com/org/repo/pull/new/feature/PROJ-1-edge');
    await ui.unmount();
  });

  test(`${surface}: the push is shown first, and approved as a second step`, async ($, on) => {
    const calls: string[][] = [];
    const flow = {
      stage: 'code-review',
      need: {
        kind: 'decision',
        ask: 'Ready to push 2 commits to origin as feature/x.',
        detail: 'Command: git push origin HEAD:feature/x',
        actions: [
          { id: 'approvePush', label: 'Approve the push' },
          { id: 'showPush', label: 'Refresh the preview' }
        ]
      }
    };
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      return printed(
        a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? { ...TICKET, flow } : { ok: true }
      );
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(
      await ui.find({ type: 'Text', text: /Command: git push origin HEAD:feature\/x/ })
    ).toBeDefined();
    await ui.press({ key: 'act-showPush' });
    await tick();
    expect(calls).toContainEqual(['push-plan', 'PROJ-102']);
    expect(calls).not.toContainEqual(['push', 'PROJ-102']);
    await ui.press({ key: 'act-approvePush' });
    await tick();
    expect(calls).toContainEqual(['push', 'PROJ-102']);
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: a dropped finding can be chosen for a fix, and an open one can be dismissed`, async ($, on) => {
    const calls: string[][] = [];
    const finding = (id: string, state: string) => ({
      id,
      reviewer: 'correctness',
      file: 'a.ts',
      line: 3,
      problem: `Problem ${id}.`,
      fix: 'Fix it.',
      severity: 'blocking',
      state,
      note: state === 'dropped' ? 'The code does not show it.' : ''
    });
    const flow = {
      stage: 'code-review',
      codeReview: {
        at: 'n',
        summary: 'Done.',
        checks: [],
        findings: [finding('F1', 'dropped'), finding('F2', 'open')]
      }
    };
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      return printed(
        a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? { ...TICKET, flow } : { ok: true }
      );
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(
      await ui.find({ type: 'Text', text: /Dropped because: The code does not show it/ })
    ).toBeDefined();
    await ui.press({ key: 'fix-F1' });
    await tick();
    expect(calls).toContainEqual(['finding', 'PROJ-102', 'F1', 'fix']);
    await ui.press({ key: 'dismiss-F2' });
    await tick();
    expect(calls).toContainEqual(['finding', 'PROJ-102', 'F2', 'dismiss']);
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: Start over asks first, and only the confirmation archives and removes the work`, async ($, on) => {
    const calls: string[][] = [];
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      return printed(a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? TICKET : {});
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'start-over' });
    await tick();
    expect(calls.some((c) => c[0] === 'restart')).toBe(false);
    expect(await ui.find({ type: 'Text', text: /removed/ })).toBeDefined();
    await ui.press({ key: 'restart-no' });
    await tick();
    expect(calls.some((c) => c[0] === 'restart')).toBe(false);
    await ui.press({ key: 'start-over' });
    await ui.press({ key: 'restart-yes' });
    await tick();
    expect(calls).toContainEqual(['restart', 'PROJ-102', '--yes']);
    await ui.unmount();
  });
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: Approve plan and start builds, and the Development tab shows the run`, async ($, on) => {
    const calls: string[][] = [];
    const steps = [
      { n: 1, text: 'Do it', covers: ['R1'], state: 'current' },
      { n: 2, text: 'Test it', covers: ['R1'], state: 'todo' }
    ];
    let flow: Record<string, unknown> = {
      stage: 'planning',
      requirements: [{ id: 'R1', text: 'Works', check: 'A test' }],
      steps,
      need: {
        kind: 'decision',
        ask: 'Approve the plan',
        actions: [{ id: 'approve', label: 'Approve plan and start' }]
      }
    };
    on('process.run', ($, e) => {
      const a = e.argv.slice(2);
      calls.push(a);
      if (a[0] === 'develop') {
        flow = {
          stage: 'development',
          steps,
          run: { state: 'running', stage: 'development', model: 'opus', activity: 'Editing a.ts' }
        };
      }
      return printed(a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? { ...TICKET, flow } : {});
    });
    on('session.surfaces', () => ({ value: [surface] }));
    on('ui.open', () => ({ value: { isPlaced: true } }));
    await $.command.run(BOARD);
    await tick();
    let ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'open-PROJ-102' });
    await tick();
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    await ui.press({ key: 'act-approve' });
    await tick();
    expect(calls).toContainEqual(['develop', 'PROJ-102']);
    await ui.unmount();
    ui = await $.ui.mount({ ...PANE, surface });
    expect(await ui.find({ type: 'Text', text: /^Building now$/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /^Now: Editing a\.ts$/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /Do it\s+\(now\)/ })).toBeDefined();
    await ui.unmount();
  });
}

test('desktop: Move to Testing runs atb to-testing, and the step shows its note', async ($, on) => {
  const calls: string[][] = [];
  const flow = {
    stage: 'development',
    steps: [
      { n: 1, text: 'Do it', covers: [], state: 'done' },
      {
        n: 2,
        text: 'Check it in the browser',
        covers: [],
        state: 'todo',
        note: 'Needs a dev server.'
      }
    ],
    checks: [{ name: 'Tests', ok: true }],
    need: {
      kind: 'problem',
      ask: 'Step 2 is not done.',
      detail: 'Needs a dev server and mock edges.',
      actions: [
        { id: 'toTesting', label: 'Move to Testing' },
        { id: 'startDevelopment', label: 'Try again' }
      ]
    }
  };
  on('process.run', ($, e) => {
    const a = e.argv.slice(2);
    calls.push(a);
    return printed(a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? { ...TICKET, flow } : {});
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run(BOARD);
  await tick();
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'open-PROJ-102' });
  await tick();
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: /Needs a dev server\.$/ })).toBeDefined();
  expect(
    await ui.find({ type: 'Text', text: /^Needs a dev server and mock edges\.$/ })
  ).toBeDefined();
  await ui.press({ key: 'act-toTesting' });
  await tick();
  expect(calls).toContainEqual(['to-testing', 'PROJ-102']);
  await ui.unmount();
});

test('desktop: a ticket with no agent record shows what Jira says', async ($, on) => {
  const noRecord = {
    ...TICKET,
    ticket: { ...TICKET.ticket, status: 'Verifying' },
    agent: null,
    flow: null,
    tracker: {
      state: 'done',
      label: 'Finished in Jira',
      notice: 'Jira says Verifying. The board has no agent work for this ticket.'
    }
  };
  on('process.run', ($, e) => {
    const a = e.argv.slice(2);
    const out = a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? noRecord : {};
    return printed(out);
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run(BOARD);
  await tick();
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'open-PROJ-102' });
  await tick();
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: /^Finished in Jira$/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /no agent work for this ticket/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /^Not started$/ })).toBeUndefined();
  await ui.unmount();
});

test('desktop: a row shows the local work for a ticket with no agent record', async ($, on) => {
  const local = {
    branch: 'feat/PROJ-102-x',
    worktree: true,
    changed: 6,
    label: '6 changed files on feat/PROJ-102-x'
  };
  const withLocal = {
    ...SPRINT,
    groups: SPRINT.groups.map((g) => ({
      ...g,
      tickets: g.tickets.map((t) =>
        t.key === 'PROJ-102' ? { ...t, agent: null, state: 'active', local } : t
      )
    }))
  };
  on('process.run', ($, e) => {
    const a = e.argv.slice(2);
    const out = a[0] === 'sprint' ? withLocal : a[0] === 'ticket' ? TICKET : {};
    return printed(out);
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run(BOARD);
  await tick();
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(
    await ui.find({ type: 'Text', text: /6 changed files on feat\/PROJ-102-x/ })
  ).toBeDefined();
  await ui.unmount();
});

test('desktop: Adopt runs atb adopt with the proposed stage', async ($, on) => {
  const calls: string[][] = [];
  const offer = {
    ...TICKET,
    agent: null,
    flow: null,
    tracker: { state: 'active', label: 'Started locally', notice: 'Jira says To Do.' },
    adopt: {
      stage: 'development',
      stageLabel: 'Development',
      text: 'Worktree proj-102-x, 6 changed files.'
    }
  };
  on('process.run', ($, e) => {
    const a = e.argv.slice(2);
    calls.push(a);
    const out = a[0] === 'sprint' ? SPRINT : a[0] === 'ticket' ? offer : {};
    return printed(out);
  });
  on('session.surfaces', () => ({ value: ['desktop'] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  await $.command.run(BOARD);
  await tick();
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  await ui.press({ key: 'open-PROJ-102' });
  await tick();
  await ui.unmount();
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' });
  expect(await ui.find({ type: 'Text', text: /Work found on this machine/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /^Not started$/ })).toBeUndefined();
  await ui.press({ key: 'adopt-yes' });
  await tick();
  expect(calls).toContainEqual(['adopt', 'PROJ-102', '--stage=development']);
  await ui.unmount();
});
