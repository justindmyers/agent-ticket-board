// Agent Ticket Board for Claude Code (Desktop app and terminal). Same data, actions and look as the
// VS Code extension, through the shared `atb` CLI. The pane never opens in VS Code; the guards run everywhere.
import type { EngineInterface, Register } from 'claude-code';
import { atb, loadSprint } from './cli';
import { refusal } from './guards';
import { isHeavy } from './look.gen';
import type { Ctx } from './kit';
import { queueView } from './queue-view';
import { renderSettings, settings } from './settings';
import { keepPulsing } from './pulse';
import { store } from './store';
import { ticketView } from './ticket-view';

export { GIT_PUSH, JIRA_WRITE, SELF_APPROVE } from './guards';

const PANE = 'board';

async function openIfApp($: EngineInterface) {
  const surfaces = await $.session.surfaces();
  if (!surfaces.includes('desktop') && !surfaces.includes('terminal')) {
    return false;
  }
  const r = await $.ui.open({ id: PANE, title: 'My sprint' });
  if (r.isPlaced) {
    void loadSprint($);
  }
  return !!r.isPlaced;
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'board',
      description: 'Open Agent Ticket Board (Claude app and terminal)',
      immediate: true
    });
    const result = await next(e);
    const surfaces = await $.session.surfaces();
    if (surfaces.includes('desktop')) {
      await openIfApp($);
    }
    return result;
  });

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const result = await next(e);
    await openIfApp($);
    return result;
  });

  on('command.run', { command: 'board' }, async ($) => {
    const placed = await openIfApp($);
    return placed
      ? {}
      : { text: 'In VS Code, use the Agent Ticket Board view in the activity bar.' };
  });

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cmd = String(e.command ?? '');
    const r = refusal(cmd);
    if (!r && isHeavy(cmd)) {
      // One heavy command at a time on this computer, across every agent session.
      const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const got = await atb<{ ok: boolean }>($, ['heavy', 'acquire', owner], 31 * 60_000);
      if (!got.ok) {
        return {
          deny: 'The computer ran other type checks, lint or tests for 30 minutes. Try this command again later.'
        };
      }
      try {
        return await next(e);
      } finally {
        await atb($, ['heavy', 'release', owner]).catch(() => undefined);
      }
    }
    if (!r) {
      return next(e);
    }
    if (r.toast) {
      $.ui.toast(r.toast);
    }
    return { deny: r.deny };
  }).catch(async ($, e, next) => {
    if (next.called) {
      return next(e);
    }
    return {
      deny: 'The agent-ticket-board guard failed, so this command was not run: ' + next.error.kind
    };
  });

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) {
      return next(e);
    }
    const els = $.ui.resolve(e);
    const redraw = () => $.ui.invalidate('ui.render');
    const ctx: Ctx = { els, redraw };
    const run = <T>(args: string[]) => atb<T>($, args);

    if (settings.open) {
      return renderSettings(
        els,
        run,
        redraw,
        () => {
          settings.open = false;
          redraw();
        },
        (text) => $.ui.toast(text)
      );
    }
    keepPulsing($);
    return store.open ? ticketView($, ctx, store.open) : queueView($, ctx, run);
  });
};
