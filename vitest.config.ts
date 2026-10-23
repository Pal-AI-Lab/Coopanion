import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** `cortico/*` resolves to the vendored Cortico sources, as tsconfig.json says. */
const CORTICO_SRC = fileURLToPath(new URL('./vendor/cortico/src/', import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^cortico\//, replacement: CORTICO_SRC }] },
  // what scripts/stage.ts defines when it builds the settings window (console/app-version.ts)
  define: { COOPANION_VERSION: JSON.stringify('0.0.0'), COOPANION_CHANNEL: JSON.stringify('github') },
  test: {
    setupFiles: ['tests/setup/jsdom-storage.ts'],
    include: ['tests/**/*.test.{ts,js}', 'packages/cortico-provider-coo/tests/**/*.test.ts'],
    env: { CORTICO_LANGUAGE: 'zh' },
    testTimeout: 20000,
    // a busy Windows runner takes longer than the 1 s default to reach what a poll waits for
    expect: { poll: { timeout: 10_000 } },
    pool: 'forks',
  },
});
