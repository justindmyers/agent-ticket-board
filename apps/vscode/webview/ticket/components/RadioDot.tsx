import { cx } from '../../shared/utils/cx';

/** The radio dot: filled when selected, so the choice does not rely on the border alone. */
export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'mt-[3px] grid size-3.5 shrink-0 place-items-center rounded-full border',
        selected ? 'border-ink/70' : 'border-ink/30'
      )}
    >
      {selected && <span className="size-1.5 rounded-full bg-ink" />}
    </span>
  );
}
