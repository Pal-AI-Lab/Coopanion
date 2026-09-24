import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Run bundled World regressions against the framework pinned by this application.
export default defineConfig({
  resolve: { alias: [{ find: /^cortico\//, replacement: fileURLToPath(new URL('./vendor/cortico/src/', import.meta.url)) }] },
  test: {
    include: ['packages/cortico-world-{desktop-pet,cua}/tests/**/*.test.ts'],
    exclude: ['**/tests/e2e/**', '**/node_modules/**'],
    env: { CORTICO_LANGUAGE: 'zh' },
    testTimeout: 20000,
    pool: 'forks',
    maxWorkers: 2,
    minWorkers: 1,
  },
});
