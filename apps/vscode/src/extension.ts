import { isEqual } from 'lodash-es';
import * as vscode from 'vscode';
import { startRun, stopRun, watchAgents } from './agent-runs';
import { continueInChat, openPendingChat } from './chat';
import { existsSync } from 'node:fs';
import {
  addComment,
  agentFor,
  agentMayMove,
  CONFIG,
  detail,
  detect,
  mergeDetection,
  saveSettings,
  settingsView,
  type Detection,
  type Section,
  findPr,
  FLOWS,
  flowFor,
  grouped,
  listComments,
  loadState,
  moveTicket,
  PRS,
  readCache,
  rememberTicket,
  saveAnswer,
  saveEarlierAnswer,
  bundle,
  readTimeline,
  timelineText,
  refreshPrs,
  refreshSprint,
  setAgentMayMove,
  setAfterMerge,
  jiraPanel,
  STATUS,
  ticketUrl,
  trackerInfo,
  workState,
  LOCAL,
  localView,
  refreshLocalWork,
  adoptOffer,
  adoptWork,
  ignoreWork,
  type Stage,
  type Snapshot,
  type Ticket,
  moveToTesting
} from '@agent-ticket-board/core';

// Jira writes: a status change only, after the developer confirms it here, or by the agent on a
// ticket where the developer allowed it. Agent records are sample files until the service exists.

type Msg =
  | { type: 'ready' | 'refresh' | 'openBoard' }
  | { type: 'openTicket' | 'select'; key: string }
  | { type: 'move'; key: string; from?: string; to: string }
  | { type: 'setAgentMove'; key: string; allow: boolean }
  | { type: 'setAfterMerge'; key: string; to: string | null }
  | { type: 'adopt'; key: string; stage: Stage }
  | { type: 'answer'; key: string; n: number; text: string; earlier?: boolean }
  | { type: 'ignoreLocal'; key: string }
  | { type: 'comment'; key: string; text: string; run?: boolean }
  | { type: 'action'; key: string; id: string }
  | { type: 'openJira'; key: string }
  | { type: 'openUrl'; url: string }
  | { type: 'openSettings' | 'setupWithClaude' | 'openConfigFile' }
  | { type: 'detect'; only?: Section }
  | { type: 'saveSettings'; texts: Record<string, string> };

const REFRESH_MS = 5 * 60_000;
const SAMPLE_ACTIONS: Record<string, string> = {
  approve: 'Approve',
  startPlanning: 'Start planning',
  fix: 'Fix',
  pause: 'Pause agent',
  replan: 'Re-plan',
  openPlan: 'Open plan file',
  openWorktree: 'Open worktree'
};

let cache: Snapshot | undefined;
let pending = 0;
let updating = false;
let loading: Promise<void> | undefined;
const views = new Set<vscode.Webview>();
let board: vscode.WebviewPanel | undefined;
let inbox: vscode.WebviewPanel | undefined;
let settings: vscode.WebviewPanel | undefined;
let detection: Detection | undefined;
let inboxKey: string | undefined;
let sidebarVisible = false;
const tried = new Set<string>();

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const open = (url: string) => vscode.env.openExternal(vscode.Uri.parse(url));
const post = (m: unknown) => views.forEach((w) => w.postMessage(m));

// The editor tab shows the queue only when the sidebar queue is hidden: never two queues at once.
const postLayout = () => inbox?.webview.postMessage({ type: 'layout', queue: !sidebarVisible });

