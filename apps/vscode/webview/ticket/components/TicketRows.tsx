import type { ReactNode } from 'react';

export function TicketRows({ children }: { children: ReactNode }) {
  return <ul className="m-0 list-none p-0">{children}</ul>;
}
