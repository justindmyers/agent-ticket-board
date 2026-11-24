import { Button } from '../../shared/components/Button';
import { PALETTE } from '../../shared/utils/palette';

type Props = { count: number; onSave: () => void; onDiscard: () => void };

export function SaveBar({ count, onSave, onDiscard }: Props) {
  if (!count) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-0 z-10 -mx-5 flex items-center gap-2 border-t border-ink/10 bg-base/95 px-6 py-3 backdrop-blur-xl max-[640px]:-mx-3"
    >
      <span className="mr-auto text-[12.5px] text-soft" aria-live="polite">
        {count === 1 ? '1 unsaved change' : `${count} unsaved changes`}
      </span>
      <Button variant="ghost" onPress={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" tone={PALETTE.blue.hex} onPress={onSave}>
        Save
      </Button>
    </div>
  );
}