function nonce() {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

function shaped() {
  return cache!.tickets.map((t) => {
    STATUS[t.key] = t.status;
    return {
      ...t,
      state: workState(t.status, LOCAL[t.key]),
      local: localView(t.key),
      agent: agentFor(t.key),
      comments: undefined,
      description: undefined
    };
  });
}

function broadcast() {
  if (!cache) {
    return;
  }
  const tickets = shaped();
  post({ type: 'data', at: cache.at, tickets, groups: grouped(tickets), updating, pending });
}

async function loadPr(key: string) {
  try {
    PRS[key] = await findPr(key);
  } catch {
    // Keep the old value. gh can be signed out.
  }
}

async function loadPrs() {
  await refreshPrs(findPr);
  broadcast();
  if (inboxKey) {
    void sendTicket(inboxKey, true);
  }
  void autoSync();
}

async function doMove(key: string, to: string, by: 'you' | 'agent', from?: string) {
  try {
    await moveTicket(key, to, by, from);
    const t = cache?.tickets.find((x) => x.key === key);
    if (t) {
      t.status = to;
    }
    broadcast();
    void sendTicket(key, true);
    const who = by === 'agent' ? ' by the agent (allowed for this ticket)' : '';
    vscode.window.setStatusBarMessage(`${key} moved to ${to} in Jira${who}`, 6000);
    setTimeout(() => void refresh(true), 3000);
  } catch (e) {
    void vscode.window.showErrorMessage(`${key}: Jira status not changed. ${errorText(e)}`);
    broadcast();
  }
}

/** A merged ticket that Jira has not caught up with. The agent moves it only where the developer allowed it. */
async function autoSync() {
  if (!cache) {
    return;
  }
  for (const t of cache.tickets) {
    const f = flowFor(t.key, t.status);
    const to = f?.need?.from === 'sync' ? f.need.to : undefined;
    if (!to || tried.has(`${t.key}:${to}`) || !(await agentMayMove(t.key))) {
      continue;
    }
    tried.add(`${t.key}:${to}`);
    await doMove(t.key, to, 'agent', t.status);
  }
}

// git only, so it runs on every refresh: local work changes far more often than Jira.
async function loadLocalWork() {
  if (!cache) {
    return;
  }
  await refreshLocalWork(cache.tickets.map((t) => t.key));
  broadcast();
  const adoptable = cache.tickets.map((t) => t.key).filter((k) => adoptOffer(k));
  if (adoptable.length) {
    await refreshPrs(findPr, adoptable);
  }
  if (inboxKey) {
    void sendTicket(inboxKey, true);
  }
}

// Show the disk cache at once, then refresh in the background and fill in as data arrives.
async function refresh(force = false) {
  if (!cache) {
    const c = await readCache();
    if (c.tickets.length) {
      cache = c;
    }
  }
  broadcast();
  void loadLocalWork();
  if (loading) {
    return loading;
  }
  if (cache?.at && !force && Date.now() - Date.parse(cache.at) < REFRESH_MS) {
    return;
  }
  updating = true;
  broadcast();
  if (!cache) {
    post({ type: 'loading' });
  }
  loading = (async () => {
    try {
      await refreshSprint((s) => {
        cache = s;
        pending = s.pending;
        broadcast();
      });
      if (inboxKey) {
        void sendTicket(inboxKey, true);
      }
      void loadPrs();
      void loadLocalWork();
    } catch (e) {
      post({ type: cache ? 'warn' : 'error', message: errorText(e) });
    } finally {
      loading = undefined;
      updating = false;
      pending = 0;
      broadcast();
    }
  })();
  return loading;
}

// Ticket pane: draw from the cache at once, then get the fresh detail and draw again.
async function sendTicket(key: string, cachedOnly = false) {
  if (!inbox) {
    return;
  }
  const w = inbox.webview;
  const msg = async (t: Ticket, fresh: boolean) =>
    w.postMessage({
      type: 'ticket',
      fresh,
      ticket: t,
      flow: flowFor(key, t.status),
      tracker: trackerInfo(t.status, LOCAL[key]),
      adopt: adoptOffer(key),
      comments: await listComments(key),
      jira: await jiraPanel(key, PRS[key])
    });
  if (!cache) {
    const c = await readCache();
    if (c.tickets.length) {
      cache = c;
    }
  }
  const cached = cache?.tickets.find((t) => t.key === key);
  if (cached) {
    await msg(cached, cachedOnly && cached.description !== undefined);
  }
  if (cachedOnly) {
    return;
  }
  if (FLOWS[key] && PRS[key] === undefined) {
    void loadPr(key).then(() => {
      broadcast();
      if (inboxKey === key) {
        void sendTicket(key, true);
      }
    });
  }
  try {
    const d = await detail(key);
    if (cache?.tickets.some((t) => t.key === key && !isEqual(t, d))) {
      cache = { ...cache, tickets: cache.tickets.map((t) => (t.key === key ? d : t)) };
      broadcast();
      void rememberTicket(d);
    }
    if (inboxKey === key) {
      await msg(d, true);
    }
  } catch (e) {
    if (!cached) {
      void w.postMessage({ type: 'error', message: errorText(e) });
    }
  }
}

async function confirmMove(key: string, to: string, fromStatus?: string) {
  const t = cache?.tickets.find((x) => x.key === key);
  const from = fromStatus ?? t?.status;
  if (!to || to === from) {
    return;
  }
  const ok = await vscode.window.showWarningMessage(
    `Move ${key} to ${to} in Jira?`,
    {
      modal: true,
      detail: `${t?.summary ?? ''}\n\nJira status: ${from} → ${to}. Only the status changes.`
    },
    `Move to ${to}`
  );
  if (!ok) {
    broadcast();
    return;
  }
  await doMove(key, to, 'you', from);
}

async function runAction(key: string, id: string, ctx?: vscode.ExtensionContext) {
  const f = flowFor(key);
  if (id.startsWith('move:')) {
    return confirmMove(key, id.slice(5), STATUS[key]);
  }
  if (id === 'openJira') {
    const url = ticketUrl(key);
    return url ? open(url) : undefined;
  }
  if (id === 'openChat') {
    return ctx ? continueInChat(ctx, key).catch((err: unknown) => showError(key, err)) : undefined;
  }
  if (id === 'openWorktree') {
    return f?.worktree
      ? vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(f.worktree), {
          forceNewWindow: true
        })
      : vscode.window.showInformationMessage(`${key}: no worktree for this ticket.`);
  }
  if (id === 'openApp' && f?.app) {
    return open(f.app);
  }
  if (id === 'openPr') {
    if (PRS[key] === undefined) {
      await loadPr(key);
    }
    const pr = PRS[key];
    return pr
      ? open(pr.url)
      : vscode.window.showInformationMessage(`${key}: no pull request found on GitHub.`);
  }
  if (id === 'startTesting') {
    return startRun(key, 'test').catch((e: unknown) => showError(key, e));
  }
  if (id === 'startCommitPlan') {
    return startRun(key, 'commit-plan').catch((e: unknown) => showError(key, e));
  }
  if (id === 'approveCommits') {
    return startRun(key, 'commit').catch((e: unknown) => showError(key, e));
  }
  if (id === 'startVerify') {
    return startRun(key, 'verify').catch((e: unknown) => showError(key, e));
  }
  if (id === 'startGate') {
    return startRun(key, 'gate').catch((e: unknown) => showError(key, e));
  }
  if (id === 'startCodeReview') {
    return startRun(key, 'review').catch((e: unknown) => showError(key, e));
  }
  if (id === 'approveTesting') {
    // Through the service: it also closes the ticket's test browser.
    return startRun(key, 'approve-testing').catch((err: unknown) => showError(key, err));
  }
  if (id.startsWith('openShot:')) {
    // Only a screenshot that the ticket's evidence lists, never any path the webview sends.
    const path = id.slice('openShot:'.length);
    const listed = Object.values(f?.evidence ?? {}).some((x) => x.shots?.includes(path));
    return listed
      ? vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path))
      : undefined;
  }
  if (id === 'toTesting') {
    try {
      await moveToTesting(key);
      broadcast();
      return sendTicket(key, true);
    } catch (err) {
      return showError(key, err);
    }
  }
  if (id === 'startDevelopment' || (id === 'approve' && f?.stage === 'planning')) {
    return startRun(key, 'develop').catch((e: unknown) => showError(key, e));
  }
  if (id === 'startPlanning' || id === 'replan') {
    return startRun(key).catch((e: unknown) => showError(key, e));
  }
  if (id === 'auditLog') {
    const events = await readTimeline(key);
    const doc = await vscode.workspace.openTextDocument({
      content: events.length ? timelineText(events) : `${key}: the audit log is empty.`,
      language: 'log'
    });
    return vscode.window.showTextDocument(doc, { preview: true });
  }
  if (id === 'debugBundle') {
    try {
      const file = await bundle(key);
      await vscode.env.clipboard.writeText(file);
      const pick = await vscode.window.showInformationMessage(
        `${key}: debug bundle made, tokens removed. Its path is on the clipboard.`,
        'Show in Finder'
      );
      if (pick) {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file));
      }
    } catch (e) {
      showError(key, e);
    }
    return;
  }
  if (id === 'stopRun') {
    return stopRun(key).catch((e: unknown) => showError(key, e));
  }
  return vscode.window.showInformationMessage(
    `${key}: ${SAMPLE_ACTIONS[id] ?? id}. Not built yet: nothing started.`
  );
}

