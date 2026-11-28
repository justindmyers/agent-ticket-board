import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['scripts/test-setup.ts'],
    // Many tests run real git. On a busy machine, five seconds is too tight for the slow ones.
    testTimeout: 20000,
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/cli/src/**/*.test.ts',
      'apps/service/src/**/*.test.ts',
      'scripts/**/*.test.ts'
    ]
  }
});
