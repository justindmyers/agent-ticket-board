import { useState } from 'react';
import { useWindowEvent } from '../../shared/hooks/useWindowEvent';

const NARROW = 640;

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => innerWidth < NARROW);
  useWindowEvent('resize', () => setNarrow(innerWidth < NARROW));
  return narrow;
}
