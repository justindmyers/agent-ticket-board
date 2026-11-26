import * as vscode from 'vscode';
import {
  AGENTS_DIR,
  callService,
  ENV_FILE,
  ensureService,
  loadFlow,
  readJson,
  serviceInfo
} from '@agent-ticket-board/core';

// Agent runs from VS Code: the service owns them; the extension asks it to start or stop one, and
// watches the agent records, so every change shows at once, whoever wrote it.

type Env = { node: string; atb: string };

/** Starts a planning or a build run for one ticket. Starts the service if it does not run. */
export async function startRun(
  key: string,
  verb:
    | 'plan'
    | 'develop'
    | 'test'
    | 'review'
    | 'gate'
    | 'verify'
    | 'restart'
    | 'commit-plan'
    | 'commit'
    | 'approve-testing'
    | 'change' = 'plan',
  body: Record<string, unknown> = {}
) {
  const env = await readJson<Env | null>(ENV_FILE, null);
  if (!env) {
    throw new Error(
      'The board CLI is not installed. Run `pnpm install-local` in the board repository.'
    );
  }
  const info = await ensureService(env.atb, env.node);
  await callService(info, `/tickets/${key}/${verb}`, body);
}

export async function stopRun(key: string) {
  const info = await serviceInfo();
  if (info) {
    await callService(info, `/tickets/${key}/stop`, {});
  }
}

/** Calls `changed` with the ticket key after the agent record of that ticket changes on disk. */
export function watchAgents(changed: (key: string) => void): vscode.Disposable {
  const w = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(AGENTS_DIR), '*.json')
  );
  const on = async (uri: vscode.Uri) => {
    const key = uri.path
      .split('/')
      .pop()!
      .replace(/\.json$/, '');
    await loadFlow(key);
    changed(key);
  };
  w.onDidCreate(on);
  w.onDidChange(on);
  w.onDidDelete(on);
  return w;
}