const showError = (key: string, e: unknown) =>
  vscode.window.showErrorMessage(`${key}: ${e instanceof Error ? e.message : String(e)}`);

async function handle(m: Msg, ctx: vscode.ExtensionContext) {
  switch (m.type) {
    case 'ready':
      postLayout();
      post({ type: 'current', key: inbox ? (inboxKey ?? null) : null });
      return refresh();
    case 'refresh':
      return refresh(true);
    case 'openBoard':
      return openBoard(ctx);
    case 'openTicket':
      return openInbox(ctx, m.key);
    case 'select':
      inboxKey = m.key;
      post({ type: 'current', key: m.key });
      if (inbox) {
        inbox.title = sidebarVisible ? m.key : 'My sprint';
      }
      return sendTicket(m.key);
    case 'move':
      return confirmMove(m.key, m.to, m.from);
    case 'setAgentMove':
      await setAgentMayMove(m.key, !!m.allow);
      void sendTicket(m.key, true);
      return autoSync();
    case 'answer':
      try {
        await (m.earlier ? saveEarlierAnswer : saveAnswer)(m.key, m.n, m.text);
        broadcast();
        void sendTicket(m.key, true);
      } catch (e) {
        void vscode.window.showErrorMessage(errorText(e));
      }
      return;
    case 'adopt':
      try {
        await adoptWork(m.key, m.stage);
        vscode.window.setStatusBarMessage(
          `${m.key}: adopted. Nothing runs until you start it.`,
          6000
        );
      } catch (e) {
        void vscode.window.showErrorMessage(errorText(e));
      }
      broadcast();
      return sendTicket(m.key, true);
    case 'ignoreLocal':
      try {
        await ignoreWork(m.key);
      } catch (e) {
        void vscode.window.showErrorMessage(errorText(e));
      }
      broadcast();
      return sendTicket(m.key, true);
    case 'setAfterMerge':
      await setAfterMerge(m.key, m.to);
      broadcast();
      void sendTicket(m.key, true);
      return autoSync();
    case 'comment': {
      const text = String(m.text ?? '').trim();
      if (!text) {
        return;
      }
      if (m.run) {
        // Comment and re-plan: built work goes back to Planning for the change.
        await startRun(m.key, 'change', { text }).catch((err: unknown) => showError(m.key, err));
        return sendTicket(m.key, true);
      }
      await addComment(m.key, text, false);
      return sendTicket(m.key, true);
    }
    case 'action':
      return runAction(m.key, String(m.id), ctx);
    case 'openJira':
      return runAction(m.key, 'openJira');
    case 'openUrl':
      return open(m.url);
    case 'openSettings':
      return openSettings(ctx);
  }
}

