import type { EngineInterface, RenderElement } from 'claude-code';
import { atb, errorText, loadSprint, loadTicket } from './cli';
import { hex, kit, type Ctx } from './kit';
import { store } from './store';

async function showTimeline($: EngineInterface, ctx: Ctx, key: string) {
  if (store.audit?.key === key) {
    store.audit = null;
    ctx.redraw();
    return;
  }
  try {
    const r = await atb<{ text: string; total: number }>($, ['audit', key, '--json', '--tail=40']);
    store.audit = { key, text: r.total ? r.text : 'The audit log is empty.' };
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
  }
  ctx.redraw();
}

async function makeBundle($: EngineInterface, key: string) {
  try {
    const { file } = await atb<{ file: string }>($, ['audit', key, '--bundle']);
    $.ui.toast(`${key}: debug bundle made, tokens removed: ${file}`);
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
  }
}

/** The audit buttons of a ticket, and the last events when the developer opens them. */
export function ticketAudit($: EngineInterface, ctx: Ctx, key: string): RenderElement[] {
  const { Box, Button, Text } = ctx.els;
  const { dim } = kit(ctx);
  const open = store.audit?.key === key;
  return [
    Box({
      key: 'audit',
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({
          key: 'audit-log',
          label: open ? 'Hide audit log' : 'Audit log',
          plain: true,
          onPress: () => void showTimeline($, ctx, key)
        }),
        Button({
          key: 'audit-bundle',
          label: 'Debug bundle',
          plain: true,
          onPress: () => void makeBundle($, key)
        }),
        Button({
          key: 'start-over',
          label: 'Start over',
          plain: true,
          onPress: () => {
            store.confirmRestart = store.confirmRestart === key ? null : key;
            ctx.redraw();
          }
        })
      ]
    }),
    ...(store.confirmRestart === key ? confirmRestart($, ctx, key) : []),
    ...(open
      ? [
          dim('The last 40 events. All of them: atb audit ' + key),
          Text({ wrap: 'wrap', children: [store.audit!.text] })
        ]
      : [])
  ];
}

/** The developer's confirmation of "Start over": it removes the worktree and the branch of the ticket. */
function confirmRestart($: EngineInterface, ctx: Ctx, key: string): RenderElement[] {
  const { Box, Button, Text } = ctx.els;
  return [
    Box({
      key: 'confirm-restart',
      flexDirection: 'column',
      rowGap: 'xs',
      borderStyle: 'round',
      borderColor: hex('amber'),
      paddingX: 1,
      children: [
        Text({
          wrap: 'wrap',
          children: [
            `Start ${key} over? The uncommitted work is saved as a patch in the ticket archive. The worktree and its branch are removed. The ticket returns to Planning with the lessons of this build.`
          ]
        }),
        Box({
          key: 'confirm-restart-buttons',
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Button({
              key: 'restart-yes',
              label: 'Start over',
              variant: 'primary',
              onPress: async () => {
                store.confirmRestart = null;
                try {
                  await atb($, ['restart', key, '--yes'], 120000);
                  $.ui.toast(`${key} started over`);
                } catch (e) {
                  $.ui.toast(`${key}: ${errorText(e)}`);
                }
                await loadTicket($, key);
                void loadSprint($);
              }
            }),
            Button({
              key: 'restart-no',
              label: 'Cancel',
              onPress: () => {
                store.confirmRestart = null;
                ctx.redraw();
              }
            })
          ]
        })
      ]
    })
  ];
}
