import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../shared/components/Button';
import { COLLAPSE_SECONDS, EASE } from '../../shared/utils/motion';
import { PALETTE } from '@agent-ticket-board/core/look';

type Props = { count: number; onSave: () => void; onDiscard: () => void };

export function SaveBar({ count, onSave, onDiscard }: Props) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: reduce ? 0 : COLLAPSE_SECONDS, ease: EASE }}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
