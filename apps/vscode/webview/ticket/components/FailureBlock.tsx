import type { Evidence } from '../../shared/types/host';

type Props = { ev: Evidence };

const LINES = [
  ['Expected', 'expected'],
  ['Found', 'found'],
  ['Tried', 'note']
] as const;

/** Why a requirement does not pass: what should be true, what the test found, and what was tried. */
export function FailureBlock({ ev }: Props) {
  const lines = LINES.filter(([, key]) => ev[key]);
  if (!lines.length) {
    return null;
  }

  return (
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs">
      {lines.map(([label, key]) => (
        <div key={key} className="contents">
          <dt className="font-medium text-red-300">{label}</dt>
          <dd className="text-soft">{ev[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
