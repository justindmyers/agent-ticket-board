import type { RenderElement } from 'claude-code';
import { writesText } from './look.gen';
import { hex, kit, type Ctx } from './kit';
import type { Flow } from './types';

/** The writes to the backend that Testing may make. Moving the ticket to Testing approves them. */
export function writeRows(
  ctx: Ctx,
  f: Flow | null | undefined,
  stage: 'planning' | 'testing'
): RenderElement[] {
  if (!f?.requirements) {
    return [];
  }
  const list = f.writes ?? [];
  const { Text } = ctx.els;
  const { sectionTitle, dim } = kit(ctx);
  return [
    sectionTitle(`writes-${stage}`, 'Writes to the backend', hex('red'), String(list.length)),
    dim(writesText(stage, list.length)),
    ...list.map((w) => Text({ wrap: 'wrap', children: [`${w.method} ${w.path}  ·  ${w.why}`] }))
  ];
}
