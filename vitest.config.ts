import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** `cortico/*` resolves to the vendored Cortico sources, as tsconfig.json says. */
const CORTICO_SRC = fileURLToPath(new URL('./vendor/cortico/src/', import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^cortico\//, replacement: CORTICO_SRC }] },
  test: {
    include: ['tests/**/*.test.ts', 'packages/cortico-provider-coo/tests/**/*.test.ts'],
    env: { CORTICO_LANGUAGE: 'zh' },
    testTimeout: 20000,
    pool: 'forks',
  },
});
