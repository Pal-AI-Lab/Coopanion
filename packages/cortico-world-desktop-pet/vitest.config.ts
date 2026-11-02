import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 开发期 `cortico/*` 指向主仓库锁定的框架源码。生产里这层由框架的
 * 模块钩子做,包内一行不改;别名与 tsconfig 的 `paths` 必须同步改。
 */
const FRAMEWORK_SRC = fileURLToPath(new URL('../../vendor/cortico/src/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^cortico\//, replacement: FRAMEWORK_SRC }],
  },
  // 框架 checkout 在本包目录之外,要显式放进 vite 的可服务范围,否则经 jsdom 那条
  // 路加载的框架前端模块会被当成不存在。
  server: {
    fs: { allow: [fileURLToPath(new URL('./', import.meta.url)), FRAMEWORK_SRC] },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // computer use's end-to-end tests move the real mouse: vitest.cua-e2e.config.ts
    exclude: ['tests/cua/e2e/**', 'node_modules/**'],
    // 控制台语言是按进程读一次的系统事实;测试断言中文文案,与跑测试的机器区域无关。
    env: { CORTICO_LANGUAGE: 'zh' },
    testTimeout: 20000,
    pool: 'forks',
    maxWorkers: 2,
  },
});
