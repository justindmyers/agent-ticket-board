import type { ReactNode } from 'react';
import type { Accent, Theme } from '../types/theme';
import { cx } from '../utils/cx';
import { iconGlow, runColor } from '../utils/surfaces';
import { Icon } from './Icon';

type Props = {
  icon: string;
  title: string;
  caption?: ReactNode;
  aside?: ReactNode;
  accent: Accent;
  theme: Theme;
  children?: ReactNode;
  className?: string;
  /** An agent runs for this section: its border shows a travelling light in the accent. */
  running?: boolean;
};

export function Section({
  icon,
  title,
  caption,
  aside,
  accent,
  theme,
  children,
  className,
  running
}: Props) {
  return (
    <section
      aria-label={title}
      className={cx(
        'min-w-0 rounded-xl border border-ink/[0.07] bg-ink/[0.025] p-3 hc:border-[var(--vscode-contrastBorder)] light:bg-base light:shadow-[0_1px_2px_rgb(12_29_73/0.06)]',
        running && 'run-border',
        className
      )}
      style={running ? runColor(accent, theme) : undefined}
    >
      <header className="flex items-start gap-2.5 px-1">
        <Icon path={icon} size={18} className="mt-0.5" style={iconGlow(accent, theme)} />
        <span className="flex min-w-0 flex-1 flex-col">
          <h3 className="m-0 text-sm font-semibold text-ink/95">{title}</h3>
          {caption && <span className="text-xs text-muted">{caption}</span>}
        </span>
        {aside && <span className="shrink-0 pt-0.5 text-xs text-muted tabular-nums">{aside}</span>}
      </header>
      {children && <div className="mt-2 flex flex-col gap-0.5 px-1">{children}</div>}
    </section>
  );
}
