/**
 * The settings the bot may change on its own (`pet_set`), in two tiers:
 *
 * - `self`: its own looks and habits (figure and its picks, how much it walks about, how long it
 *   snores): changed at once;
 * - `ask`: what reaches the person's screen, ears or name (sounds, size, the dark/light look, the
 *   hover buttons, what it calls them): changed once they say yes in the bubble.
 *
 * Everything else (computer use, voice input, the microphone, statistics, the model) is not the
 * bot's to change. The person can take the whole of it back with `selfAdjust` on the Habits page.
 *
 * The change lines and errors are in the model-text language (`model-text.ts`).
 */
import type { DeepPartial } from 'cortico/world.ts';
import { MAX_HOVER_BUTTONS, PET_ACTIONS, SCALE_MAX, SCALE_MIN, hoverButtonList, type DesktopPetConfigSection } from './config.ts';
import type { ModelLanguage } from './model-text.ts';
import { COO, lookOf, lookPatch, modelName, type FigurePack } from './packs.ts';

export type Tier = 'self' | 'ask';

export interface SettingChange {
  key: string;
  tier: Tier;
  /** What changes, from what to what, for the bubble and the receipt. */
  say: string;
  patch: DeepPartial<DesktopPetConfigSection>;
}

const zh = {
  roam: { free: '常走动', calm: '多待着', off: '不乱动' } as Record<string, string>,
  theme: { dark: '夜间(浅色身体)', light: '白天(深色身体)' } as Record<string, string>,
  pick: (axis: string, option: string) => `${axis}:${option}`,
  picks: (words: string[]) => words.join(','),
  badFigure: (ids: string[], got: string) => `figure 应为 ${ids.join('、')} 之一,收到 ${got}`,
  figure: (from: string, to: string) => `形象 ${from} → ${to}`,
  figureMissing: (figure: string) => `现在的形象 ${figure} 没有装,不能换打扮`,
  badScheme: (pack: string, got: string) => `scheme 不是${pack}的预设或选项组合:${got}`,
  scheme: (pack: string, from: string | null, to: string) => `${pack}的打扮 ${from ?? '默认'} → ${to}`,
  badRoam: 'roam 应为 free、calm 或 off',
  roamTo: (from: string, to: string) => `走动 ${from} → ${to}`,
  badSnore: 'snoreSeconds 应为 0–3600 的整数',
  snore: (seconds: number) => `每次睡着打呼噜 ${seconds === 0 ? '一直打到醒' : `${seconds} 秒`}`,
  badSound: 'sound 应为 true 或 false',
  sound: (on: boolean) => `音效 ${on ? '打开' : '关掉'}`,
  badScale: `scale 应为 ${SCALE_MIN}–${SCALE_MAX} 的数`,
  scale: (from: number, to: number) => `在屏幕上的大小 ${from} 倍 → ${to} 倍`,
  badTheme: 'theme 应为 dark 或 light',
  themeTo: (to: string) => `换成${to}`,
  badHover: `hoverButtons 应为 1–${MAX_HOVER_BUTTONS} 个不重复的 ${PET_ACTIONS.join('、')}`,
  hover: (list: string[]) => `悬停按钮换成 ${list.join('、')}`,
  badUser: 'user 应为 1–20 个字',
  user: (from: string, to: string) => `对你的称呼「${from}」→「${to}」`,
  unknown: (key: string) => `${key} 不是你能改的设置`,
  /** An id with its name, for the dress list. */
  named: (id: string, name: string) => `${id}(${name})`,
  figures: (list: string[]) => `- figure:${list.join('、')}`,
  schemes: (pack: string, presets: string[], order: string | null, axes: string[]) =>
    `- ${pack} 的 scheme:预设 ${presets.join('、') || '无'}${order ? `;或按 ${order} 的顺序用 - 连起来的组合,${axes.join(';')}` : ''}`,
  axis: (name: string, options: string[]) => `${name}:${options.join('、')}`,
};

