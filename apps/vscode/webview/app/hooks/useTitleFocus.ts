import { useEffect, useState } from 'react';
import type { Detail } from '../../shared/types/host';
import { focusTicketTitle } from '../../shared/utils/focus';

// Enter on a row moves focus to the ticket title once that ticket has drawn.
export function useTitleFocus(detail: Detail | null) {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!pending || detail?.ticket.key !== pending) {
      return;
    }
    const id = requestAnimationFrame(() => {
      focusTicketTitle();
      setPending(null);
    });
    return () => cancelAnimationFrame(id);
  }, [detail, pending]);
  return setPending;
}
