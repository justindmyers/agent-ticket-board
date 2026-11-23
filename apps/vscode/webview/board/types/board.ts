import type { QueueTicket } from '../../shared/types/host';

export type BoardTicket = QueueTicket & { pendingMove?: boolean };

export type DragCard = { key: string; from: string };
