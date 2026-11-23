import type { ReactNode } from 'react';

export function RailList({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[78px_minmax(0,1fr)] gap-x-3 gap-y-2 pt-1 text-[12px]">
      {children}
    </dl>
  );
}
