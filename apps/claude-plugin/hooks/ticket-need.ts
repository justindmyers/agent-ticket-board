import type { EngineInterface } from 'claude-code';
import { agentRun, toTesting } from './cli';
import { hex, notBuilt, type Ctx } from './kit';
import { store } from './store';
import type { Flow, Row } from './types';

/** What the agent or the sync needs from the developer, with its actions. */
export function ticketNeed($: EngineInterface, ctx: Ctx, t: Row, need: NonNullable<Flow['need']>) {
  const { Box, Text, Button } = ctx.els;
  const color = hex(need.kind === 'problem' ? 'red' : 'violet');
  const who =
    need.kind === 'problem'
      ? '● Problem'
      : need.from === 'sync'
        ? '● Out of sync with Jira'
        : '● Agent needs you';

  return Box({
    key: 'need',
    flexDirection: 'column',
    rowGap: 'xs',
    borderStyle: 'round',
    borderColor: color,
    paddingX: 1,
    children: [
      Text({ color, children: [who] }),
      Text({ wrap: 'wrap', children: [need.ask] }),
      ...(need.detail ? [Text({ dimColor: true, wrap: 'wrap', children: [need.detail] })] : []),
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
                store.confirmMove = { key: t.key, to: x.id.slice(5), from: t.status };
                ctx.redraw();
              } else if (x.id === 'toTesting') {
                void toTesting($, t.key);
              } else if (x.id === 'startPlanning' || x.id === 'replan') {
                void agentRun($, t.key, 'plan');
              } else if (
                x.id === 'startDevelopment' ||
                (x.id === 'approve' && store.detail?.flow?.stage === 'planning')
              ) {
                void agentRun($, t.key, 'develop');
              } else {
                notBuilt($, t.key, x.label);
              }
            }
          })
        )
      })
    ]
  });
}
