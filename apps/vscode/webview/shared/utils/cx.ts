import { twMerge } from 'tailwind-merge';

export const cx = (...c: (string | false | null | undefined)[]) =>
  twMerge(c.filter(Boolean).join(' '));
