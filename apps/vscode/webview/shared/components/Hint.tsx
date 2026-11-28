import type { ReactNode } from 'react';
import { Tooltip } from 'react-aria-components';

/** The tooltip of a button: what pressing it runs. It shows on hover and on keyboard focus. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <Tooltip
      offset={6}
      className="z-50 max-w-[340px] rounded-lg border border-[var(--vscode-editorHoverWidget-border,rgba(128,128,128,0.4))] bg-[var(--vscode-editorHoverWidget-background,#252526)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--vscode-editorHoverWidget-foreground,#cccccc)] shadow-lg"
    >
      {children}
    </Tooltip>
  );
}
