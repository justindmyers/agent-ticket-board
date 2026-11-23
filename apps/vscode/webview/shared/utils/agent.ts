import type { Agent } from '../types/host';

export const needsYou = (a: Agent | null | undefined): boolean =>
  !!a && (a.kind === 'problem' || a.kind === 'decision');

export const progressText = (progress: string) => progress.replace('/', ' of ');
