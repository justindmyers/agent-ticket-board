import {
  mdiClipboardTextOutline,
  mdiCodeBraces,
  mdiFlaskOutline,
  mdiRocketLaunchOutline,
  mdiSourcePull
} from '@mdi/js';
import { STAGES as SHARED_STAGES, type Stage } from '@agent-ticket-board/core/look';
import type { Flow } from '../types/host';

const ICONS: Record<Stage, string> = {
  planning: mdiClipboardTextOutline,
  development: mdiCodeBraces,
  testing: mdiFlaskOutline,
  'code-review': mdiSourcePull,
  ship: mdiRocketLaunchOutline
};

/** The shared stage list from core, with the icon that the webview draws for each stage. */
export const STAGES = SHARED_STAGES.map((s) => ({ ...s, icon: ICONS[s.id] }));

export const stageOf = (id?: string) => STAGES.find((s) => s.id === id);

export const stageIndex = (f: Flow | null) => (f ? STAGES.findIndex((s) => s.id === f.stage) : -1);
