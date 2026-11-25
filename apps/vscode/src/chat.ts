import * as vscode from 'vscode';
import { callService, ENV_FILE, ensureService, readJson } from '@agent-ticket-board/core';

// Continue in chat: the service writes the ticket's handoff file; a new Claude Code chat opens in the
// ticket's worktree with a prompt that points at it. The developer reads the prompt and sends it.
// A worktree that is not open in this window opens in a new window; the extension there opens the
// chat when it starts, from the pending handoff in the global state.

type Handoff = { file: string; prompt: string; folder: string | null };
type Pending = { folder: string; prompt: string; at: number };

const PENDING = 'atb.pendingChat';
/** A pending chat older than this is stale: the new window did not start the extension in time. */
const PENDING_MS = 2 * 60_000;

const same = (a: string, b: string) => vscode.Uri.file(a).fsPath === vscode.Uri.file(b).fsPath;
const openHere = (folder: string) =>
  (vscode.workspace.workspaceFolders ?? []).some((w) => same(w.uri.fsPath, folder));

/** Opens a new Claude Code chat with the prompt in its box. */
async function openChat(prompt: string) {
  try {
    await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', undefined, prompt);
  } catch {
    await vscode.env.openExternal(
      vscode.Uri.parse(`vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(prompt)}`)
    );
  }
}

/** The Chat button: hands the ticket to a new Claude Code chat in its worktree. */
export async function continueInChat(ctx: vscode.ExtensionContext, key: string) {
  const env = await readJson<{ node: string; atb: string } | null>(ENV_FILE, null);
  if (!env) {
    throw new Error(
      'The board CLI is not installed. Run `pnpm install-local` in the board repository.'
    );
  }
  const h = (await callService(
    await ensureService(env.atb, env.node),
    `/tickets/${key}/handoff`,
    {}
  )) as Handoff;
  if (!h.folder || openHere(h.folder)) {
    return openChat(h.prompt);
  }
  await ctx.globalState.update(PENDING, {
    folder: h.folder,
    prompt: h.prompt,
    at: Date.now()
  } satisfies Pending);
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(h.folder), {
    forceNewWindow: true
  });
}

/** On start: opens the chat that another window handed to this worktree. */
export async function openPendingChat(ctx: vscode.ExtensionContext) {
  const p = ctx.globalState.get<Pending>(PENDING);
  if (!p || !openHere(p.folder) || !vscode.workspace.workspaceFolders?.length) {
    return;
  }
  await ctx.globalState.update(PENDING, undefined);
  if (Date.now() - p.at < PENDING_MS) {
    await openChat(p.prompt);
  }
}
