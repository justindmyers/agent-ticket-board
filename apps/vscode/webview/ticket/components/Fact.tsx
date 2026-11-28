import type { ReactNode } from 'react';

type Props = { label: string; children: ReactNode };

/** One fact of a step, as a small card: a label above its value. */
export function Fact({ label, children }: Props) {
  return (
    <div className="rounded-lg border border-ink/[0.07] bg-ink/[0.025] px-2.5 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[13px] text-ink/90">{children}</div>
    </div>
  );
}
