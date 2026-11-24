import { planStartable, spentText } from '@agent-ticket-board/core/look';
import type { Detail } from '../../shared/types/host';

const STARTABLE = /^(to do|in progress|open|backlog|selected for development)$/i;

export const canStartPlanning = (d: Detail) =>
  planStartable(d.flow) &&
  !d.adopt &&
  (d.tracker ? d.tracker.state !== 'done' : STARTABLE.test(d.ticket.status));

export const pointsText = (points: number | null, unit = ' pts') =>
  points == null ? 'Not pointed' : `${points}${unit}`;

export const metaParts = (t: Detail['ticket'], spent?: number) =>
  [
    t.type,
    pointsText(t.points),
    t.priority && `${t.priority} priority`,
    `${t.status} in Jira`,
    spentText(spent)
  ].filter((x): x is string => !!x);
