/**
 * The settings the bot may change on its own (`pet_set`), each in one of two tiers:
 *
 * - `self`: changed at once;
 * - `ask`: changed once the person says yes in the bubble.
 *
 * Which item is in which tier is the person's `selfAdjust` (config.ts `directSettings`): by default the
 * bot's own looks and habits (figure and its picks, how much it walks about, how long it snores) are
 * `self`, and what reaches the person's screen, ears or name (sounds, size, the dark/light look, the
 * hover buttons, what it calls them) is `ask`; on the Habits page they can make every item `self`,
 * pick per item, or take the whole of it back.
 *
 * Everything else (computer use, voice input, the microphone, statistics, the model) is not the
 * bot's to change.
 *
 * The change lines and errors are in the model-text language (`model-text.ts`); each change is also
 * said in the app language (`show`, from `consent` in src/i18n) for the bubble that asks the person.
 */
import type { Language } from 'cortico/core/language.ts';
import type { DeepPartial } from 'cortico/world.ts';
import { MAX_HOVER_BUTTONS, PET_ACTIONS, SCALE_MAX, SCALE_MIN, USER_MAX, directSettings, hoverButtonList, type DesktopPetConfigSection, type SelfKey } from './config.ts';
import { charCount, petText } from './i18n/index.ts';
import type { ModelLanguage } from './model-text.ts';
import { COO, lookOf, lookPatch, modelName, nameIn, type FigurePack } from './packs.ts';

export type Tier = 'self' | 'ask';

export interface SettingChange {
  key: SelfKey;
  tier: Tier;
  /** What changes, from what to what, for the receipt. */
  say: string;
  /** What changes, in the app language, for the bubble that asks the person. */
  show: string;
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
  badUser: (max: number) => `user 应为 1–${max} 个字`,
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
  badUser: (max) => `user must be 1–${max} characters`,
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
  return pickNames(pack, scheme, (n, id) => modelName(n, id, language), t.pick, t.picks);
}

/** `pickWords` with the names and the joining of a language. */
function pickNames(pack: FigurePack, scheme: string, name: (n: Record<string, string> | undefined, id: string) => string,
  pick: (axis: string, option: string) => string, picks: (words: string[]) => string): string | null {
  const m = pack.manifest;
  const preset = m.presets.find((p) => p.id === scheme);
  const parts = scheme.split('-');
  const words: string[] = [];
  for (const [i, a] of m.axes.entries()) {
    const id = preset ? preset.pick[a.id] : parts[i];
    const o = a.options.find((x) => x.id === id);
    if (!o) return null;
    words.push(pick(name(a.name, a.id), name(o.name, o.id)));
  }
  if (!preset && parts.length !== m.axes.length) return null;
  return picks(words);
}

const figureName = (id: string, packs: readonly FigurePack[], language: ModelLanguage) => modelName(packs.find((p) => p.id === id)?.manifest.name, id, language);

/**
 * Checks what `pet_set` asks for against the current config; returns the changes, each in the tier the
 * person's `selfAdjust` puts it, or why one cannot be made. A value equal to the current one is left out.
 * `userMax`: the longest name for the person, in characters as seen.
 */
export function planSettings(args: Record<string, unknown>, cfg: DesktopPetConfigSection, packs: readonly FigurePack[], language: ModelLanguage = 'zh', userMax = USER_MAX,
  appLanguage: Language = 'zh'): { changes: SettingChange[]; errors: string[] } {
  const t = SELF_TEXT[language];
  const a = petText(appLanguage).consent;
  const direct = directSettings(cfg);
  const tier = (key: SelfKey): Tier => (direct[key] ? 'self' : 'ask');
  const shown = (n: Record<string, string> | undefined, id: string) => (n ? nameIn(n, appLanguage) : id);
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
      changes.push({ key: 'figure', tier: tier('figure'), say: t.figure(figureName(figure, packs, language), figureName(v, packs, language)), show: a.figure(shown(pack.manifest.name, v)), patch: { skin: { figure: v, ...(v !== COO && !('scheme' in args) ? { scheme } : {}) } } });
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
        const look = pickNames(pack, v as string, shown, a.pick, a.list) ?? (v as string);
        changes.push({ key: 'scheme', tier: tier('scheme'), say: t.scheme(modelName(pack.manifest.name, pack.id, language), before, words), show: a.scheme(shown(pack.manifest.name, pack.id), look), patch: { skin: lookPatch(pack, v as string) } });
      }
    }
  }
  if ('roam' in args) {
    const v = args.roam;
    if (typeof v !== 'string' || !(v in t.roam)) errors.push(t.badRoam);
    else if (v !== cfg.roam) changes.push({ key: 'roam', tier: tier('roam'), say: t.roamTo(t.roam[cfg.roam]!, t.roam[v]!), show: a.roamTo(a.roam[v as 'free']), patch: { roam: v as DesktopPetConfigSection['roam'] } });
  }
  if ('snoreSeconds' in args) {
    const v = args.snoreSeconds;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3600) errors.push(t.badSnore);
    else if (v !== cfg.sounds.snoreSeconds) changes.push({ key: 'snoreSeconds', tier: tier('snoreSeconds'), say: t.snore(v), show: a.snore(v), patch: { sounds: { snoreSeconds: v } } });
  }
  if ('sound' in args) {
    const v = args.sound;
    if (typeof v !== 'boolean') errors.push(t.badSound);
    else if (v !== cfg.sound) changes.push({ key: 'sound', tier: tier('sound'), say: t.sound(v), show: a.sound(v), patch: { sound: v } });
  }
  if ('scale' in args) {
    const v = args.scale;
    if (typeof v !== 'number' || !(v >= SCALE_MIN && v <= SCALE_MAX)) errors.push(t.badScale);
    else {
      const s = Math.round(v * 20) / 20;
      if (s !== cfg.window.scale) changes.push({ key: 'scale', tier: tier('scale'), say: t.scale(cfg.window.scale, s), show: a.scale(cfg.window.scale, s), patch: { window: { scale: s } } });
    }
  }
  if ('theme' in args) {
    const v = args.theme;
    if (typeof v !== 'string' || !(v in t.theme)) errors.push(t.badTheme);
    else if (v !== cfg.theme) changes.push({ key: 'theme', tier: tier('theme'), say: t.themeTo(t.theme[v]!), show: a.theme[v as 'dark'], patch: { theme: v as DesktopPetConfigSection['theme'] } });
  }
  if ('hoverButtons' in args) {
    const v = args.hoverButtons;
    const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const list = hoverButtonList(ids.join(','));
    if (!Array.isArray(v) || !list.length || list.length !== ids.length) errors.push(t.badHover);
    else if (list.join(',') !== cfg.hoverButtons) changes.push({ key: 'hoverButtons', tier: tier('hoverButtons'), say: t.hover(list), show: a.hover(a.list(list.map((id) => a.actions[id]))), patch: { hoverButtons: list.join(',') } });
  }
  if ('user' in args) {
    const v = typeof args.user === 'string' ? args.user.trim() : '';
    if (!v || charCount(v) > userMax) errors.push(t.badUser(userMax));
    else if (v !== cfg.user) changes.push({ key: 'user', tier: tier('user'), say: t.user(cfg.user, v), show: a.user(v), patch: { user: v } });
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
