import type { EngineInterface } from 'claude-code';
import { runLocalWork } from './cli';
import { hex, type Ctx } from './kit';
import type { Detail } from './types';

/** Local work that the board does not own yet: "Adopt as <stage>" or "Ignore". */
export function ticketAdopt(
  $: EngineInterface,
  ctx: Ctx,
  key: string,
  offer: NonNullable<Detail['adopt']>
) {
  const { Box, Text, Button } = ctx.els;

  return Box({
    key: 'adopt',
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: hex('blue'),
    paddingX: 1,
    children: [
      Text({
        wrap: 'wrap',
        children: [`Work found on this machine. ${offer.text} Proposed stage: ${offer.stageLabel}.`]
      }),
      Box({
        key: 'adopt-b',
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({
            key: 'adopt-yes',
            label: 'Adopt as ' + offer.stageLabel,
            variant: 'primary',
            onPress: () => void runLocalWork($, key, ['adopt', key, '--stage=' + offer.stage])
          }),
          Button({
            key: 'adopt-ignore',
            label: 'Ignore',
            onPress: () => void runLocalWork($, key, ['ignore', key])
          })
        ]
      })
    ]
  });
}
