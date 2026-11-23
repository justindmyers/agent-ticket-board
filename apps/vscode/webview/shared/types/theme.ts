import type { PALETTE } from '../utils/palette';

export type Theme = 'dark' | 'light' | 'hc';

export type Accent = keyof typeof PALETTE;
