import type { ReactNode } from 'react';

type Props = { k: string; v?: ReactNode };

export function RailItem({ k, v }: Props) {
  if (!v) {
    return null;
  }

  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="m-0 [overflow-wrap:anywhere] text-soft">{v}</dd>
    </>
  );
}
