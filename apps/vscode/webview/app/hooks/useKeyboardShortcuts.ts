import { useWindowEvent } from '../../shared/hooks/useWindowEvent';
import type { Detail } from '../../shared/types/host';
import type { StageId } from '../../shared/types/stage';
import { focusDraft, focusQueueRow } from '../../shared/utils/focus';
import { STAGES } from '../../shared/utils/stages';
import { send } from '../../shared/utils/vscodeApi';
import { BOARD, SIDEBAR } from '../utils/mode';
import { isTyping } from '../utils/typing';

type Options = {
  keys: string[];
  selected: string | null;
  select: (k: string) => void;
  detail: Detail | null;
  narrow: boolean;
  setPage: (p: boolean) => void;
  setTab: (key: string, tab: StageId) => void;
};

// j/k move, a acts, c comments, 1-4 stage tabs, b board, r refresh, Escape back to the queue.
export function useKeyboardShortcuts(o: Options) {
  useWindowEvent('keydown', (e) => {
    const el = document.activeElement as HTMLElement | null;
    if (BOARD) {
      if (e.key === 'r' && !isTyping(el)) {
        send({ type: 'refresh' });
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(el) || el?.closest('[role=menu]')) {
      return;
    }
    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      if (!o.keys.length) {
        return;
      }
      const i = Math.max(0, o.keys.indexOf(o.selected ?? ''));
      const k = o.keys[Math.max(0, Math.min(o.keys.length - 1, i + (e.key === 'j' ? 1 : -1)))];
      o.select(k);
      focusQueueRow(k);
    } else if (e.key === 'a' && o.detail?.flow?.need) {
      e.preventDefault();
      const a = o.detail.flow.need.actions[0];
      if (a.id === 'comment') {
        focusDraft();
      } else {
        send({ type: 'action', key: o.detail.ticket.key, id: a.id });
      }
    } else if (e.key === 'c' && !SIDEBAR) {
      e.preventDefault();
      if (o.narrow) {
        o.setPage(true);
      }
      setTimeout(focusDraft, 30);
    } else if (/^[1-4]$/.test(e.key) && o.detail) {
      e.preventDefault();
      o.setTab(o.detail.ticket.key, STAGES[+e.key - 1].id);
    } else if (e.key === 'b') {
      e.preventDefault();
      send({ type: 'openBoard' });
    } else if (e.key === 'r') {
      e.preventDefault();
      send({ type: 'refresh' });
    } else if (e.key === 'Escape' && !SIDEBAR) {
      e.preventDefault();
      o.setPage(false);
      if (o.selected) {
        focusQueueRow(o.selected);
      }
    }
  });
}
