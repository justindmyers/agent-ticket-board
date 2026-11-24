import { runActive } from './look';
import type { Flow } from './types';

// Revisiting a built ticket: the developer writes what to change. The ticket goes back to Planning;
// the planning agent revises the plan for the change only. Built steps stay built, so the build that
// follows makes only the new steps, and Testing then checks every requirement again.

export const pendingChanges = (f: Flow | null) => (f?.changes ?? []).filter((c) => !c.planned);

/** The record with the developer's change, back in Planning. In Planning, a comment is enough. */
export function requestChange(f: Flow, text: string, at: string): Flow {
  const t = text.trim();
  if (!t) {
    throw new Error('Write what to change first.');
  }
  if (runActive(f)) {
    throw new Error('An agent run is active. Stop the run first, then ask for the change.');
  }
  if (f.stage === 'planning' || !f.steps?.some((s) => s.state === 'done')) {
    return f;
  }
  return { ...withoutNeed(f), stage: 'planning', changes: [...(f.changes ?? []), { text: t, at }] };
}

/** The part of the plan prompt for a change: what is built, what to change, what to return. */
export function changeSection(f: Flow): string[] {
  const pending = pendingChanges(f);
  if (!pending.length) {
    return [];
  }
  return [
    '',
    '# Changes the developer asked for after the build',
    '',
    ...pending.map((c) => `- ${c.text}`),
    '',
    'The plan below is built already, in this folder. Revise it for these changes:',
    '- Return all requirements: keep the ones that still hold, and change or add ones for the changes.',
    '- Return only the steps that are still to do: the steps below that are not built and still hold,',
    '  and new steps that make the changes. Built steps stay as they are. Do not return them.',
    '- Where a change is not clear, choose the strictest reasonable option and list it as an assumption.',
    '- When the developer asks a question, answer it in an assumption: what you found (code, tracker,',
    '  pull requests), and what the plan does because of it. Look it up first; do not guess.',
    '',
    '## Requirements now',
    '',
    ...(f.requirements ?? []).map((r) => `${r.id}. ${r.text} (check: ${r.check})`),
    '',
    '## Steps now',
    '',
    ...(f.steps ?? []).map(
      (s) => `${s.n}. ${s.text} [${s.covers.join(', ')}]${s.state === 'done' ? ' (built)' : ''}`
    )
  ];
}

export function withoutNeed(f: Flow): Flow {
  const { need: _need, ...rest } = f;
  void _need;
  return rest;
}
