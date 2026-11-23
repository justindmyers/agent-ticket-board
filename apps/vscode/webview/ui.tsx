import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';
import type { CSSProperties, ReactNode } from 'react';
import { iconGlow, type Accent, type Theme } from './surfaces';

export const cx = (...c: (string | false | null | undefined)[]) =>
  twMerge(c.filter(Boolean).join(' '));

/** Material Design icon from an @mdi/js path. */
export const Icon = ({
  path,
  size = 16,
  className,
  style,
  label
}: {
  path: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) => (
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

const RING =
  'focus-visible:ring-2 focus-visible:ring-ink/40 hc:focus-visible:ring-[var(--vscode-focusBorder)]';
// Hover styles use data-hovered, which react-aria never sets on a disabled button.
const VARIANTS = {
  /** The one main action: tinted with the accent of the panel it sits in (pass `tone`). */
  primary:
    'font-medium text-ink data-hovered:brightness-125 hc:border-[var(--vscode-contrastActiveBorder)]',
  default: 'bg-ink/[0.04] text-soft border-ink/10 data-hovered:bg-ink/[0.08] data-hovered:text-ink',
  ghost:
    'bg-transparent text-muted border-transparent data-hovered:bg-ink/[0.06] data-hovered:text-ink'
};

export function Button({
  variant = 'default',
  tone,
  className,
  style,
  ...p
}: ButtonProps & {
  variant?: keyof typeof VARIANTS;
  tone?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const toneStyle: CSSProperties | undefined =
    variant === 'primary' && tone && !document.body.classList.contains('vscode-high-contrast')
      ? {
          background: `linear-gradient(120deg, ${tone}40, ${tone}1f)`,
          borderColor: `${tone}aa`,
          boxShadow: `0 0 16px ${tone}33, inset 0 1px 0 ${tone}40`
        }
      : variant === 'primary'
        ? {
            background: 'color-mix(in srgb, var(--atb-ink) 12%, transparent)',
            borderColor: 'color-mix(in srgb, var(--atb-ink) 30%, transparent)'
          }
        : undefined;
  return (
    <AriaButton
      {...p}
      style={{ ...toneStyle, ...style }}
      className={cx(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] whitespace-nowrap transition-[background,filter,color] duration-200 outline-none',
        'data-disabled:cursor-default data-disabled:opacity-40',
        RING,
        VARIANTS[variant],
        className
      )}
    />
  );
}

export const Kbd = ({ children, className }: { children: string; className?: string }) => (
  <kbd
    aria-hidden="true"
    className={cx(
      'inline-grid min-w-4 place-items-center rounded-[4px] border border-current/25 bg-transparent px-1 font-sans text-[10px] leading-4 font-medium text-current/70 shadow-none',
      className
    )}
  >
    {children}
  </kbd>
);

/** A section inside a panel: icon with a soft glow, title, caption, body. */
export function Section({
  icon,
  title,
  caption,
  aside,
  accent,
  theme,
  children,
  className
}: {
  icon: string;
  title: string;
  caption?: ReactNode;
  aside?: ReactNode;
  accent: Accent;
  theme: Theme;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cx(
        'min-w-0 rounded-xl border border-ink/[0.07] bg-ink/[0.025] p-3 hc:border-[var(--vscode-contrastBorder)] light:bg-base light:shadow-[0_1px_2px_rgb(12_29_73/0.06)]',
        className
      )}
    >
      <header className="mb-2 flex items-start gap-2.5 px-1">
        <Icon path={icon} size={18} className="mt-0.5" style={iconGlow(accent, theme)} />
        <span className="flex min-w-0 flex-1 flex-col">
          <h3 className="m-0 text-sm font-semibold text-ink/95">{title}</h3>
          {caption && <span className="text-xs text-muted">{caption}</span>}
        </span>
        {aside && <span className="shrink-0 pt-0.5 text-xs text-muted tabular-nums">{aside}</span>}
      </header>
      <div className="flex flex-col gap-0.5 px-1">{children}</div>
    </section>
  );
}

/** Small uppercase group label with a dot, as the product's "WITHIN …" headings. */
export const GroupLabel = ({
  children,
  count,
  color
}: {
  children: ReactNode;
  count?: number;
  color?: string;
}) => (
  <div className="flex items-center gap-2 py-1.5 text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
    {color && (
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: color }} />
    )}
    <span className="min-w-0 flex-1">{children}</span>
    {count !== undefined && <span className="tabular-nums">{count}</span>}
  </div>
);

export const ago = (iso?: string | null) => {
  if (!iso) {
    return '';
  }
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1
    ? 'just now'
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.round(m / 60)}h ago`
        : `${Math.round(m / 1440)}d ago`;
};
