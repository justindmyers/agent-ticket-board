import { mdiCheckCircleOutline } from '@mdi/js';
import { Icon } from '../../shared/components/Icon';
import type { Theme } from '../../shared/types/theme';
import { PALETTE } from '@agent-ticket-board/core/look';
import type { STAGES } from '../../shared/utils/stages';
import { ink } from '../../shared/utils/surfaces';

type Props = { stage: (typeof STAGES)[number]; state: 'done' | 'current' | 'todo'; theme: Theme };

const SR_STATE = { done: ', done', current: ', current stage', todo: '' };

export function StageTabContent({ stage, state, theme }: Props) {
  const hex = PALETTE[stage.accent].hex;

  return (
    <>
      {state === 'done' && (
        <Icon path={mdiCheckCircleOutline} size={14} style={{ color: ink('green', theme) }} />
      )}
      {state === 'current' && (
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{
            background: hex,
            boxShadow: theme === 'dark' ? `0 0 8px ${hex}` : undefined
          }}
        />
      )}
      {state === 'todo' && <Icon path={stage.icon} size={14} className="opacity-70" />}
      {stage.label}
      <span className="sr-only">{SR_STATE[state]}</span>
    </>
  );
}