async function sendSettings() {
  await settings?.webview.postMessage({ type: 'settings', view: await settingsView(detection) });
}

async function runDetect(only?: Section) {
  await settings?.webview.postMessage({ type: 'detecting', only: only ?? null });
  try {
    detection = mergeDetection(detection, await detect({ only }), only);
  } catch (e) {
    void vscode.window.showErrorMessage(`Detection failed. ${errorText(e)}`);
  }
  await sendSettings();
}

function setupWithClaude() {
  const t = vscode.window.createTerminal({
    name: 'Agent Ticket Board setup',
    cwd: CONFIG.repo.path ?? undefined
  });
  t.show();
  t.sendText('claude "/atb-setup"');
}

async function openConfigFile() {
  const { file } = await settingsView();
  if (!existsSync(file)) {
    void vscode.window.showInformationMessage('There is no config file yet. Save a value first.');
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(file));
}

async function handleSettings(m: Msg) {
  switch (m.type) {
    case 'ready':
      return sendSettings();
    case 'detect':
      return runDetect(m.only);
    case 'saveSettings': {
      const result = await saveSettings(m.texts);
      await settings?.webview.postMessage({ type: 'settingsSaved', ...result });
      await sendSettings();
      if (result.saved.length) {
        void refresh(true);
      }
      return;
    }
    case 'setupWithClaude':
      return setupWithClaude();
    case 'openConfigFile':
      return openConfigFile();
  }
}

