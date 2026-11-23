import { clamp } from 'lodash-es';
import { useState, type KeyboardEvent } from 'react';
import { cx } from '../../shared/utils/cx';

type Props = {
  width: number;
  setWidth: (w: number) => void;
  min?: number;
  max?: number;
};

export function Splitter({ width, setWidth, min = 240, max = 600 }: Props) {
  const [drag, setDrag] = useState(false);
  const fit = (w: number) => clamp(Math.round(w), min, max);
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    const next: Record<string, number> = {
      ArrowLeft: fit(width - step),
      ArrowRight: fit(width + step),
      Home: min,
      End: max
    };
    if (e.key in next) {
      e.preventDefault();
      setWidth(next[e.key]);
    }
  };

  return (
    <div className="relative z-10 w-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize ticket queue"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        className="group absolute inset-y-0 -left-1 w-2 cursor-col-resize outline-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(true);
        }}
        onPointerMove={(e) => {
          if (drag) {
            setWidth(fit(e.clientX));
          }
        }}
        onPointerUp={() => setDrag(false)}
        onDoubleClick={() => setWidth(360)}
        onKeyDown={onKeyDown}
      >
        <span
          className={cx(
            'absolute inset-y-0 left-[3.5px] w-px bg-ink/[0.07] transition-colors group-hover:bg-ink/30 group-focus-visible:bg-ink/50',
            drag && 'bg-ink/50'
          )}
        />
      </div>
    </div>
  );
}
