import type { EngineInterface } from 'claude-code';
import { accentHex, hex, kit, type Ctx } from './kit';
import { STAGES, spentText } from './look.gen';
import { store } from './store';
import { ticketAdopt } from './ticket-adopt';
import { ticketNeed } from './ticket-need';
import type { Detail } from './types';

/** Where the ticket is: the stage index, the open tab and the accent of the header. */
export function ticketPlace(d: Detail) {
  const f = d.flow;
  const si = f?.closed ? STAGES.length : f ? STAGES.findIndex((s) => s.id === f.stage) : -1;
  const stage = f?.closed ? null : si >= 0 ? STAGES[si] : null;
  const tab = store.tabs[d.ticket.key] ?? stage?.id ?? (f?.closed ? 'code-review' : 'planning');
  return { si, stage, tab, ti: STAGES.findIndex((s) => s.id === tab) };
}

export function ticketHeader($: EngineInterface, ctx: Ctx, d: Detail) {
  const { Box, Text, Button } = ctx.els;
  const { dim } = kit(ctx);
  const t = d.ticket;
  const f = d.flow;
  const need = f?.need;
  const { si, stage, tab } = ticketPlace(d);
  const doneInJira = !f && d.tracker?.state === 'done';
  const plain = f ? hex('neutral') : accentHex(null, d.tracker?.state);
  const stageColor = stage ? hex(stage.accent) : undefined;
  const accent =
    need?.kind === 'problem' ? hex('red') : f?.closed ? hex('green') : (stageColor ?? plain);
  const label = stage ? stage.label : f?.closed ? 'Finished' : (d.tracker?.label ?? 'Not started');

  return Box({
    key: 'head',
    flexDirection: 'column',
    rowGap: 'xs',
    borderStyle: 'round',
    borderColor: accent,
    paddingX: 1,
    children: [
      Box({
        key: 'crumb',
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ dimColor: true, children: [t.key + '  ›'] }),
          Text({
            color: stageColor ?? (f?.closed ? hex('green') : plain),
            children: [label]
          })
        ]
      }),
      Text({ weight: 'semibold', wrap: 'wrap', children: [t.summary] }),
      dim(
        [
          t.type,
          t.points == null ? 'Not pointed' : t.points + ' pts',
          t.priority && t.priority + ' priority',
          t.status + ' in Jira',
          spentText(f?.spent)
        ]
          .filter(Boolean)
          .join('  •  ')
      ),
      ...(!f && d.adopt ? [ticketAdopt($, ctx, t.key, d.adopt)] : []),
      ...(!f && !d.adopt && d.tracker?.notice
        ? [
            Text({
              color: doneInJira ? hex('green') : undefined,
              dimColor: !doneInJira,
              wrap: 'wrap',
              children: [d.tracker.notice]
            })
          ]
        : []),
      ...(f?.closed
        ? [
            Text({
              color: hex('green'),
              wrap: 'wrap',
              children: [
                '✓ Finished. ' +
                  f.closed.text +
                  " The board updated this ticket's local record to match."
              ]
            })
          ]
        : []),
      ...(need ? [ticketNeed($, ctx, t, need)] : []),
      Box({
        key: 'tabs',
        flexDirection: 'row',
        columnGap: 1,
        flexWrap: 'wrap',
        children: STAGES.map((s, i) =>
          Button({
            key: 'tab-' + s.id,
            variant: s.id === tab ? 'primary' : 'secondary',
            label: (i < si ? '✓ ' : i === si ? '● ' : '') + s.label,
            onPress: () => {
              store.tabs[t.key] = s.id;
              ctx.redraw();
            }
          })
        )
      })
    ]
  });
}
