import type { EngineInterface, RenderElement } from 'claude-code';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

const stepMark = (state: string) => (state === 'done' ? '✓ ' : state === 'current' ? '● ' : '○ ');
const checkMark = (ok: boolean | null) => (ok ? '✓ ' : ok === false ? '✕ ' : '○ ');

export function stageDevelopment($: EngineInterface, ctx: Ctx, f: Flow) {
  const { Text } = ctx.els;
  const { dim, sectionTitle } = kit(ctx);
  const body: RenderElement[] = [];

  if (f.steps) {
    const done = f.steps.filter((s) => s.state === 'done').length;
    body.push(
      sectionTitle('steps', 'Steps', hex('aqua'), done + ' of ' + f.steps.length),
      ...f.steps.map((s) =>
        Text({
          dimColor: s.state === 'done',
          wrap: 'wrap',
          children: [stepMark(s.state) + s.text + (s.state === 'current' ? '   (now)' : '')]
        })
      )
    );
  }
  if (f.checks) {
    const failed = f.checks.some((c) => c.ok === false);
    body.push(
      sectionTitle('gate', 'Final gate', hex(failed ? 'red' : 'green')),
      ...f.checks.map((c) =>
        Text({
          children: [checkMark(c.ok) + c.name + (c.note ? '   ' + c.note : '')]
        })
      )
    );
  }
  if (f.review) {
    body.push(sectionTitle('rev', 'Agent review', hex('violet')), dim(f.review));
  }
  return body;
}
