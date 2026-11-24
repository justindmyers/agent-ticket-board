// Agent Ticket Board for Claude Code (Desktop app and terminal). Same data, actions and look as the
// VS Code extension, through the shared `atb` CLI and ~/.agent-ticket-board. The pane never opens in the
// VS Code panel: VS Code has the extension. The rule guards run everywhere.
// paths.gen.ts is written by `pnpm install-local`: absolute paths, because the Claude app's PATH
// may not include the folder that has node.
import { ATB, NODE } from './paths.gen';
import { loadSettings, renderSettings, settings } from './settings';

const PANE = 'board';

// The stage palette, shared with the VS Code extension (webview/surfaces.ts, webview/stages.ts).
const C = {
  blue: '#3A86FE',
  aqua: '#64E4ED',
  amber: '#FFBE0C',
  green: '#1EC46E',
  violet: '#A78BFA',
  red: '#FA4045',
  neutral: '#96969D'
};
const STAGES = [
  { id: 'planning', label: 'Planning', color: C.blue },
  { id: 'development', label: 'Development', color: C.aqua },
  { id: 'testing', label: 'Testing', color: C.amber },
  { id: 'code-review', label: 'Code review', color: C.green }
];
const COLLAPSED_BY_DEFAULT = new Set(['Done']);

type Agent = {
  stage: string;
  stageLabel: string;
  kind: 'problem' | 'decision' | 'running' | 'waiting' | 'finished';
  closed?: string;
  ask?: string;
  action?: { id: string; label: string };
  progress?: string;
} | null;
type Row = {
  key: string;
  summary: string;
  status: string;
  type?: string;
  points: number | null;
  agent: Agent;
};
type Sprint = { at: string | null; groups: { group: string; tickets: Row[] }[] };

let sprint: Sprint | null = null;
let updating = false;
let error = '';
let open: string | null = null;
type Flow = {
  stage: string;
  closed?: { reason: string; text: string };
  need?: {
    kind: 'problem' | 'decision';
    from?: 'sync';
    ask: string;
    actions: { id: string; label: string }[];
  };
  requirements?: {
    id: string;
    text: string;
    check: string;
    met?: boolean;
    evidence?: { label: string };
  }[];
  questions?: { q: string; a?: string }[];
  steps?: { n: number; text: string; covers: string[]; state: string }[];
  checks?: { name: string; ok: boolean | null; note?: string }[];
  review?: string;
  app?: string;
  pr?: {
    number: number;
    url: string;
    state: string;
    checks: string;
    failing: number;
    reviews: string;
    comments: number;
  };
};
type Detail = {
  ticket: Row & { priority?: string };
  flow: Flow | null;
  comments: { id: string; text: string; ran?: boolean }[];
  sections: { title: string | null; kind: string; md: string }[] | null;
  jira?: {
    agentMayMove: boolean;
    afterMerge: { to: string | null; source: 'ticket' | 'rule' | 'default'; rule?: string };
    defaultAfterMerge: string;
    afterMergeOptions: string[];
    moves: { from?: string; to: string; by: string; ok: boolean }[];
  };
  jiraUrl: string | null;
};
let detail: Detail | null = null;
let draft = '';
let confirmMove: { key: string; to: string; from?: string } | null = null;
const tabs: Record<string, string> = {};
const collapsed: Record<string, boolean> = {};

export const GIT_PUSH = /\bgit\b[^;&|]*\bpush\b/;
export const JIRA_WRITE =
  /\bacli\s+jira\s+workitem\s+(transition|edit|comment|assign|create|delete|link|attachment)\b/;
// Only a client may pass --approved (the developer's approval); the agent uses `atb move` without it.
export const SELF_APPROVE = /\batb(\.cjs)?\b[^;&|]*\bmove\b[^;&|]*--approved\b/;

const accentOf = (a: Agent, status?: string) =>
  a?.kind === 'problem'
    ? C.red
    : a?.kind === 'finished'
      ? C.green
      : a
        ? (STAGES.find((s) => s.id === a.stage)?.color ?? C.neutral)
        : /done|verifying/i.test(status ?? '')
          ? C.green
          : C.neutral;
