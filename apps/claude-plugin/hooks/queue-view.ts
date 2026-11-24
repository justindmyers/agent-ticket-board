import type { EngineInterface, RenderElement } from 'claude-code';
import { kit, type Ctx } from './kit';
import { queueHeader } from './queue-header';
import { queueRow } from './queue-row';
import { isOpen, store } from './store';

export function queueView($: EngineInterface, ctx: Ctx, run: <T>(args: string[]) => Promise<T>) {
  const { Box, Button, Text } = ctx.els;
  const { rule, dim } = kit(ctx);
  const header = queueHeader($, ctx, run);
  const { sprint, error } = store;
  if (!sprint) {
    return Box({
      flexDirection: 'column',
      rowGap: 'sm',
      children: [header, dim(error ? 'Jira load failed: ' + error : 'Loading your sprint…')]
    });
  }

  const rows: RenderElement[] = [];
  sprint.groups.forEach((g, gi) => {
    if (gi > 0) {
      rows.push(rule());
    }
    rows.push(
      Box({
        key: 'grp-row-' + g.group,
        flexDirection: 'row',
        alignItems: 'center',
        children: [
          Button({
            key: 'grp-' + g.group,
            plain: true,
            label: (isOpen(g.group) ? '▾ ' : '▸ ') + g.group.toUpperCase(),
            onPress: () => {
              store.collapsed[g.group] = isOpen(g.group);
              ctx.redraw();
            }
          }),
          Box({ key: 'sp', flexGrow: 1 }),
          Text({ dimColor: true, children: [String(g.tickets.length)] })
        ]
      })
    );
    if (isOpen(g.group)) {
      rows.push(...g.tickets.map((t) => queueRow($, ctx, t)));
    }
  });
  return Box({ flexDirection: 'column', rowGap: 'sm', children: [header, ...rows] });
}
