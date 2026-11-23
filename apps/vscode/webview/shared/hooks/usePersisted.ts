import { useEffect, useState } from 'react';
import { vscodeApi } from '../utils/vscodeApi';

export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(
    () => ((vscodeApi.getState() ?? {})[key] as T | undefined) ?? initial
  );
  useEffect(() => {
    vscodeApi.setState({ ...(vscodeApi.getState() ?? {}), [key]: v });
  }, [key, v]);
  return [v, setV];
}
