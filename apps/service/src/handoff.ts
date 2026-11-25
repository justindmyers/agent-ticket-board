import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyHandback,
  chatPrompt,
  handoffText,
  type Flow,
  type Ticket
} from '@agent-ticket-board/core';

// Continue in chat, on the service side: the handoff file for a new Claude Code chat, and the
// hand-back from that chat.

export type HandoffInput = {
  ticket: Ticket;
  flow: Flow;
  comments: string[];
  /** The ticket's folder in the board's home. */
  dir: string;
  /** The command that runs the board's CLI. */
  atb: string;
};

/** Writes the handoff file. Returns it, the prompt for the new chat, and the folder to open it in. */
export async function writeHandoff(i: HandoffInput) {
  const file = join(i.dir, 'handoff.md');
  const transcript = i.flow.run?.id
    ? join(i.dir, 'runs', i.flow.run.id, 'messages.jsonl')
    : undefined;
  await mkdir(i.dir, { recursive: true });
  await writeFile(
    file,
    handoffText(i.ticket, i.flow, { atb: i.atb, transcript, comments: i.comments })
  );
  return { file, prompt: chatPrompt(i.ticket.key, file), folder: i.flow.worktree ?? null };
}

/** The record after the chat hands the ticket back. */
export function handback(f: Flow | null, body: unknown, at: string) {
  if (!f) {
    throw new Error('This ticket has no agent record. Start it on the board first.');
  }
  const b = (body ?? {}) as { summary?: unknown; replan?: unknown };
  return applyHandback(f, String(b.summary ?? ''), b.replan === true, at);
}
