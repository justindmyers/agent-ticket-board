import { useEffect, useEffectEvent } from 'react';

export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void
) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const h = (e: WindowEventMap[K]) => onEvent(e);
    window.addEventListener(type, h);
    return () => window.removeEventListener(type, h);
  }, [type]);
}
