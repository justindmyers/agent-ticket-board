import type { EngineInterface } from 'claude-code';
import { kit, type Ctx } from './kit';
import { runBox } from './run-box';
import { store } from './store';
import { gateRows } from './gate-rows';
import { reviewRows } from './review-rows';
import type { Flow } from './types';

/** Code review: the reviewers' findings, what you chose for each, and the board's checks. */
export function stageReview($: EngineInterface, ctx: Ctx, f: Flow) {
  const { dim } = kit(ctx);
  const rows = [
    ...runBox($, ctx, store.open ?? '', f, 'code-review'),
    ...reviewRows($, ctx, store.open ?? '', f),
    ...(f.gate?.verify ? gateRows(ctx, f) : [])
  ];
  return rows.length ? rows : [dim('The review has not started.')];
}
