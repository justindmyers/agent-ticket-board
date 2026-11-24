import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { COLLAPSE_SECONDS, EASE } from '../utils/motion';

type Props = { isOpen: boolean; children: ReactNode; className?: string };

/**
 * Animates height and opacity when content appears or leaves, so the layout around it does not jump.
 * The content stays mounted until the collapse ends. With reduced motion it snaps.
 */
export function Collapse({ isOpen, children, className }: Props) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : COLLAPSE_SECONDS, ease: EASE }}
          className="overflow-hidden"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
