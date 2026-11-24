import type { EngineInterface } from 'claude-code';
import { loadTicket } from './cli';
import { accentHex, hex, needsYou, type Ctx } from './kit';
import { pulse } from './pulse';
import type { Row } from './types';

const metaOf = (t: Row) =>
  t.agent?.kind === 'running' && t.agent.progress
    ? 'Step ' + t.agent.progress.replace('/', ' of ')
    : t.points == null
      ? 'No points'
      : t.points + ' pts';

export function queueRow($: EngineInterface, ctx: Ctx, t: Row) {
  const { Box, Text, Button } = ctx.els;
  const a = t.agent;
  const accent = accentHex(a, t.state);
  const loud = needsYou(a);
  const running = a?.kind === 'running';

  return Box({
    key: 'row-' + t.key,
    flexDirection: 'column',
    paddingX: 1,
    ...(loud ? { borderStyle: 'round', borderColor: accent } : {}),
    ...(running ? { borderStyle: 'round', borderColor: pulse(accent) } : {}),
    children: [
      Box({
        key: 'm',
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: accent, children: [a?.kind === 'running' ? '◉' : '●'] }),
          Text({ dimColor: true, children: [t.key] }),
          Box({ key: 'sp', flexGrow: 1 }),
          Text({ dimColor: true, children: [metaOf(t)] })
        ]
      }),
      Button({
        key: 'open-' + t.key,
        label: t.summary,
        plain: true,
        onPress: () => void loadTicket($, t.key)
      }),
      ...(!a && t.local
        ? [
            Text({
              dimColor: true,
              wrap: 'truncate',
              children: ['⎇ ' + t.local.label]
            })
          ]
        : []),
      ...(loud && a
        ? [
            Text({
              color: hex(a.kind === 'problem' ? 'red' : 'violet'),
              wrap: 'wrap',
              children: [a.ask ?? '']
            })
          ]
        : [])
    ]
  });
}
