import { Button } from '../../shared/components/Button';
import { Kbd } from '../../shared/components/Kbd';
import type { Need } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { focusDraft } from '../../shared/utils/focus';
import { PALETTE } from '@agent-ticket-board/core/look';
import { ink } from '../../shared/utils/surfaces';
import type { Act } from '../types/ticket';

type Props = { need: Need; act: Act; theme: Theme };

export function NeedBanner({ need, act, theme }: Props) {
  const problem = need.kind === 'problem';
  const label = problem
    ? 'Problem'
    : need.from === 'sync'
      ? 'Out of sync with Jira'
      : 'Agent needs you';

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5"
      aria-live="polite"
      style={
        problem
          ? { borderColor: `${PALETTE.red.hex}55`, background: `${PALETTE.red.hex}14` }
          : { borderColor: 'var(--atb-agent-ring)', background: 'var(--atb-agent-bg)' }
      }
    >
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-px text-[11px] font-medium"
          style={
            problem
              ? { color: ink('red', theme), borderColor: `${PALETTE.red.hex}66` }
              : { color: 'var(--atb-agent)', borderColor: 'var(--atb-agent-ring)' }
          }
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {label}
        </span>
        <span className="text-[13px] text-ink/90">{need.ask}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {need.actions.map((a, i) => (
          <Button
            key={a.id}
            variant={i === 0 ? 'primary' : 'default'}
            tone={problem ? PALETTE.red.hex : PALETTE.violet.hex}
            onPress={() => (a.id === 'comment' ? focusDraft() : act(a.id))}
          >
            {a.label}
            {i === 0 && <Kbd>A</Kbd>}
          </Button>
        ))}
      </div>
    </div>
  );
}
