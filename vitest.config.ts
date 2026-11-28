import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['scripts/test-setup.ts'],
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/cli/src/**/*.test.ts',
      'apps/service/src/**/*.test.ts',
      'scripts/**/*.test.ts'
    ]
  }
});
