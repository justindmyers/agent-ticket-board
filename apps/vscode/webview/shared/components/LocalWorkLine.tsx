import { mdiSourceBranch } from '@mdi/js';
import type { LocalWork } from '../types/host';
import { cx } from '../utils/cx';
import { Icon } from './Icon';

type Props = { local: LocalWork; className?: string };

export function LocalWorkLine({ local, className }: Props) {
  return (
    <span className={cx('flex min-w-0 items-center gap-1 text-[11.5px] text-muted', className)}>
      <Icon path={mdiSourceBranch} size={13} className="shrink-0" />
      <span className="truncate">{local.label}</span>
    </span>
  );
}
