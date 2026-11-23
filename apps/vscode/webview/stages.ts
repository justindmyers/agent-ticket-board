import {
  mdiCheck,
  mdiClipboardTextOutline,
  mdiCodeBraces,
  mdiFlaskOutline,
  mdiSourcePull
} from '@mdi/js';
import type { Accent } from './surfaces';
import type { Agent, Flow } from './host';

export const STAGES = [
  { id: 'planning', label: 'Planning', accent: 'blue', icon: mdiClipboardTextOutline },
  { id: 'development', label: 'Development', accent: 'aqua', icon: mdiCodeBraces },
  { id: 'testing', label: 'Testing', accent: 'amber', icon: mdiFlaskOutline },
  { id: 'code-review', label: 'Code review', accent: 'green', icon: mdiSourcePull }
] as const satisfies readonly { id: Flow['stage']; label: string; accent: Accent; icon: string }[];
export type StageId = (typeof STAGES)[number]['id'];
export const stageOf = (id?: string) => STAGES.find((s) => s.id === id);
export const DONE_ICON = mdiCheck;

/** One accent per ticket: red for a problem, the stage colour while the agent works, neutral before it starts. */
export function accentOf(
  a: Pick<Agent, 'kind' | 'stage'> | null | undefined,
  status?: string
): Accent {
  if (a?.kind === 'problem') {
    return 'red';
  }
  if (a?.kind === 'finished') {
    return 'green';
  }
  if (a) {
    return stageOf(a.stage)?.accent ?? 'neutral';
  }
  return /done|verifying/i.test(status ?? '') ? 'green' : 'neutral';
}
