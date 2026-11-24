import { runLine } from './look.gen';
import { ticketAudit } from './ticket-audit';
import type { EngineInterface } from 'claude-code';
import { kit, type Ctx } from './kit';
import { store } from './store';
import { ticketBody } from './ticket-body';
import { ticketComments } from './ticket-comments';
import { ticketConfirm } from './ticket-confirm';
import { ticketHeader } from './ticket-header';
import { ticketJira } from './ticket-jira';

export function ticketView($: EngineInterface, ctx: Ctx, key: string) {
  const { Box, Button, Link } = ctx.els;
  const { rule, dim } = kit(ctx);
  const back = Button({
    key: 'back',
    label: '← My sprint',
    plain: true,
    onPress: () => {
      store.open = null;
      store.detail = null;
      ctx.redraw();
    }
  });
  const d = store.detail;
  if (!d) {
    return Box({
      flexDirection: 'column',
      rowGap: 'sm',
      children: [back, dim('Loading ' + key + '…')]
    });
  }
  const move = store.confirmMove;

  return Box({
    flexDirection: 'column',
    rowGap: 'sm',
    children: [
      Box({
        key: 'top',
        flexDirection: 'row',
        justifyContent: 'space-between',
        children: [back, ...(d.jiraUrl ? [Link({ href: d.jiraUrl, label: 'Jira ↗' })] : [])]
      }),
      ticketHeader($, ctx, d),
      ...(move?.key === d.ticket.key ? [ticketConfirm($, ctx, move)] : []),
      ...ticketBody($, ctx, d),
      rule(),
      ...ticketJira($, ctx, d.ticket.key, d.jira),
      rule(),
      ...ticketComments($, ctx, d),
      ...(runLine(d.flow?.run) ? [dim(runLine(d.flow?.run)!)] : []),
      ...ticketAudit($, ctx, d.ticket.key)
    ]
  });
}
