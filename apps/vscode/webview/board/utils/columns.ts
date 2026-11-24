import { PALETTE } from '@agent-ticket-board/core/look';
import type { BoardTicket } from '../types/board';

const COLUMNS = ['To Do', 'In Progress', 'Code Review', 'Verifying', 'Blocked', 'Done'];

const STATUS_DOT: Record<string, string> = {
  'To Do': PALETTE.neutral.hex,
  'In Progress': PALETTE.blue.hex,
  'Code Review': PALETTE.green.hex,
  Verifying: PALETTE.aqua.hex,
  Blocked: PALETTE.red.hex,
  Done: PALETTE.green.hex
};

export const statusDot = (status: string) => STATUS_DOT[status] ?? PALETTE.neutral.hex;

export const boardStatuses = (tickets: BoardTicket[]) => [
  ...COLUMNS,
  ...new Set(tickets.map((t) => t.status).filter((s) => !COLUMNS.includes(s)))
];
