import type { EngineInterface, RenderElement } from 'claude-code';
import { agentRun } from './cli';
import { hex, kit, type Ctx } from './kit';
import { runActive } from './look.gen';
import { pulse } from './pulse';
import type { Flow } from './types';

/** A queued or running agent run of one stage: a pulsing box with Stop. */
export function runBox(
  $: EngineInterface,
  ctx: Ctx,
  key: string,
  f: Flow | null,
  stage: 'planning' | 'development'
): RenderElement[] {
  if (!f?.run || f.run.stage !== stage || !runActive(f)) {
    return [];
  }
  const { Box, Button } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const queued = f.run.state === 'queued';
  const color = hex(stage === 'development' ? 'aqua' : 'blue');
  const title = queued ? 'Queued' : stage === 'development' ? 'Building now' : 'Planning now';
  const text = queued
    ? 'Every agent slot is busy. The run starts when one is free.'
    : stage === 'development'
      ? `The agent changes code in the ticket's worktree with ${f.run.model}. It does not commit or push.`
      : `The agent reads the ticket and the code with ${f.run.model}. It changes no files.`;
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
        dim(text)
      ]
    })
  ];
}
