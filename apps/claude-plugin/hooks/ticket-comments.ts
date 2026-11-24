import type { EngineInterface } from 'claude-code';
import { atb, reloadTicket } from './cli';
import { hex, kit, type Ctx } from './kit';
import { store } from './store';
import type { Detail } from './types';

/** Comments for the agent: saved on this machine, never sent to Jira. */
export function ticketComments($: EngineInterface, ctx: Ctx, d: Detail) {
  const { Box, Text, Button, Input } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const key = d.ticket.key;
  const comments = d.comments ?? [];
  const running = d.flow?.run?.state === 'running' || d.flow?.run?.state === 'queued';
  const add = async (text: string, run: boolean) => {
    if (!text.trim()) {
      return;
    }
    // Comment and re-plan: built work goes back to Planning for the change.
    await atb($, run ? ['change', key, text] : ['comment', key, text]);
    store.draft = '';
    await reloadTicket($, key);
  };

  return [
    sectionTitle(
      'cm',
      'Comments for the agent',
      hex('violet'),
      comments.length ? String(comments.length) : undefined
    ),
    dim('Saved on this machine, never sent to Jira.'),
    ...comments.map((c) =>
      Box({
        key: 'cm-' + c.id,
        flexDirection: 'column',
        children: [
          dim('You' + (c.ran ? '  ·  sent to the agent' : '')),
          Text({ wrap: 'wrap', children: [c.text] })
        ]
      })
    ),
    Input({
      key: 'comment',
      label: 'Comment for the agent',
      placeholder: 'The agent reads every comment at the start of its next run',
      value: store.draft,
      submitLabel: 'comment',
      onInput: (v: string) => {
        store.draft = v;
      },
      onSubmit: (v: string) => add(v, false)
    }),
    // A re-plan waits for the run that is active.
    running
      ? dim('Comment and re-plan is available when the agent run ends.')
      : Button({
          key: 'comment-run',
          label: 'Comment and re-plan',
          onPress: () => add(store.draft, true)
        })
  ];
}
