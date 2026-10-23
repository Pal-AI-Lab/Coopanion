import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Run bundled World regressions against the framework pinned by this application.
export default defineConfig({
  resolve: { alias: [{ find: /^cortico\//, replacement: fileURLToPath(new URL('./vendor/cortico/src/', import.meta.url)) }] },
  test: {
    include: ['packages/cortico-world-desktop-pet/tests/**/*.test.ts'],
    exclude: ['**/tests/cua/e2e/**', '**/node_modules/**'],
    env: { CORTICO_LANGUAGE: 'zh' },
    testTimeout: 20000,
    // a busy Windows runner takes longer than the 1 s default to reach what a poll waits for
    expect: { poll: { timeout: 10_000 } },
    pool: 'forks',
    maxWorkers: 2,
    minWorkers: 1,
  },
});
