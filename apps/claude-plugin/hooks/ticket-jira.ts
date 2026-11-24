import type { EngineInterface } from 'claude-code';
import { atb, reloadTicket } from './cli';
import { hex, kit, type Ctx } from './kit';
import type { Jira } from './types';

function afterMerge($: EngineInterface, ctx: Ctx, j: Jira, key: string) {
  const { Box, Button } = ctx.els;
  const { dim } = kit(ctx);
  const own = j.afterMerge.source === 'ticket' ? j.afterMerge.to : null;
  const auto =
    j.afterMerge.source === 'rule'
      ? j.afterMerge.to
        ? `Automatic: ${j.afterMerge.to} (branch rule)`
        : 'Automatic: ask me (branch rule)'
      : `Automatic: ${j.defaultAfterMerge}`;
  const choose = async (to: string) => {
    await atb($, ['after-merge', key, to]);
    await reloadTicket($, key);
  };

  return [
    dim('After the merge, move to'),
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
}

/** The Jira status section: the agent's permission, the status after the merge and the moves. */
export function ticketJira($: EngineInterface, ctx: Ctx, key: string, jira: Jira | undefined) {
  const { Button } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);

  return [
    sectionTitle('jira', 'Jira status', hex('neutral')),
    Button({
      key: 'agent-move',
      label: (jira?.agentMayMove ? '☑' : '☐') + ' Let the agent update the Jira status',
      plain: true,
      onPress: async () => {
        await atb($, ['agent-may-move', key, jira?.agentMayMove ? 'off' : 'on']);
        await reloadTicket($, key);
      }
    }),
    dim('For routine tickets. Status only: never comments, fields or other tickets.'),
    ...(jira ? afterMerge($, ctx, jira, key) : []),
    ...(jira?.moves ?? []).map((m) =>
      dim(
        (m.ok ? '' : 'Failed: ') +
          (m.from ? m.from + ' → ' : '') +
          m.to +
          '  ·  ' +
          (m.by === 'agent' ? 'by the agent' : 'by you')
      )
    )
  ];
}
