import { cx } from '../utils/cx';

type Props = { children: string; className?: string };

export function Kbd({ children, className }: Props) {
  return (
    <kbd
      aria-hidden="true"
      className={cx(
        'inline-grid min-w-4 place-items-center rounded-[4px] border border-current/25 bg-transparent px-1 font-sans text-[10px] leading-4 font-medium text-current/70 shadow-none',
        className
      )}
    >
      {children}
    </kbd>
  );
}