const en: typeof zh = {
  roam: { free: 'free', calm: 'calm', off: 'off' },
  theme: { dark: 'night (light body)', light: 'day (dark body)' },
  pick: (axis, option) => `${axis}: ${option}`,
  picks: (words) => words.join(', '),
  badFigure: (ids, got) => `figure must be one of ${ids.join(', ')}; got ${got}`,
  figure: (from, to) => `figure ${from} → ${to}`,
  figureMissing: (figure) => `the current figure ${figure} is not installed, so its dress cannot change`,
  badScheme: (pack, got) => `scheme is not a preset or option combination of ${pack}: ${got}`,
  scheme: (pack, from, to) => `${pack} dress ${from ?? 'default'} → ${to}`,
  badRoam: 'roam must be free, calm or off',
  roamTo: (from, to) => `walking ${from} → ${to}`,
  badSnore: 'snoreSeconds must be an integer from 0 to 3600',
  snore: (seconds) => `snoring in each sleep → ${seconds === 0 ? 'until waking' : `${seconds} s`}`,
  badSound: 'sound must be true or false',
  sound: (on) => `sound effects ${on ? 'on' : 'off'}`,
  badScale: `scale must be a number from ${SCALE_MIN} to ${SCALE_MAX}`,
  scale: (from, to) => `size on screen ${from}× → ${to}×`,
  badTheme: 'theme must be dark or light',
  themeTo: (to) => `theme → ${to}`,
  badHover: `hoverButtons must be 1–${MAX_HOVER_BUTTONS} distinct items of ${PET_ACTIONS.join(', ')}`,
  hover: (list) => `hover buttons → ${list.join(', ')}`,
  badUser: 'user must be 1–20 characters',
  user: (from, to) => `what I call you "${from}" → "${to}"`,
  unknown: (key) => `${key} is not a setting you can change`,
  named: (id, name) => (name === id ? id : `${id} (${name})`),
  figures: (list) => `- figure: ${list.join(', ')}`,
  schemes: (pack, presets, order, axes) =>
    `- scheme for ${pack}: presets ${presets.join(', ') || 'none'}${order ? `; or one option per axis joined with - in the order ${order}: ${axes.join('; ')}` : ''}`,
  axis: (name, options) => `${name}: ${options.join(', ')}`,
};

const SELF_TEXT: Record<ModelLanguage, typeof zh> = { zh, en };

/** The pack's pick named by `scheme`, as `axis:option` words; null when it picks nothing of the pack. */
export function pickWords(pack: FigurePack, scheme: string, language: ModelLanguage = 'zh'): string | null {
  const t = SELF_TEXT[language];
  const m = pack.manifest;
  const preset = m.presets.find((p) => p.id === scheme);
  const parts = scheme.split('-');
  const words: string[] = [];
  for (const [i, a] of m.axes.entries()) {
    const id = preset ? preset.pick[a.id] : parts[i];
    const o = a.options.find((x) => x.id === id);
    if (!o) return null;
    words.push(t.pick(modelName(a.name, a.id, language), modelName(o.name, o.id, language)));
  }
  if (!preset && parts.length !== m.axes.length) return null;
  return t.picks(words);
}

const figureName = (id: string, packs: readonly FigurePack[], language: ModelLanguage) => modelName(packs.find((p) => p.id === id)?.manifest.name, id, language);

/**
 * Checks what `pet_set` asks for against the current config; returns the changes, or why one
 * cannot be made. A value equal to the current one is left out.
 */
