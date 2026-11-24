// Accent styles are inline because the accent is data (it follows the stage),
// and Tailwind cannot build classes at runtime.
import type { CSSProperties } from 'react';
import type { Accent, Theme } from '../types/theme';
import { PALETTE } from '@agent-ticket-board/core/look';

const hx = (a: Accent) => PALETTE[a].hex;

export const ink = (a: Accent, t: Theme): string | undefined =>
  t === 'hc' ? undefined : t === 'light' ? PALETTE[a].text : PALETTE[a].hex;

export function panel(a: Accent, t: Theme, loud: boolean): CSSProperties {
  const c = hx(a);
  if (t === 'hc') {
    return {
      borderColor: 'var(--vscode-contrastBorder)',
      background: 'var(--atb-base)',
      ...(loud ? { outline: `2px solid ${ink(a, t) ?? 'var(--vscode-focusBorder)'}` } : {})
    };
  }
  if (t === 'light') {
    return {
      borderColor: `${c}${loud ? '99' : '55'}`,
      background: `linear-gradient(160deg, ${c}1f, #ffffff 42%)`,
      boxShadow: loud ? `0 0 0 1px ${c}55, 0 8px 28px ${c}33` : '0 1px 3px rgb(12 29 73 / 0.08)'
    };
  }
  return {
    borderColor: `${c}${loud ? '80' : '40'}`,
    background: `linear-gradient(160deg, ${c}${loud ? '24' : '17'}, rgba(10,11,14,0.82) 38%, rgba(10,11,14,0.86))`,
    boxShadow: loud
      ? `0 0 44px ${c}40, inset 0 1px 0 ${c}40`
      : `0 0 40px ${c}14, inset 0 1px 0 ${c}26`
  };
}

export function wash(
  a: Accent,
  t: Theme,
  state: 'rest' | 'hover' | 'open',
  loud = false
): CSSProperties {
  const c = hx(a);
  if (t === 'hc') {
    return state === 'open'
      ? { outline: '1px dashed var(--vscode-contrastActiveBorder)', outlineOffset: -1 }
      : {};
  }
  if (t === 'light') {
    return state === 'rest'
      ? {}
      : {
          background: `linear-gradient(90deg, ${c}${state === 'open' ? '26' : '14'}, transparent)`,
          borderColor: `${c}${state === 'open' ? '88' : '44'}`
        };
  }
  if (state === 'rest') {
    return {};
  }
  return {
    borderColor: `${c}${state === 'open' ? (loud ? '99' : '55') : '44'}`,
    background: `linear-gradient(90deg, ${c}${state === 'open' ? (loud ? '2e' : '1f') : '14'}, rgba(10,11,14,0.6))`,
    boxShadow:
      state === 'open'
        ? loud
          ? `0 0 24px ${c}40, inset 0 0 12px ${c}1c`
          : `inset 0 1px 0 ${c}26`
        : undefined
  };
}

export function tile(a: Accent, t: Theme, size: 'sm' | 'lg' = 'sm'): CSSProperties {
  const c = hx(a);
  if (t === 'hc') {
    return { color: 'var(--vscode-foreground)', borderColor: 'var(--vscode-contrastBorder)' };
  }
  if (t === 'light') {
    return { color: PALETTE[a].text, borderColor: `${c}88`, background: `${c}1c` };
  }
  return size === 'lg'
    ? {
        color: c,
        borderColor: `${c}66`,
        background: `radial-gradient(circle at 30% 25%, ${c}33, ${c}0d)`,
        boxShadow: `0 0 18px ${c}44, inset 0 0 10px ${c}22`
      }
    : { color: c, borderColor: `${c}55`, background: `${c}14` };
}

export function orb(a: Accent, t: Theme): CSSProperties {
  const c = hx(a);
  if (t === 'hc') {
    return { background: 'var(--vscode-foreground)' };
  }
  if (t === 'light') {
    return {
      background: `radial-gradient(circle at 35% 30%, #fff, ${c} 55%)`,
      boxShadow: `0 0 0 1px ${c}88`
    };
  }
  return {
    background: `radial-gradient(circle at 35% 30%, #ffffffcc, ${c} 45%, ${c}aa 80%)`,
    boxShadow: `0 0 8px ${c}aa, 0 0 2px ${c}`
  };
}

export const iconGlow = (a: Accent, t: Theme): CSSProperties =>
  t === 'hc'
    ? {}
    : { color: ink(a, t), filter: t === 'dark' ? `drop-shadow(0 0 6px ${hx(a)})` : undefined };

export const pill = (a: Accent, t: Theme): CSSProperties =>
  t === 'hc'
    ? {}
    : {
        color: ink(a, t),
        borderColor: `${hx(a)}55`,
        background: `${hx(a)}${t === 'light' ? '1a' : '14'}`
      };