// React + Tailwind webview, built by Vite into media/webview.
function webviewHtml(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  mode: 'split' | 'sidebar' | 'board' | 'settings'
) {
  const n = nonce();
  const uri = (f: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'media', 'webview', f));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${n}'`
  ].join('; ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agent Ticket Board</title>
<meta http-equiv="Content-Security-Policy" content="${csp};">
<link rel="stylesheet" href="${uri('inbox.css')}"></head><body data-mode="${mode}"><div id="root"></div>
<script type="module" nonce="${n}" src="${uri('inbox.js')}"></script></body></html>`;
}

function createPanel(
  ctx: vscode.ExtensionContext,
  id: string,
  title: string,
  mode: 'split' | 'board' | 'settings',
  onMessage: (m: Msg) => unknown = (m) => handle(m, ctx)
) {
  const p = vscode.window.createWebviewPanel(id, title, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')]
  });
  p.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.svg');
  p.webview.html = webviewHtml(p.webview, ctx, mode);
  p.webview.onDidReceiveMessage(onMessage);
  if (mode !== 'settings') {
    views.add(p.webview);
  }
  return p;
}

function openInbox(ctx: vscode.ExtensionContext, key?: string) {
  if (inbox) {
    inbox.reveal(vscode.ViewColumn.Active, true);
    if (key) {
      void inbox.webview.postMessage({ type: 'select', key });
    }
    return;
  }
  const p = createPanel(ctx, 'agentTicketBoard.inbox', 'My sprint', 'split');
  inbox = p;
  p.onDidDispose(() => {
    views.delete(p.webview);
    inbox = undefined;
    inboxKey = undefined;
    post({ type: 'current', key: null });
  });
  setTimeout(() => {
    postLayout();
    if (key) {
      void inbox?.webview.postMessage({ type: 'select', key });
    }
  }, 300);
}

function openBoard(ctx: vscode.ExtensionContext) {
  if (board) {
    return board.reveal();
  }
  const p = createPanel(ctx, 'agentTicketBoard.board', 'Board', 'board');
  board = p;
  p.onDidDispose(() => {
    views.delete(p.webview);
    board = undefined;
  });
}

function openSettings(ctx: vscode.ExtensionContext) {
  if (settings) {
    return settings.reveal();
  }
  const p = createPanel(ctx, 'agentTicketBoard.settings', 'Settings', 'settings', handleSettings);
  settings = p;
  p.onDidDispose(() => {
    settings = undefined;
  });
}

export async function activate(ctx: vscode.ExtensionContext) {
  await loadState();
  void openPendingChat(ctx);
  // Sync with Jira and GitHub every 5 minutes while a view is open.
  const timer = setInterval(() => {
    if (views.size) {
      void refresh(true);
    }
  }, REFRESH_MS);
  ctx.subscriptions.push(
    { dispose: () => clearInterval(timer) },
    watchAgents((key) => {
      broadcast();
      if (inboxKey === key) {
        void sendTicket(key, true);
      }
    }),
    vscode.commands.registerCommand('agentTicketBoard.board', () => openBoard(ctx)),
    vscode.commands.registerCommand('agentTicketBoard.inbox', () => openInbox(ctx)),
    vscode.commands.registerCommand('agentTicketBoard.refresh', () => refresh(true)),
    vscode.commands.registerCommand('agentTicketBoard.settings', () => openSettings(ctx)),
    vscode.window.registerWebviewViewProvider(
      'agentTicketBoard.queue',
      {
        resolveWebviewView(view) {
          const w = view.webview;
          w.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')]
          };
          w.html = webviewHtml(w, ctx, 'sidebar');
          views.add(w);
          sidebarVisible = view.visible;
          postLayout();
          view.onDidChangeVisibility(() => {
            sidebarVisible = view.visible;
            postLayout();
            if (view.visible && inboxKey) {
              void w.postMessage({ type: 'current', key: inboxKey });
            }
          });
          view.onDidDispose(() => {
            views.delete(w);
            sidebarVisible = false;
            postLayout();
          });
          w.onDidReceiveMessage((m: Msg) => handle(m, ctx));
        }
      },
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

export function deactivate() {}