export function planSettings(args: Record<string, unknown>, cfg: DesktopPetConfigSection, packs: readonly FigurePack[], language: ModelLanguage = 'zh'):
  { changes: SettingChange[]; errors: string[] } {
  const t = SELF_TEXT[language];
  const changes: SettingChange[] = [];
  const errors: string[] = [];
  const skin = cfg.skin;
  // figure first: a scheme given with it is checked against the new figure
  let figure = skin.figure ?? COO;
  if ('figure' in args) {
    const v = args.figure;
    if (typeof v !== 'string' || !packs.some((p) => p.id === v)) errors.push(t.badFigure(packs.map((p) => p.id), JSON.stringify(v)));
    else if (v !== figure) {
      const pack = packs.find((p) => p.id === v)!;
      // a pack starts in its first pick; Coo keeps the one it had
      const scheme = pack.manifest.presets[0]?.id ?? pack.manifest.axes.map((a) => a.options[0]!.id).join('-');
      changes.push({ key: 'figure', tier: 'self', say: t.figure(figureName(figure, packs, language), figureName(v, packs, language)), patch: { skin: { figure: v, ...(v !== COO && !('scheme' in args) ? { scheme } : {}) } } });
      figure = v;
    }
  }
  if ('scheme' in args) {
    const v = args.scheme;
    const pack = packs.find((p) => p.id === figure);
    const words = pack && typeof v === 'string' ? pickWords(pack, v, language) : null;
    if (!pack) errors.push(t.figureMissing(figure));
    else if (!words) errors.push(t.badScheme(modelName(pack.manifest.name, pack.id, language), JSON.stringify(v)));
    else {
      const now = lookOf(pack, skin);
      if (v !== now || figure !== skin.figure) {
        const before = (skin.figure ?? COO) === figure ? pickWords(pack, now, language) : null;
        changes.push({ key: 'scheme', tier: 'self', say: t.scheme(modelName(pack.manifest.name, pack.id, language), before, words), patch: { skin: lookPatch(pack, v as string) } });
      }
    }
  }
  if ('roam' in args) {
    const v = args.roam;
    if (typeof v !== 'string' || !(v in t.roam)) errors.push(t.badRoam);
    else if (v !== cfg.roam) changes.push({ key: 'roam', tier: 'self', say: t.roamTo(t.roam[cfg.roam]!, t.roam[v]!), patch: { roam: v as DesktopPetConfigSection['roam'] } });
  }
  if ('snoreSeconds' in args) {
    const v = args.snoreSeconds;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3600) errors.push(t.badSnore);
    else if (v !== cfg.sounds.snoreSeconds) changes.push({ key: 'snoreSeconds', tier: 'self', say: t.snore(v), patch: { sounds: { snoreSeconds: v } } });
  }
  if ('sound' in args) {
    const v = args.sound;
    if (typeof v !== 'boolean') errors.push(t.badSound);
    else if (v !== cfg.sound) changes.push({ key: 'sound', tier: 'ask', say: t.sound(v), patch: { sound: v } });
  }
  if ('scale' in args) {
    const v = args.scale;
    if (typeof v !== 'number' || !(v >= SCALE_MIN && v <= SCALE_MAX)) errors.push(t.badScale);
    else {
      const s = Math.round(v * 20) / 20;
      if (s !== cfg.window.scale) changes.push({ key: 'scale', tier: 'ask', say: t.scale(cfg.window.scale, s), patch: { window: { scale: s } } });
    }
  }
  if ('theme' in args) {
    const v = args.theme;
    if (typeof v !== 'string' || !(v in t.theme)) errors.push(t.badTheme);
    else if (v !== cfg.theme) changes.push({ key: 'theme', tier: 'ask', say: t.themeTo(t.theme[v]!), patch: { theme: v as DesktopPetConfigSection['theme'] } });
  }
  if ('hoverButtons' in args) {
    const v = args.hoverButtons;
    const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const list = hoverButtonList(ids.join(','));
    if (!Array.isArray(v) || !list.length || list.length !== ids.length) errors.push(t.badHover);
    else if (list.join(',') !== cfg.hoverButtons) changes.push({ key: 'hoverButtons', tier: 'ask', say: t.hover(list), patch: { hoverButtons: list.join(',') } });
  }
  if ('user' in args) {
    const v = typeof args.user === 'string' ? args.user.trim() : '';
    if (!v || v.length > 20) errors.push(t.badUser);
    else if (v !== cfg.user) changes.push({ key: 'user', tier: 'ask', say: t.user(cfg.user, v), patch: { user: v } });
  }
  const known = new Set(['figure', 'scheme', 'roam', 'snoreSeconds', 'sound', 'scale', 'theme', 'hoverButtons', 'user']);
  for (const k of Object.keys(args)) if (!known.has(k)) errors.push(t.unknown(k));
  return { changes, errors };
}

/** What `pet_set` can pick from, for the bot's prompt: the figures and their picks. */
export function dressTable(packs: readonly FigurePack[], language: ModelLanguage = 'zh'): string {
  const t = SELF_TEXT[language];
  const lines = [t.figures(packs.map((p) => t.named(p.id, modelName(p.manifest.name, p.id, language))))];
  for (const p of packs) {
    const m = p.manifest;
    const presets = m.presets.map((x) => (x.name ? t.named(x.id, modelName(x.name, x.id, language)) : x.id));
    const axes = m.axes.map((a) => t.axis(modelName(a.name, a.id, language), a.options.map((o) => t.named(o.id, modelName(o.name, o.id, language)))));
    lines.push(t.schemes(p.id, presets, m.axes.length > 1 ? m.axes.map((a) => a.id).join('-') : null, axes));
  }
  return lines.join('\n');
}
