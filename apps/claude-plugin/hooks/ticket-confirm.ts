import type { EngineInterface } from 'claude-code';
import { atb, errorText, loadSprint, loadTicket } from './cli';
import { hex, type Ctx } from './kit';
import { store } from './store';

/** The developer's confirmation of a Jira move: the only tracker write that the pane makes. */
export function ticketConfirm(
  $: EngineInterface,
  ctx: Ctx,
  move: NonNullable<typeof store.confirmMove>
) {
  const { Box, Text, Button } = ctx.els;

  return Box({
    key: 'confirm',
    flexDirection: 'column',
    rowGap: 'xs',
    borderStyle: 'round',
    borderColor: hex('amber'),
    paddingX: 1,
    children: [
      Text({
        wrap: 'wrap',
        children: [
          `Move ${move.key} from ${move.from ?? '?'} to ${move.to} in Jira? Only the status changes.`
        ]
      }),
      Box({
        key: 'b',
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({
            key: 'confirm-move',
            label: 'Move to ' + move.to,
            variant: 'primary',
            onPress: async () => {
              store.confirmMove = null;
              try {
                await atb($, ['move', move.key, move.to, '--approved']);
                $.ui.toast(move.key + ' moved to ' + move.to + ' in Jira');
              } catch (err) {
                $.ui.toast(move.key + ': Jira status not changed. ' + errorText(err));
              }
              await loadTicket($, move.key);
              void loadSprint($);
            }
          }),
          Button({
            key: 'cancel-move',
            label: 'Cancel',
            onPress: () => {
              store.confirmMove = null;
              ctx.redraw();
            }
          })
        ]
      })
    ]
  });
}
