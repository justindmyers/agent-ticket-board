import { mdSections } from './adf-md';
import { STAGES } from './look';
import { runActive } from './look';
import { withoutNeed } from './changes';
import type { Action, Flow, Ticket } from './types';

// Continue in chat: the board writes what a ticket's agents know into a handoff file, and opens a new
// Claude Code chat in the ticket's worktree with a one-line prompt that points at it. The developer
// iterates in that chat with their own setup. At the end, the chat runs `atb handback`: the ticket
// shows what changed, and the board offers the stage's next step.

export type HandoffContext = {
  /** The command that runs the board's CLI, for the hand-back line. */
  atb: string;
  /** The last agent run's transcript, if there is one. */
  transcript?: string;
  /** The developer's comments on the board. */
  comments: string[];
};

const stageLabel = (f: Flow) => STAGES.find((s) => s.id === f.stage)?.label ?? f.stage;

function evidenceLabel(f: Flow, id: string) {
  const e = f.evidence?.[id];
  if (!e) {
    return 'not tested';
  }
  return e.ok ? 'passes' : `does not pass${e.note ? `: ${e.note}` : ''}`;
}

const list = (title: string, lines: string[]) =>
  lines.length ? ['', `## ${title}`, '', ...lines] : [];

/** The handoff file: the ticket, where its agents are, and how to hand the ticket back. */
export function handoffText(t: Ticket, f: Flow, ctx: HandoffContext): string {
  const description = mdSections(t.description).map((s) =>
    s.title ? `### ${s.title}\n\n${s.md}` : s.md
  );
  return [
    `# ${t.key}: ${t.summary}`,
    '',
    `Stage: ${stageLabel(f)}. Worktree: ${f.worktree ?? 'none yet'}.`,
    ...(f.need
      ? [`The board needs: ${f.need.ask}`, ...(f.need.detail ? [f.need.detail] : [])]
      : []),
    '',
    "The developer continues this ticket here, with you. The board's agents did the work below.",
    'Work in the worktree above. Do not commit or push: the board does that after code review.',
    ...list('Ticket', description),
    ...list(
      'Requirements',
      (f.requirements ?? []).map((r) => `- ${r.id} (${evidenceLabel(f, r.id)}): ${r.text}`)
    ),
    ...list(
      'Steps',
      (f.steps ?? []).map((s) => `${s.n}. [${s.state}] ${s.text}${s.note ? ` (${s.note})` : ''}`)
    ),
    ...list(
      'Assumptions',
      (f.assumptions ?? []).map((a) => `- ${a}`)
    ),
    ...list(
      'Approved writes to the backend',
      (f.writes ?? []).map((w) => `- ${w.method} ${w.path}: ${w.why}`)
    ),
    ...list(
      'Comments from the developer',
      ctx.comments.map((c) => `- ${c}`)
    ),
    ...list('The last agent run', ctx.transcript ? [`Its transcript: ${ctx.transcript}`] : []),
    '',
    '## The test browser',
    '',
    `The ticket's browser keeps the developer's login. Use it with \`pnpm exec playwright-cli -s=atb-${t.key} <command>\`.`,
    '',
    '## When you are done',
    '',
    'When the developer says the work here is done, hand the ticket back to the board:',
    '',
    `    ${ctx.atb} handback ${t.key} "<what changed and why>"`,
    '',
    'Add `--replan` when the requirements changed: the board then re-plans for the change.',
    ''
  ].join('\n');
}

/** The prompt that the new chat starts with. The developer sends it. */
export const chatPrompt = (key: string, file: string) =>
  `Read ${file} and continue the ticket ${key} from there with me.`;

const NEXT: Record<string, Action[]> = {
  planning: [{ id: 'replan', label: 'Re-plan' }],
  development: [{ id: 'startDevelopment', label: 'Build again' }],
  testing: [{ id: 'startTesting', label: 'Test again' }]
};

/** The record after a hand-back: what changed in chat, and the stage's next step. */
export function applyHandback(f: Flow, summary: string, replan: boolean, at: string): Flow {
  const text = summary.trim();
  if (!text) {
    throw new Error('Say what changed in chat.');
  }
  if (runActive(f)) {
    throw new Error('An agent run is active. Stop the run first, then hand the ticket back.');
  }
  const ask = `Changed in chat: ${text}`;
  if (replan) {
    const built = f.steps?.some((s) => s.state === 'done');
    return {
      ...withoutNeed(f),
      stage: 'planning',
      chat: { at, summary: text },
      changes: built ? [...(f.changes ?? []), { text, at }] : f.changes,
      need: { kind: 'decision', ask, actions: NEXT.planning }
    };
  }
  return {
    ...withoutNeed(f),
    chat: { at, summary: text },
    need: { kind: 'decision', ask, actions: NEXT[f.stage] ?? [] }
  };
}
