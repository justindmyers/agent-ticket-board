import { mdiApplicationOutline, mdiSourceRepository, mdiTicketOutline } from '@mdi/js';
import type { Accent } from '../../shared/types/theme';
import type { Confidence, SectionId } from '../../shared/types/settings';

export const SECTION_ICON: Record<SectionId, string> = {
  tracker: mdiTicketOutline,
  repo: mdiSourceRepository,
  app: mdiApplicationOutline
};

export const DETECTABLE: SectionId[] = ['tracker', 'repo'];

export const CONFIDENCE_ACCENT: Record<Confidence, Accent> = {
  high: 'green',
  medium: 'amber',
  low: 'neutral'
};