const needsYou = (a: Agent) => !!a && (a.kind === 'problem' || a.kind === 'decision');
const isOpen = (g: string) => !(collapsed[g] ?? COLLAPSED_BY_DEFAULT.has(g));

async function atb<T = unknown>($, args: string[], timeoutMs = 60000): Promise<T> {
  const r = await $.process.run([NODE, ATB, ...args], { timeoutMs });
  if (r.exitCode !== 0) {
    throw new Error((r.stderr || 'atb failed').trim().slice(0, 200));
  }
  return JSON.parse(r.stdout);
}

async function loadSprint($) {
  try {
    const c = await atb<Sprint>($, ['sprint', '--cached']);
    if (c.groups.length) {
      sprint = c;
    }
  } catch {
    /* no cache yet */
  }
  updating = true;
  $.ui.invalidate('ui.render');
  try {
    sprint = await atb<Sprint>($, ['sprint']);
    error = '';
  } catch (e) {
    error = String(e?.message ?? e);
  }
  updating = false;
  $.ui.invalidate('ui.render');
}

async function loadTicket($, key: string) {
  open = key;
  detail = null;
  draft = '';
  $.ui.invalidate('ui.render');
  try {
    detail = await atb<Detail>($, ['ticket', key, '--cached']);
  } catch {
    /* fall through */
  }
  $.ui.invalidate('ui.render');
  try {
    detail = await atb<Detail>($, ['ticket', key]);
  } catch (e) {
    error = String(e?.message ?? e);
  }
  $.ui.invalidate('ui.render');
}

