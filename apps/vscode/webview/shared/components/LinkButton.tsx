import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import { cx } from '../utils/cx';

type Props = ButtonProps & { className?: string };

export function LinkButton({ className, ...p }: Props) {
  return (
    <AriaButton
      {...p}
      className={cx(
        'cursor-pointer text-left outline-none data-focus-visible:rounded data-focus-visible:ring-2 data-focus-visible:ring-ink/40',
        className
      )}
    />
  );
}
