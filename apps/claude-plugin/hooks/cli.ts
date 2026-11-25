import type { EngineInterface } from 'claude-code';
import { runActive } from './look.gen';
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

/** While the open ticket has an active agent run, reloads it every 3 seconds. */
export function watchRun($: EngineInterface, key: string) {
  if (!runActive(store.detail?.flow)) {
    return;
  }
  $.clock.after(3000, () => {
    if (store.open !== key) {
      return;
    }
    void reloadTicket($, key)
      .catch(() => undefined)
      .then(() => watchRun($, key));
  });
}

/** Starts (`plan`) or stops an agent run through the service, then follows it. */
export async function agentRun(
  $: EngineInterface,
  key: string,
  verb: 'plan' | 'develop' | 'test' | 'review' | 'gate' | 'commit-plan' | 'commit' | 'stop'
) {
  try {
    await atb($, [verb, key], 30000);
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
    return;
  }
  await reloadTicket($, key);
  watchRun($, key);
}

/** Saves the answer to plan question `n` (1-based), then reloads the ticket. */
export async function answer(
  $: EngineInterface,
  key: string,
  n: number,
  text: string,
  earlier = false
) {
  try {
    await atb($, ['answer', key, String(n), text, ...(earlier ? ['--earlier'] : [])]);
    store.changing = null;
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
    return;
  }
  await reloadTicket($, key);
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

/** Moves a finished build with a clean gate to Testing, then reloads the ticket. */
export async function toTesting($: EngineInterface, key: string) {
  try {
    await atb($, ['to-testing', key]);
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
    return;
  }
  await reloadTicket($, key);
}

/** Approves a tested change for code review, then reloads the ticket. */
export async function approveTested($: EngineInterface, key: string) {
  try {
    await atb($, ['approve-testing', key]);
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
    return;
  }
  await reloadTicket($, key);
  watchRun($, key);
}

/** Opens one of the ticket's screenshots in the system viewer. The CLI checks that the evidence lists it. */
export async function openShot($: EngineInterface, key: string, path: string) {
  try {
    await atb($, ['open-shot', key, path]);
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
  }
}

/** Continue in chat: writes the ticket's handoff file and puts the prompt for it in the prompt box. */
export async function continueInChat($: EngineInterface, key: string) {
  try {
    const h = await atb<{ prompt: string; folder: string | null }>($, ['handoff', key]);
    const r = await $.prompt.fill({ text: h.prompt });
    $.ui.toast(
      r.isFilled
        ? `${key}: the prompt is in the prompt box. Send it to continue the ticket here.`
        : `${key}: send this prompt: ${h.prompt}`
    );
  } catch (e) {
    $.ui.toast(`${key}: ${errorText(e)}`);
  }
}
