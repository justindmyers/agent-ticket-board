import type { Agent } from '../types/host';
import type { Accent, Theme } from '../types/theme';
import { cx } from '../utils/cx';
import { orb } from '../utils/surfaces';

type Props = { agent: Agent | null; accent: Accent; theme: Theme; className?: string };

export function Orb({ agent, accent, theme, className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'size-2.5 rounded-full',
        !agent && 'opacity-50',
        agent?.kind === 'running' && 'animate-breathe motion-reduce:animate-none',
        className
      )}
      style={orb(accent, theme)}
    />
  );
}
