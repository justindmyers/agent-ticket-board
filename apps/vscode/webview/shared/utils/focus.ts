export const focusDraft = () => document.getElementById('draft')?.focus();

export const focusTicketTitle = () => document.getElementById('ttl')?.focus();

export const focusQueueRow = (key: string) =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-queue] [data-key="${CSS.escape(key)}"]`)?.focus()
  );
