import { mdiCheckCircleOutline } from '@mdi/js';
import { Icon } from '../../shared/components/Icon';
import type { Theme } from '../../shared/types/theme';
import { pill } from '../../shared/utils/surfaces';

type Props = { text: string; theme: Theme };

export function FinishedNotice({ text, theme }: Props) {
  return (
    <p
      className="m-0 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
      style={pill('green', theme)}
    >
      <Icon path={mdiCheckCircleOutline} size={16} className="mt-px" />
      <span>
        <span className="font-medium">Finished.</span> {text} The board updated this ticket&apos;s
        local record to match.
      </span>
    </p>
  );
}
