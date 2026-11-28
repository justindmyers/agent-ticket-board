import type { EngineInterface, RenderElement } from 'claude-code';
import { kit, type Ctx } from './kit';
import { STAGES } from './look.gen';
import { stageDevelopment } from './stage-development';
import { stagePlanning } from './stage-planning';
import { stageReview } from './stage-review';
import { stageShip } from './stage-ship';
import { stageTesting } from './stage-testing';
import { ticketPlace } from './ticket-header';
import type { Detail } from './types';

/** The body of the open stage tab. A later stage says what it waits for. */
export function ticketBody($: EngineInterface, ctx: Ctx, d: Detail): RenderElement[] {
  const { dim } = kit(ctx);
  const f = d.flow;
  const { si, tab, ti } = ticketPlace(d);
  if (tab === 'planning') {
    return stagePlanning($, ctx, d);
  }
  if (!f || ti > si) {
    const later = STAGES[ti]?.label ?? '';
    const before = STAGES[ti - 1]?.label.toLowerCase() ?? '';
    return [dim(later + ' starts after ' + before + '.')];
  }
  if (tab === 'development') {
    return stageDevelopment($, ctx, f);
  }
  if (tab === 'testing') {
    return stageTesting($, ctx, f);
  }
  if (tab === 'code-review') {
    return stageReview($, ctx, f);
  }
  return stageShip($, ctx, f);
}
