import type { ReactNode } from 'react';
import type { Accent, Theme } from '../types/theme';
import { pill } from '../utils/surfaces';

type Props = { accent: Accent; theme: Theme; children: ReactNode };

export function Pill({ accent, theme, children }: Props) {
  return (
    <span
      className="inline-flex items-center rounded-md border border-ink/15 px-1.5 py-px text-[11px] whitespace-nowrap"
      style={pill(accent, theme)}
    >
      {children}
    </span>
  );
}
