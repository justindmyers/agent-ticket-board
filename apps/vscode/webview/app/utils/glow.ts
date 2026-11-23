import type { CSSProperties } from 'react';

export const ambientGlow = (hex: string): CSSProperties => ({
  background: `radial-gradient(900px 520px at 85% -10%, ${hex}1c, transparent 60%), radial-gradient(700px 500px at 0% 110%, ${hex}0f, transparent 60%)`,
  transition: 'background 600ms'
});
