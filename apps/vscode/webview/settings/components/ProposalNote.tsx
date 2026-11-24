import { mdiCheck } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { Pill } from '../../shared/components/Pill';
import type { Theme } from '../../shared/types/theme';
import type { SettingsField } from '../../shared/types/settings';
import { CONFIDENCE_ACCENT } from '../utils/sections';

type Props = {
  proposal: NonNullable<SettingsField['proposal']>;
  label: string;
  current: string;
  onUse: () => void;
  theme: Theme;
};

export function ProposalNote({ proposal, label, current, onUse, theme }: Props) {
  if (proposal.same || proposal.text === current) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <Icon path={mdiCheck} size={13} />
        Same as the detected value
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
      <span>Detected:</span>
      <span className="font-mono text-[11.5px] [overflow-wrap:anywhere] text-soft">
        {proposal.text || '(empty)'}
      </span>
      <Pill accent={CONFIDENCE_ACCENT[proposal.confidence]} theme={theme}>
        {proposal.confidence} confidence
      </Pill>
      <span className="[overflow-wrap:anywhere]">from {proposal.source}</span>
      <Button
        variant="ghost"
        className="h-6 px-2 text-[11.5px]"
        aria-label={`Use the detected ${label}`}
        onPress={onUse}
      >
        Use
      </Button>
    </div>
  );
}
