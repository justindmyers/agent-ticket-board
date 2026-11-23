import type { HostMsg } from '../types/host';
import { useWindowEvent } from './useWindowEvent';

export function useHostMessages(on: (m: HostMsg) => void) {
  useWindowEvent('message', (e) => on(e.data as HostMsg));
}
