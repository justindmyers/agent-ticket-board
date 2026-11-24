// The reuse rule of every stage that plans or writes code. Agents tend to write a small helper or
// mock in place; most repositories already have one in their shared code or their test setup.

export const REUSE_RULES = [
  '- Reuse before you write. Before you add a helper, hook, util, component, type or test mock, search the',
  '  repository for one: its shared library, the shared-code docs and skills that its CLAUDE.md lists, its',
  '  test setup files (setupTests and the vitest config) and the code next to your change. Use what you find.',
  '- Do not mock a global that the test setup already provides (localStorage, matchMedia, ResizeObserver,',
  '  fetch). Read the test setup first. Use the shared test helpers and mocks of the repository.',
  '- Add a new helper only when nothing fits, and put it where the repository puts shared code, not in one file.'
];
