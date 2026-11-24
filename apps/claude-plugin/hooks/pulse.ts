import type { EngineInterface } from 'claude-code';
import { runActive } from './look.gen';
import { store } from './store';

// A running agent's border pulses: a timer steps through brightness levels while any agent runs
// in the open view, and stops when none does.

const LEVELS = [0.35, 0.5, 0.7, 0.9, 1, 0.9, 0.7, 0.5];
const BASE = '#3a3d45';
const STEP_MS = 450;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The colour mixed toward the base by the current pulse level. */
export function pulse(hex: string) {
  const t = LEVELS[store.pulse % LEVELS.length]!;
  const [a, b] = [channels(hex), channels(BASE)];
  return `#${a
    .map((c, i) =>
      Math.round(b[i]! + (c - b[i]!) * t)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** True when the open view shows an agent that runs now. */
export function anyRunning() {
  if (store.open) {
    return store.detail?.ticket.key === store.open && runActive(store.detail.flow);
  }
  return !!store.sprint?.groups.some((g) => g.tickets.some((t) => t.agent?.kind === 'running'));
}

/** Starts the pulse timer while an agent runs, and stops it after. */
export function keepPulsing($: EngineInterface) {
  const active = anyRunning();
  if (active && !store.pulseTimer) {
    store.pulseTimer = $.clock.every(STEP_MS, () => {
      store.pulse += 1;
      $.ui.invalidate('ui.render');
    });
  } else if (!active && store.pulseTimer) {
    store.pulseTimer.cancel();
    store.pulseTimer = null;
  }
}
