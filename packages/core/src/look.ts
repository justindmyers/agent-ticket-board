// The stage list, the colors and the accent rule that every client shares. This file has no imports,
// because the Claude Code plugin gets a verbatim copy of it (hooks/look.gen.ts) and cannot import core.

export type Stage = 'planning' | 'development' | 'testing' | 'code-review';

export type AgentKind = 'problem' | 'decision' | 'running' | 'waiting' | 'finished';

export type TrackerState = 'todo' | 'active' | 'blocked' | 'done';

/** `hex` is the accent; `text` is the light-theme text shade (4.5:1 on white). */
export const PALETTE = {
  blue: { hex: '#3A86FE', text: '#1d5fd1' },
  aqua: { hex: '#64E4ED', text: '#0b6f78' },
  amber: { hex: '#FFBE0C', text: '#7d5700' },
  green: { hex: '#1EC46E', text: '#13804a' },
  violet: { hex: '#A78BFA', text: '#6d28d9' },
  red: { hex: '#FA4045', text: '#c8262b' },
  neutral: { hex: '#96969D', text: '#55555c' }
} as const;

export type Accent = keyof typeof PALETTE;

export const STAGES: { id: Stage; label: string; accent: Accent }[] = [
  { id: 'planning', label: 'Planning', accent: 'blue' },
  { id: 'development', label: 'Development', accent: 'aqua' },
  { id: 'testing', label: 'Testing', accent: 'amber' },
  { id: 'code-review', label: 'Code review', accent: 'green' }
];

/** The color of a ticket with no agent record: grey not started, blue active, red blocked, green finished. */
export const STATE_ACCENT: Record<TrackerState, Accent> = {
  todo: 'neutral',
  active: 'blue',
  blocked: 'red',
  done: 'green'
};

/** An agent colors a ticket by its kind, then by its stage. With no agent, the tracker state decides. */
export function accentOf(
  agent: { kind: AgentKind; stage: string } | null | undefined,
  state?: TrackerState
): Accent {
  if (agent?.kind === 'problem') {
    return 'red';
  }
  if (agent?.kind === 'finished') {
    return 'green';
  }
  if (agent) {
    return STAGES.find((s) => s.id === agent.stage)?.accent ?? 'neutral';
  }
  return STATE_ACCENT[state ?? 'todo'];
}
