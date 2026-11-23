import type { Theme } from '../types/theme';
import { Bullet } from './Bullet';

type Props = { count: number; theme: Theme };

export function NeedsYouCount({ count, theme }: Props) {
  if (count === 0) {
    return null;
  }

  return (
    <>
      <Bullet />
      <span>
        <span
          className="font-medium tabular-nums"
          style={{ color: theme === 'hc' ? undefined : 'var(--atb-agent)' }}
        >
          {count}
        </span>{' '}
        need you
      </span>
    </>
  );
}
