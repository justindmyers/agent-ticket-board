import { mdiClipboardTextOutline, mdiCodeBraces, mdiFlaskOutline, mdiSourcePull } from '@mdi/js';
import type { Agent, Flow, TrackerState } from '../types/host';
import type { Accent } from '../types/theme';

export const STAGES = [
  { id: 'planning', label: 'Planning', accent: 'blue', icon: mdiClipboardTextOutline },
  { id: 'development', label: 'Development', accent: 'aqua', icon: mdiCodeBraces },
  { id: 'testing', label: 'Testing', accent: 'amber', icon: mdiFlaskOutline },
  { id: 'code-review', label: 'Code review', accent: 'green', icon: mdiSourcePull }
] as const satisfies readonly { id: Flow['stage']; label: string; accent: Accent; icon: string }[];

export const stageOf = (id?: string) => STAGES.find((s) => s.id === id);

export const stageIndex = (f: Flow | null) => (f ? STAGES.findIndex((s) => s.id === f.stage) : -1);

export function accentOf(
  a: Pick<Agent, 'kind' | 'stage'> | null | undefined,
  state?: TrackerState
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
  const byState: Record<TrackerState, Accent> = {
    todo: 'neutral',
    active: 'blue',
    blocked: 'red',
    done: 'green'
  };
  return byState[state ?? 'todo'];
}
