import type { EngineInterface, RenderElement } from 'claude-code';
import { agentRun } from './cli';
import { hex, kit, type Ctx } from './kit';
import { runActive, runText } from './look.gen';
import { pulse } from './pulse';
import type { Flow } from './types';

/** A queued or running agent run of one stage: a pulsing box with Stop. */
export function runBox(
  $: EngineInterface,
  ctx: Ctx,
  key: string,
  f: Flow | null,
  stage: 'planning' | 'development' | 'testing'
): RenderElement[] {
  if (!f?.run || f.run.stage !== stage || !runActive(f)) {
    return [];
  }
  const { Box, Button, Text } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const queued = f.run.state === 'queued';
  const { title, caption: text, accent } = runText(f.run);
  const color = hex(accent);
  return [
    Box({
      key: 'run',
      flexDirection: 'column',
      paddingX: 1,
      borderStyle: 'round',
      borderColor: queued ? color : pulse(color),
      children: [
        Box({
          key: 'run-head',
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Box({ key: 'run-title', flexGrow: 1, children: [sectionTitle('run-t', title, color)] }),
            Button({ key: 'stop-run', label: 'Stop', onPress: () => void agentRun($, key, 'stop') })
          ]
        }),
        dim(text),
        ...(f.run.activity && f.run.state === 'running' && !f.run.waiting
          ? [Text({ wrap: 'truncate', children: ['Now: ' + f.run.activity] })]
          : [])
      ]
    })
  ];
}
