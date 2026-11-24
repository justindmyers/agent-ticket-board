import type { EngineInterface } from 'claude-code';
import { loadSprint } from './cli';
import { hex, type Ctx } from './kit';
import { loadSettings, settings } from './settings';
import { store } from './store';

export function queueHeader($: EngineInterface, ctx: Ctx, run: <T>(args: string[]) => Promise<T>) {
  const { Box, Text, Button } = ctx.els;
  const { sprint, updating } = store;
  const n = sprint ? sprint.groups.reduce((s, g) => s + g.tickets.length, 0) : 0;
  const needsN = sprint?.groups.find((g) => g.group === 'Needs you')?.tickets.length ?? 0;

  return Box({
    key: 'qh',
    flexDirection: 'row',
    justifyContent: 'space-between',
    children: [
      Box({
        key: 'qt',
        flexDirection: 'column',
        children: [
          Text({ weight: 'semibold', children: ['My sprint'] }),
          Box({
            key: 'counts',
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({
                dimColor: true,
                children: [sprint ? n + ' tickets' : updating ? 'Loading…' : '']
              }),
              ...(needsN
                ? [
                    Text({ dimColor: true, children: ['•'] }),
                    Text({ color: hex('violet'), children: [needsN + ' need you'] })
                  ]
                : []),
              ...(updating && sprint ? [Text({ dimColor: true, children: ['•  Updating'] })] : [])
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
              void loadSettings(run, ctx.redraw);
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
}
