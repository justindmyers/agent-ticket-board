import type { EngineInterface, RenderElement } from 'claude-code';
import { atb, errorText } from './cli';
import { kit, type Ctx } from './kit';
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
        })
      ]
    }),
    ...(open
      ? [
          dim('The last 40 events. All of them: atb audit ' + key),
          Text({ wrap: 'wrap', children: [store.audit!.text] })
        ]
      : [])
  ];
}
