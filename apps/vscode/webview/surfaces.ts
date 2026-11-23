// Surfaces of the look: glass panels tinted by an accent, accent tiles, orbs and pills.
// Every colour is an accent from the stage palette; the helpers return inline styles because
// the accent is data (it changes with the stage), as Tailwind classes cannot be built at runtime.
import { useEffect, useState, type CSSProperties } from 'react';

export type Theme = 'dark' | 'light' | 'hc';
const read = (): Theme => {
  const c = document.body.classList;
  return c.contains('vscode-high-contrast') || c.contains('vscode-high-contrast-light')
    ? 'hc'
    : c.contains('vscode-light')
      ? 'light'
      : 'dark';
};
export function useTheme() {
  const [t, setT] = useState<Theme>(read);
  useEffect(() => {
    const o = new MutationObserver(() => setT(read()));
    o.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => o.disconnect();
  }, []);
  return t;
}

/** Stage palette. `text` is the light-theme text shade (4.5:1 on white). */
export const PALETTE = {
  blue: { hex: '#3A86FE', text: '#1d5fd1' },
  aqua: { hex: '#64E4ED', text: '#0b6f78' },
  amber: { hex: '#FFBE0C', text: '#7d5700' },
  green: { hex: '#1EC46E', text: '#13804a' },
  violet: { hex: '#A78BFA', text: '#6d28d9' },
  red: { hex: '#FA4045', text: '#c8262b' },
  neutral: { hex: '#96969D', text: '#55555c' }
} as const;
export type Accent = keyof typeof PALETTE;

/** Accent as text, readable in the current theme. */
export const ink = (a: Accent, t: Theme): string | undefined =>
  t === 'hc' ? undefined : t === 'light' ? PALETTE[a].text : PALETTE[a].hex;
const hx = (a: Accent) => PALETTE[a].hex;

/** The big glass panel (the ticket header). `loud` when the ticket waits for you. */
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

/** A row or chip with a horizontal accent wash (queue rows, nav pills). */
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

/** The square icon tile (radial accent, thin accent border, soft glow). */
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

/** A small glowing sphere (status of a queue row). */
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

/** Glow on an icon in a section header. */
export const iconGlow = (a: Accent, t: Theme): CSSProperties =>
  t === 'hc'
    ? {}
    : { color: ink(a, t), filter: t === 'dark' ? `drop-shadow(0 0 6px ${hx(a)})` : undefined };

/** A small tinted pill ("Average", status words). */
export const pill = (a: Accent, t: Theme): CSSProperties =>
  t === 'hc'
    ? {}
    : {
        color: ink(a, t),
        borderColor: `${hx(a)}55`,
        background: `${hx(a)}${t === 'light' ? '1a' : '14'}`
      };
