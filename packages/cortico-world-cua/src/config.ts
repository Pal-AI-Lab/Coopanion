/** Config section `worlds.cua`, defaults and the console config group. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { WorldSection } from 'cortico/world.ts';

export const CUA_ID = 'cua';

/**
 * When the person is asked before the bot uses the computer, from strictest to loosest:
 * - ask-each-turn: every turn, before the first screenshot, window list or input;
 * - ask-before-acting: screenshots and the window list are free; every turn, before the first input;
 * - ask-once: screenshots and the window list are free; before an input, and a yes holds for `grantMinutes`;
 * - never-ask: never.
 */
export const PERMISSION_LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export interface CuaConfigSection extends WorldSection {
  /** false: screenshots and the window list only; every input tool fails with that reason. */
  control: boolean;
  /** See PERMISSION_LEVELS. */
  permission: PermissionLevel;
  /** ask-once: how long a yes holds. */
  grantMinutes: number;
  screenshot: {
    maxWidth: number;
    maxHeight: number;
    /** JPEG quality, 1–100. */
    quality: number;
    /** Input tools attach a screenshot unless the call says otherwise. */
    afterAction: boolean;
    /** Wait after an action before taking its screenshot. */
    settleMs: number;
  };
  /** Before sending input, the user must have left mouse and keyboard alone this long. */
  userIdleMs: number;
  /** How long an input tool waits for that before giving up. */
  maxYieldWaitMs: number;
  /** Pause between 16-character chunks while typing. */
  typeChunkDelayMs: number;
}

export const CUA_DEFAULTS: CuaConfigSection = {
  enabled: false,
  control: true,
  permission: 'ask-once',
  grantMinutes: 30,
  screenshot: { maxWidth: 1280, maxHeight: 800, quality: 75, afterAction: true, settleMs: 500 },
  userIdleMs: 2000,
  maxYieldWaitMs: 15_000,
  typeChunkDelayMs: 20,
};

const K = `worlds.${CUA_ID}`;

export const CUA_CONFIG_GROUP: ConfigGroup = {
  id: `world:${CUA_ID}`,
  owner: `world:${CUA_ID}`,
  schema: {
    type: 'object',
    title: '电脑操作',
    properties: {
      [`${K}.control`]: { type: 'boolean', title: '允许操作鼠标键盘', description: '关掉后只能截图和列窗口。', 'x-hot': true },
      [`${K}.permission`]: {
        type: 'string', title: '什么时候先问你', enum: [...PERMISSION_LEVELS], 'x-hot': true,
        description: 'ask-each-turn:每一轮看屏幕或动手前都问;ask-before-acting:看屏幕不问,每一轮动鼠标键盘前问;ask-once:看屏幕不问,动鼠标键盘前问一次,同意后「同意管多久」内不再问;never-ask:都不问。',
      },
      [`${K}.grantMinutes`]: { type: 'integer', title: '同意管多久', minimum: 1, maximum: 1440, 'x-suffix': '分钟', description: '只对 ask-once 有效。', 'x-hot': true },
      [`${K}.userIdleMs`]: { type: 'integer', title: '让位时长', minimum: 0, maximum: 30000, 'x-suffix': 'ms', description: '你动过鼠标或键盘后,要静止这么久才继续操作。', 'x-hot': true },
      [`${K}.maxYieldWaitMs`]: { type: 'integer', title: '让位最多等待', minimum: 0, maximum: 120000, 'x-suffix': 'ms', 'x-hot': true },
      [`${K}.screenshot.maxWidth`]: { type: 'integer', title: '截图最大宽', minimum: 320, maximum: 3840, 'x-suffix': 'px', 'x-hot': true },
      [`${K}.screenshot.maxHeight`]: { type: 'integer', title: '截图最大高', minimum: 240, maximum: 2160, 'x-suffix': 'px', 'x-hot': true },
      [`${K}.screenshot.quality`]: { type: 'integer', title: '截图质量', minimum: 30, maximum: 95, 'x-hot': true },
      [`${K}.screenshot.afterAction`]: { type: 'boolean', title: '操作后附截图', 'x-hot': true },
      [`${K}.screenshot.settleMs`]: { type: 'integer', title: '截图前等待', minimum: 0, maximum: 5000, 'x-suffix': 'ms', 'x-hot': true },
    },
  },
};
