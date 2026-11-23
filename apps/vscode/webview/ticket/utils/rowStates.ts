import { mdiCheck, mdiCircleOutline, mdiCloseCircleOutline, mdiProgressClock } from '@mdi/js';
import type { Accent } from '../../shared/types/theme';
import type { RowState } from '../types/ticket';

export const ROW_STATES: Record<RowState, { icon: string; accent: Accent; label: string }> = {
  done: { icon: mdiCheck, accent: 'green', label: 'Done' },
  current: { icon: mdiProgressClock, accent: 'blue', label: 'In progress' },
  todo: { icon: mdiCircleOutline, accent: 'neutral', label: 'Not started' },
  fail: { icon: mdiCloseCircleOutline, accent: 'red', label: 'Failed' }
};
