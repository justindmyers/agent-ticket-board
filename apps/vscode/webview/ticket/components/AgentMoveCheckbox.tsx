import { mdiCheck } from '@mdi/js';
import { Checkbox } from 'react-aria-components';
import { Icon } from '../../shared/components/Icon';
import { cx } from '../../shared/utils/cx';
import { PALETTE } from '../../shared/utils/palette';
import { send } from '../../shared/utils/vscodeApi';

type Props = { ticketKey: string; allowed: boolean };

export function AgentMoveCheckbox({ ticketKey, allowed }: Props) {
  return (
    <Checkbox
      isSelected={allowed}
      onChange={(v) => send({ type: 'setAgentMove', key: ticketKey, allow: v })}
      className="group flex cursor-pointer items-start gap-2.5 rounded-lg py-1.5 text-[12.5px] text-soft outline-none"
    >
      {({ isSelected, isFocusVisible }) => (
        <>
          <span
            aria-hidden="true"
            className={cx(
              'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors',
              isSelected ? 'border-transparent' : 'border-ink/30',
              isFocusVisible && 'ring-2 ring-ink/40'
            )}
            style={isSelected ? { background: PALETTE.blue.hex, color: '#fff' } : undefined}
          >
            {isSelected && <Icon path={mdiCheck} size={12} />}
          </span>
          <span>
            <span className="text-ink/90">Let the agent update the Jira status</span>
            <span className="block text-[11px] text-muted">
              For routine tickets. Status only: never comments, fields or other tickets.
            </span>
          </span>
        </>
      )}
    </Checkbox>
  );
}
