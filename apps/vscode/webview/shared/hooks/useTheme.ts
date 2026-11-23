import { useEffect, useState } from 'react';
import type { Theme } from '../types/theme';

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
