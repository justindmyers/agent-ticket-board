import type { DragCard } from '../types/board';

export const DRAG_TYPE = 'text/plain';

export function readDragCard(data: string): DragCard | null {
  try {
    return JSON.parse(data) as DragCard;
  } catch {
    return null;
  }
}
