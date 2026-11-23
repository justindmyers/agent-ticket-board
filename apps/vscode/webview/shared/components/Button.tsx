import type { CSSProperties } from 'react';
import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import { FOCUS_RING_CLASS } from '../utils/classes';
import { cx } from '../utils/cx';

// Hover styles use data-hovered, which react-aria never sets on a disabled button.
const VARIANTS = {
  primary:
    'font-medium text-ink data-hovered:brightness-125 hc:border-[var(--vscode-contrastActiveBorder)]',
  default: 'bg-ink/[0.04] text-soft border-ink/10 data-hovered:bg-ink/[0.08] data-hovered:text-ink',
  ghost:
    'bg-transparent text-muted border-transparent data-hovered:bg-ink/[0.06] data-hovered:text-ink'
};

type Props = ButtonProps & {
  variant?: keyof typeof VARIANTS;
  tone?: string;
  className?: string;
  style?: CSSProperties;
};

const toneStyle = (variant: Props['variant'], tone?: string): CSSProperties | undefined => {
  if (variant !== 'primary') {
    return undefined;
  }
  if (tone && !document.body.classList.contains('vscode-high-contrast')) {
    return {
      background: `linear-gradient(120deg, ${tone}40, ${tone}1f)`,
      borderColor: `${tone}aa`,
      boxShadow: `0 0 16px ${tone}33, inset 0 1px 0 ${tone}40`
    };
  }
  return {
    background: 'color-mix(in srgb, var(--atb-ink) 12%, transparent)',
    borderColor: 'color-mix(in srgb, var(--atb-ink) 30%, transparent)'
  };
};

export function Button({ variant = 'default', tone, className, style, ...p }: Props) {
  return (
    <AriaButton
      {...p}
      style={{ ...toneStyle(variant, tone), ...style }}
      className={cx(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] whitespace-nowrap transition-[background,filter,color] duration-200 outline-none',
        'data-disabled:cursor-default data-disabled:opacity-40',
        FOCUS_RING_CLASS,
        VARIANTS[variant],
        className
      )}
    />
  );
}
