import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
import { useId, type ReactNode } from 'react';
import { usePersisted } from '../hooks/usePersisted';
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
  // A section with content can be collapsed. The choice is remembered for each section title.
  const bodyId = useId();
  const [collapsed, setCollapsed] = usePersisted<boolean>(`collapsed:${title}`, false);
  const collapsible = !!children;
  const open = !collapsible || !collapsed;
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
          <h3 className="m-0 text-sm font-semibold text-ink/95">
            {collapsible ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setCollapsed(!collapsed)}
                className="m-0 flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                {title}
                <Icon
                  path={open ? mdiChevronDown : mdiChevronRight}
                  size={16}
                  className="text-muted"
                />
              </button>
            ) : (
              title
            )}
          </h3>
          {caption && <span className="text-xs text-muted">{caption}</span>}
        </span>
        {aside && <span className="shrink-0 pt-0.5 text-xs text-muted tabular-nums">{aside}</span>}
      </header>
      {children && open && (
        <div id={bodyId} className="mt-2 flex flex-col gap-0.5 px-1">
          {children}
        </div>
      )}
    </section>
  );
}
