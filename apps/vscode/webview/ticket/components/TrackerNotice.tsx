import { mdiCheckCircleOutline, mdiInformationOutline } from '@mdi/js';
import { Icon } from '../../shared/components/Icon';
import type { Detail } from '../../shared/types/host';
import type { Theme } from '../../shared/types/theme';
import { pill } from '../../shared/utils/surfaces';

type Props = { tracker: NonNullable<Detail['tracker']>; theme: Theme };

export function TrackerNotice({ tracker, theme }: Props) {
  if (!tracker.notice) {
    return null;
  }
  const done = tracker.state === 'done';
  const blocked = tracker.state === 'blocked';

  return (
    <p
      className="m-0 flex items-start gap-2 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] text-soft"
      style={done ? pill('green', theme) : blocked ? pill('red', theme) : undefined}
    >
      <Icon
        path={done ? mdiCheckCircleOutline : mdiInformationOutline}
        size={16}
        className="mt-px"
      />
      <span>{tracker.notice}</span>
    </p>
  );
}