async function openIfApp($) {
  const surfaces = await $.session.surfaces();
  if (!surfaces.includes('desktop') && !surfaces.includes('terminal')) {
    return false;
  }
  const r = await $.ui.open({ id: PANE, title: 'My sprint' });
  if (r.isPlaced) {
    void loadSprint($);
  }
  return !!r.isPlaced;
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'board',
      description: 'Open Agent Ticket Board (Claude app and terminal)',
      immediate: true
    });
    const result = await next(e);
    const surfaces = await $.session.surfaces();
    if (surfaces.includes('desktop')) {
      await openIfApp($);
    }
    return result;
  });

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const result = await next(e);
    await openIfApp($);
    return result;
  });

  on('command.run', { command: 'board' }, async ($) => {
    const placed = await openIfApp($);
    return placed
      ? {}
      : { text: 'In VS Code, use the Agent Ticket Board view in the activity bar.' };
  });

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cmd = String(e.command ?? '');
    if (GIT_PUSH.test(cmd)) {
      $.ui.toast('Blocked git push (needs your "approved" first)');
      return {
        deny: 'BLOCKED by agent-ticket-board: git push is not allowed until the owner approves the ticket. Do not retry; tell the owner it is ready to test.'
      };
    }
    if (SELF_APPROVE.test(cmd)) {
      return {
        deny: 'BLOCKED by agent-ticket-board: only the developer approves a Jira move. Run `atb move <KEY> <STATUS>` without --approved; it works only if the developer allowed it for that ticket.'
      };
    }
    if (JIRA_WRITE.test(cmd)) {
      return {
        deny: 'BLOCKED by agent-ticket-board: the agent never writes to Jira directly. To change a status, run `atb move <KEY> <STATUS>` (works only where the developer allowed it). For comments or fields, draft the text for the developer.'
      };
    }
    return next(e);
  }).catch(async ($, e, next) => {
    if (next.called) {
      return next(e);
    }
    return {
      deny: 'The agent-ticket-board guard failed, so this command was not run: ' + next.error.kind
    };
  });

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e);
    }
    const { Box, Text, Button, Input, Link, Markdown } = $.ui.resolve(e);
    const redraw = () => $.ui.invalidate('ui.render');
    const width = Math.max(20, (e.props?.bodyColumns ?? 60) - 2);
    const rule = (k: string) =>
      Text({ key: k, dimColor: true, wrap: 'clip', children: ['─'.repeat(width)] });
    const dim = (k: string, s: string) =>
      Text({ key: k, dimColor: true, wrap: 'wrap', children: [s] });
    const sectionTitle = (k: string, title: string, color: string, aside?: string) =>
      Box({
        key: k,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ key: 'i', color, children: ['◆'] }),
          Text({ key: 't', weight: 'semibold', children: [title] }),
          ...(aside ? [Text({ key: 'a', dimColor: true, children: [aside] })] : [])
        ]
      });
    const afterMerge = (j: NonNullable<Detail['jira']>, key: string) => {
      const own = j.afterMerge.source === 'ticket' ? j.afterMerge.to : null;
      const auto =
        j.afterMerge.source === 'rule'
          ? j.afterMerge.to
            ? `Automatic: ${j.afterMerge.to} (branch rule)`
            : 'Automatic: ask me (branch rule)'
          : `Automatic: ${j.defaultAfterMerge}`;
      const choose = async (to: string) => {
        await atb($, ['after-merge', key, to]);
        detail = await atb<Detail>($, ['ticket', key, '--cached']);
        redraw();
      };
      return [
        dim('am-l', 'After the merge, move to'),
        Box({
          key: 'am',
          flexDirection: 'row',
          columnGap: 1,
          flexWrap: 'wrap',
          children: [
            Button({
              key: 'am-auto',
              label: auto,
              variant: own ? 'secondary' : 'primary',
              onPress: () => choose('default')
            }),
            ...j.afterMergeOptions.map((s) =>
              Button({
                key: 'am-' + s,
                label: s,
                variant: own === s ? 'primary' : 'secondary',
                onPress: () => choose(s)
              })
            )
          ]
        })
      ];
    };
    const act = (key: string, label: string) =>
      $.ui.toast(`${key}: ${label}. Not built yet: nothing started.`);
    const run = <T>(args: string[]) => atb<T>($, args);

    if (settings.open) {
      return renderSettings(
        { Box, Text, Button, Input },
        run,
        redraw,
        () => {
          settings.open = false;
          redraw();
        },
        (text) => $.ui.toast(text)
      );
    }

    // ---------- Ticket ----------
    if (open) {
      const back = Button({
        key: 'back',
        label: '← My sprint',
        plain: true,
        onPress: () => {
          open = null;
          detail = null;
          redraw();
        }
      });
      const d = detail;
      if (!d) {
        return Box({
          flexDirection: 'column',
          rowGap: 'sm',
          children: [back, dim('loading', 'Loading ' + open + '…')]
        });
      }
      const t = d.ticket,
        f = d.flow,
        need = f?.need;
      const si = f?.closed ? STAGES.length : f ? STAGES.findIndex((s) => s.id === f.stage) : -1;
      const stage = f?.closed ? null : si >= 0 ? STAGES[si] : null;
      const accent =
        need?.kind === 'problem' ? C.red : f?.closed ? C.green : (stage?.color ?? C.neutral);
      const tab = tabs[t.key] ?? stage?.id ?? (f?.closed ? 'code-review' : 'planning');
      const ti = STAGES.findIndex((s) => s.id === tab);

      const header = Box({
        key: 'head',
        flexDirection: 'column',
        rowGap: 'xs',
        borderStyle: 'round',
        borderColor: accent,
        paddingX: 1,
        children: [
          Box({
            key: 'crumb',
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ key: 'k', dimColor: true, children: [t.key + '  ›'] }),
              Text({
                key: 's',
                color: stage?.color ?? (f?.closed ? C.green : C.neutral),
                children: [stage ? stage.label : f?.closed ? 'Finished' : 'Not started']
              })
            ]
          }),
          Text({ key: 'title', weight: 'semibold', wrap: 'wrap', children: [t.summary] }),
          dim(
            'sub',
            [
              t.type,
              t.points == null ? 'Not pointed' : t.points + ' pts',
              t.priority && t.priority + ' priority',
              t.status + ' in Jira'
            ]
              .filter(Boolean)
              .join('  •  ')
          ),
          ...(f?.closed
            ? [
                Text({
                  key: 'closed',
                  color: C.green,
                  wrap: 'wrap',
                  children: [
                    '✓ Finished. ' +
                      f.closed.text +
                      " The board updated this ticket's local record to match."
                  ]
                })
              ]
            : []),
          ...(need
            ? [
                Box({
                  key: 'need',
                  flexDirection: 'column',
                  rowGap: 'xs',
                  borderStyle: 'round',
                  borderColor: need.kind === 'problem' ? C.red : C.violet,
                  paddingX: 1,
                  children: [
                    Text({
                      key: 'who',
                      color: need.kind === 'problem' ? C.red : C.violet,
                      children: [
                        need.kind === 'problem'
                          ? '● Problem'
                          : need.from === 'sync'
                            ? '● Out of sync with Jira'
                            : '● Agent needs you'
                      ]
                    }),
                    Text({ key: 'ask', wrap: 'wrap', children: [need.ask] }),
                    Box({
                      key: 'acts',
                      flexDirection: 'row',
                      columnGap: 1,
                      flexWrap: 'wrap',
                      children: need.actions.map((x, i) =>
                        Button({
                          key: 'act-' + x.id,
                          label: x.label,
                          variant: i === 0 ? 'primary' : 'secondary',
                          onPress: () => {
                            if (x.id.startsWith('move:')) {
                              confirmMove = { key: t.key, to: x.id.slice(5), from: t.status };
                              redraw();
                            } else {
                              act(t.key, x.label);
                            }
                          }
                        })
                      )
                    })
                  ]
                })
              ]
            : []),
          Box({
            key: 'tabs',
            flexDirection: 'row',
            columnGap: 1,
            flexWrap: 'wrap',
            children: STAGES.map((s, i) =>
              Button({
                key: 'tab-' + s.id,
                variant: s.id === tab ? 'primary' : 'secondary',
                label: (i < si ? '✓ ' : i === si ? '● ' : '') + s.label,
                onPress: () => {
                  tabs[t.key] = s.id;
                  redraw();
                }
              })
            )
          })
        ]
      });

      const body: unknown[] = [];
      if (tab === 'planning') {
        if (!f && /^(to do|in progress)$/i.test(t.status)) {
          body.push(
            sectionTitle('ns', 'Not started', C.blue),
            dim(
              'ns-c',
              'Planning reads the ticket, asks only the questions that change the build, then writes requirements and steps for you to approve.'
            ),
            Button({
              key: 'start',
              label: 'Start planning',
              variant: 'primary',
              onPress: () => act(t.key, 'Start planning')
            })
          );
        }
        if (f?.requirements) {
          body.push(
            sectionTitle('req', 'Requirements', C.blue, String(f.requirements.length)),
            ...f.requirements.map((r) =>
              Box({
                key: 'r-' + r.id,
                flexDirection: 'column',
                children: [
                  Text({ key: 't', wrap: 'wrap', children: [r.id + '  ' + r.text] }),
                  dim('c', '    ' + r.check)
                ]
              })
            )
          );
        }
        if (f?.questions) {
          body.push(
            sectionTitle('q', 'Questions', C.violet),
            ...f.questions.map((q, i) =>
              Box({
                key: 'q' + i,
                flexDirection: 'column',
                children: [
                  Text({ key: 't', wrap: 'wrap', children: [(q.a ? '✓ ' : '? ') + q.q] }),
                  Text({
                    key: 'a',
                    color: q.a ? undefined : C.violet,
                    dimColor: !!q.a,
                    wrap: 'wrap',
                    children: ['    ' + (q.a ?? 'Waiting for your answer')]
                  })
                ]
              })
            )
          );
        }
        if (f?.steps) {
          body.push(
            sectionTitle('plan', 'Plan', C.blue, f.steps.length + ' steps'),
            ...f.steps.map((s) =>
              Text({
                key: 'p' + s.n,
                wrap: 'wrap',
                children: [
                  s.n + '. ' + s.text + (s.covers.length ? '   ' + s.covers.join(' ') : '')
                ]
              })
            )
          );
        }
        for (const [i, s] of (d.sections ?? []).entries()) {
          body.push(
            sectionTitle(
              'sec' + i,
              s.kind === 'context'
                ? 'Ticket'
                : s.kind === 'acceptance'
                  ? 'Acceptance criteria'
                  : (s.title ?? 'Notes'),
              s.kind === 'notes' ? C.violet : s.kind === 'acceptance' ? C.green : C.neutral,
              s.kind === 'notes' ? 'A note in the Jira ticket' : 'From Jira'
            ),
            Markdown({ key: 'secmd' + i, text: s.md })
          );
        }
        if (d.sections === null) {
          body.push(dim('desc', 'Loading the description…'));
        }
      } else if (!f || ti > si) {
        body.push(
          dim(
            'later',
            STAGES[ti].label + ' starts after ' + STAGES[ti - 1].label.toLowerCase() + '.'
          )
        );
      } else if (tab === 'development') {
        if (f.steps) {
          body.push(
            sectionTitle(
              'steps',
              'Steps',
              C.aqua,
              f.steps.filter((s) => s.state === 'done').length + ' of ' + f.steps.length
            ),
            ...f.steps.map((s) =>
              Text({
                key: 's' + s.n,
                dimColor: s.state === 'done',
                wrap: 'wrap',
                children: [
                  (s.state === 'done' ? '✓ ' : s.state === 'current' ? '● ' : '○ ') +
                    s.text +
                    (s.state === 'current' ? '   (now)' : '')
                ]
              })
            )
          );
        }
        if (f.checks) {
          body.push(
            sectionTitle(
              'gate',
              'Final gate',
              f.checks.some((c) => c.ok === false) ? C.red : C.green
            ),
            ...f.checks.map((c) =>
              Text({
                key: 'c-' + c.name,
                children: [
                  (c.ok ? '✓ ' : c.ok === false ? '✕ ' : '○ ') +
                    c.name +
                    (c.note ? '   ' + c.note : '')
                ]
              })
            )
          );
        }
        if (f.review) {
          body.push(sectionTitle('rev', 'Agent review', C.violet), dim('rev-t', f.review));
        }
      } else if (tab === 'testing') {
        body.push(
          sectionTitle(
            'tc',
            'Test checklist',
            C.amber,
            (f.requirements ?? []).filter((r) => r.met).length +
              ' of ' +
              (f.requirements ?? []).length
          )
        );
        if (f.app) {
          body.push(Link({ key: 'app', href: f.app, label: 'Open app  ' + f.app }));
        }
        body.push(
          ...(f.requirements ?? []).map((r) =>
            Box({
              key: 'tr-' + r.id,
              flexDirection: 'column',
              children: [
                Text({
                  key: 't',
                  wrap: 'wrap',
                  children: [(r.met ? '✓ ' : '○ ') + r.id + '  ' + r.text]
                }),
                Text({
                  key: 'e',
                  color: r.evidence ? C.green : undefined,
                  dimColor: !r.evidence,
                  wrap: 'wrap',
                  children: ['    ' + r.check + '  ·  ' + (r.evidence?.label ?? 'no evidence')]
                })
              ]
            })
          )
        );
      } else if (f.pr) {
        body.push(
          sectionTitle(
            'pr',
            'Pull request #' + f.pr.number,
            f.pr.failing ? C.red : C.green,
            f.pr.state
          ),
          dim('pr-c', 'Another person reviews it on GitHub. The stage ends at the merge.'),
          Text({
            key: 'pr-s',
            wrap: 'wrap',
            children: [
              'Checks: ' +
                f.pr.checks +
                '   Reviews: ' +
                f.pr.reviews +
                '   Comments: ' +
                f.pr.comments
            ]
          }),
          Link({ key: 'pr-l', href: f.pr.url, label: 'Open pull request #' + f.pr.number })
        );
      } else {
        body.push(dim('nopr', 'No pull request yet.'));
      }

      const add = async (text: string, run: boolean) => {
        if (!text.trim()) {
          return;
        }
        await atb($, ['comment', t.key, text, ...(run ? ['--run'] : [])]);
        if (run) {
          $.ui.toast(t.key + ': comment saved. Not built yet: the agent does not resume.');
        }
        draft = '';
        detail = await atb<Detail>($, ['ticket', t.key, '--cached']);
        redraw();
      };
      const comments = [
        sectionTitle(
          'cm',
          'Comments for the agent',
          C.violet,
          (d.comments ?? []).length ? String(d.comments.length) : undefined
        ),
        dim('cm-c', 'Saved on this machine, never sent to Jira.'),
        ...(d.comments ?? []).map((c) =>
          Box({
            key: 'cm-' + c.id,
            flexDirection: 'column',
            children: [
              dim('w', 'You' + (c.ran ? '  ·  sent to the agent' : '')),
              Text({ key: 't', wrap: 'wrap', children: [c.text] })
            ]
          })
        ),
        Input({
          key: 'comment',
          label: 'Comment for the agent',
          placeholder: 'The agent reads every comment at the start of its next run',
          value: draft,
          submitLabel: 'comment',
          onInput: (v) => {
            draft = v;
          },
          onSubmit: (v) => add(v, false)
        }),
        Button({
          key: 'comment-run',
          label: 'Comment and resume agent',
          onPress: () => add(draft, true)
        })
      ];

      return Box({
        flexDirection: 'column',
        rowGap: 'sm',
        children: [
          Box({
            key: 'top',
            flexDirection: 'row',
            justifyContent: 'space-between',
            children: [
              back,
              ...(d.jiraUrl ? [Link({ key: 'jira', href: d.jiraUrl, label: 'Jira ↗' })] : [])
            ]
          }),
          header,
          ...(confirmMove?.key === t.key
            ? [
                Box({
                  key: 'confirm',
                  flexDirection: 'column',
                  rowGap: 'xs',
                  borderStyle: 'round',
                  borderColor: C.amber,
                  paddingX: 1,
                  children: [
                    Text({
                      key: 'q',
                      wrap: 'wrap',
                      children: [
                        'Move ' +
                          t.key +
                          ' from ' +
                          (confirmMove.from ?? '?') +
                          ' to ' +
                          confirmMove.to +
                          ' in Jira? Only the status changes.'
                      ]
                    }),
                    Box({
                      key: 'b',
                      flexDirection: 'row',
                      columnGap: 1,
                      children: [
                        Button({
                          key: 'confirm-move',
                          label: 'Move to ' + confirmMove.to,
                          variant: 'primary',
                          onPress: async () => {
                            const m = confirmMove!;
                            confirmMove = null;
                            try {
                              await atb($, ['move', m.key, m.to, '--approved']);
                              $.ui.toast(m.key + ' moved to ' + m.to + ' in Jira');
                            } catch (err) {
                              $.ui.toast(
                                m.key + ': Jira status not changed. ' + String(err?.message ?? err)
                              );
                            }
                            await loadTicket($, m.key);
                            void loadSprint($);
                          }
                        }),
                        Button({
                          key: 'cancel-move',
                          label: 'Cancel',
                          onPress: () => {
                            confirmMove = null;
                            redraw();
                          }
                        })
                      ]
                    })
                  ]
                })
              ]
            : []),
          ...body,
          rule('r-jira'),
          sectionTitle('jira', 'Jira status', C.neutral),
          Button({
            key: 'agent-move',
            label: (d.jira?.agentMayMove ? '☑' : '☐') + ' Let the agent update the Jira status',
            plain: true,
            onPress: async () => {
              await atb($, ['agent-may-move', t.key, d.jira?.agentMayMove ? 'off' : 'on']);
              detail = await atb<Detail>($, ['ticket', t.key, '--cached']);
              redraw();
            }
          }),
          dim(
            'agent-move-c',
            'For routine tickets. Status only: never comments, fields or other tickets.'
          ),
          ...(d.jira ? afterMerge(d.jira, t.key) : []),
          ...(d.jira?.moves ?? []).map((m, i) =>
            dim(
              'mv' + i,
              (m.ok ? '' : 'Failed: ') +
                (m.from ? m.from + ' → ' : '') +
                m.to +
                '  ·  ' +
                (m.by === 'agent' ? 'by the agent' : 'by you')
            )
          ),
          rule('r-cm'),
          ...comments,
          ...(f ? [dim('sample', 'Agent data on this page is sample data.')] : [])
        ]
      });
    }

    // ---------- Queue ----------
    const n = sprint ? sprint.groups.reduce((s, g) => s + g.tickets.length, 0) : 0;
    const needsN = sprint?.groups.find((g) => g.group === 'Needs you')?.tickets.length ?? 0;
    const header = Box({
      key: 'qh',
      flexDirection: 'row',
      justifyContent: 'space-between',
      children: [
        Box({
          key: 'qt',
          flexDirection: 'column',
          children: [
            Text({ key: 'title', weight: 'semibold', children: ['My sprint'] }),
            Box({
              key: 'counts',
              flexDirection: 'row',
              columnGap: 1,
              children: [
                Text({
                  key: 'n',
                  dimColor: true,
                  children: [sprint ? n + ' tickets' : updating ? 'Loading…' : '']
                }),
                ...(needsN
                  ? [
                      Text({ key: 'dot', dimColor: true, children: ['•'] }),
                      Text({ key: 'need', color: C.violet, children: [needsN + ' need you'] })
                    ]
                  : []),
                ...(updating && sprint
                  ? [Text({ key: 'upd', dimColor: true, children: ['•  Updating'] })]
                  : [])
              ]
            })
          ]
        }),
        Box({
          key: 'qa',
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Button({
              key: 'settings',
              label: 'Settings',
              plain: true,
              onPress: () => {
                settings.open = true;
                void loadSettings(run, redraw);
              }
            }),
            Button({
              key: 'refresh',
              label: 'Refresh',
              plain: true,
              onPress: () => void loadSprint($)
            })
          ]
        })
      ]
    });
    if (!sprint) {
      return Box({
        flexDirection: 'column',
        rowGap: 'sm',
        children: [
          header,
          dim('state', error ? 'Jira load failed: ' + error : 'Loading your sprint…')
        ]
      });
    }

    const rows: unknown[] = [];
    sprint.groups.forEach((g, gi) => {
      if (gi > 0) {
        rows.push(rule('rule-' + g.group));
      }
      rows.push(
        Button({
          key: 'grp-' + g.group,
          plain: true,
          label: (isOpen(g.group) ? '▾ ' : '▸ ') + g.group.toUpperCase() + '   ' + g.tickets.length,
          onPress: () => {
            collapsed[g.group] = isOpen(g.group);
            redraw();
          }
        })
      );
      if (!isOpen(g.group)) {
        return;
      }
      for (const t of g.tickets) {
        const a = t.agent,
          accent = accentOf(a, t.status),
          loud = needsYou(a);
        const meta =
          a?.kind === 'running' && a.progress
            ? 'Step ' + a.progress.replace('/', ' of ')
            : t.points == null
              ? 'No points'
              : t.points + ' pts';
        rows.push(
          Box({
            key: 'row-' + t.key,
            flexDirection: 'column',
            paddingX: 1,
            ...(loud ? { borderStyle: 'round', borderColor: accent } : {}),
            children: [
              Box({
                key: 'm',
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  Text({
                    key: 'dot',
                    color: accent,
                    children: [a?.kind === 'running' ? '◉' : '●']
                  }),
                  Text({ key: 'k', dimColor: true, children: [t.key] }),
                  Box({ key: 'sp', flexGrow: 1 }),
                  Text({ key: 'meta', dimColor: true, children: [meta] })
                ]
              }),
              Button({
                key: 'open-' + t.key,
                label: t.summary,
                plain: true,
                onPress: () => void loadTicket($, t.key)
              }),
              ...(loud
                ? [
                    Text({
                      key: 'ask',
                      color: a!.kind === 'problem' ? C.red : C.violet,
                      wrap: 'wrap',
                      children: [a!.ask]
                    })
                  ]
                : [])
            ]
          })
        );
      }
    });
    return Box({ flexDirection: 'column', rowGap: 'sm', children: [header, ...rows] });
  });
}
