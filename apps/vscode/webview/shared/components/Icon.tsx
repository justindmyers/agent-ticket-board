import type { CSSProperties } from 'react';
import { cx } from '../utils/cx';

type Props = {
  path: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
};

export function Icon({ path, size = 16, className, style, label }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx('shrink-0', className)}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
