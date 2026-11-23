import { cx } from '../utils/cx';

type Props = { color: string; className?: string };

export function Dot({ color, className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cx('size-1.5 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  );
}
