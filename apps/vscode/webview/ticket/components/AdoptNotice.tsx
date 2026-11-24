import { mdiSourceBranch } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { PALETTE } from '@agent-ticket-board/core/look';
import { pill } from '../../shared/utils/surfaces';
import { send } from '../../shared/utils/vscodeApi';

type Props = { ticketKey: string; offer: NonNullable<Detail['adopt']>; theme: Theme };

export function AdoptNotice({ ticketKey, offer, theme }: Props) {
  return (
    <section
      aria-label="Work found on this machine"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-[12.5px]"
      style={pill('blue', theme)}
    >
      <Icon path={mdiSourceBranch} size={16} className="shrink-0" />
      <p className="m-0 min-w-0 flex-1 text-soft">
        <strong className="font-medium text-ink/90">Work found on this machine.</strong>{' '}
        {offer.text} Proposed stage: {offer.stageLabel}.
      </p>
      <div className="flex gap-2">
        <Button onPress={() => send({ type: 'ignoreLocal', key: ticketKey })}>Ignore</Button>
        <Button
          variant="primary"
          tone={PALETTE.blue.hex}
          onPress={() => send({ type: 'adopt', key: ticketKey, stage: offer.stage })}
        >
          Adopt as {offer.stageLabel}
        </Button>
      </div>
    </section>
  );
}
