import type { EngineInterface } from 'claude-code';
import { ATB, NODE } from './paths.gen';
import { store } from './store';
import type { Detail, Sprint } from './types';

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs the shared `atb` CLI: the pane's only path to core. */
export async function atb<T = unknown>($: EngineInterface, args: string[], timeoutMs = 60000) {
  const r = await $.process.run([NODE, ATB, ...args], { timeoutMs });
  if (r.exitCode !== 0) {
    throw new Error((r.stderr || 'atb failed').trim().slice(0, 200));
  }
  return JSON.parse(r.stdout) as T;
}

export async function loadSprint($: EngineInterface) {
  try {
    const cached = await atb<Sprint>($, ['sprint', '--cached']);
    if (cached.groups.length) {
      store.sprint = cached;
    }
  } catch {
    // No cache yet: the fresh load below fills it.
  }
  store.updating = true;
  $.ui.invalidate('ui.render');
  try {
    store.sprint = await atb<Sprint>($, ['sprint']);
    store.error = '';
  } catch (e) {
    store.error = errorText(e);
  }
  store.updating = false;
  $.ui.invalidate('ui.render');
}

export async function loadTicket($: EngineInterface, key: string) {
  store.open = key;
  store.detail = null;
  store.draft = '';
  $.ui.invalidate('ui.render');
  try {
    store.detail = await atb<Detail>($, ['ticket', key, '--cached']);
  } catch {
    // No cached detail: the fresh load below fills it.
  }
  $.ui.invalidate('ui.render');
  try {
    store.detail = await atb<Detail>($, ['ticket', key]);
    // The fresh ticket went into the sprint cache too: read it, so the list shows the same status.
    const cached = await atb<Sprint>($, ['sprint', '--cached']);
    if (cached.groups.length) {
      store.sprint = cached;
    }
  } catch (e) {
    store.error = errorText(e);
  }
  $.ui.invalidate('ui.render');
}

/** Reloads only the cached ticket detail, after a local change such as a comment. */
export async function reloadTicket($: EngineInterface, key: string) {
  store.detail = await atb<Detail>($, ['ticket', key, '--cached']);
  $.ui.invalidate('ui.render');
}

/** Adopt or ignore local work, then reload the ticket and the sprint. */
export async function runLocalWork($: EngineInterface, key: string, args: string[]) {
  try {
    await atb($, args);
  } catch (e) {
    store.error = errorText(e);
  }
  await loadTicket($, key);
  await loadSprint($);
}
