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
 */
import type { DeepPartial } from 'cortico/world.ts';
import { MAX_HOVER_BUTTONS, PET_ACTIONS, SCALE_MAX, SCALE_MIN, hoverButtonList, type DesktopPetConfigSection } from './config.ts';
import { COO, lookOf, lookPatch, nameIn, type FigurePack } from './packs.ts';

export type Tier = 'self' | 'ask';

export interface SettingChange {
  key: string;
  tier: Tier;
  /** What changes, from what to what, for the bubble and the receipt. */
  say: string;
  patch: DeepPartial<DesktopPetConfigSection>;
}

const ROAM: Record<string, string> = { free: '常走动', calm: '多待着', off: '不乱动' };
const THEME: Record<string, string> = { dark: '夜间(浅色身体)', light: '白天(深色身体)' };

/** The pack's pick named by `scheme`, as `axis:option` words; null when it picks nothing of the pack. */
export function pickWords(pack: FigurePack, scheme: string): string | null {
  const m = pack.manifest;
  const preset = m.presets.find((p) => p.id === scheme);
  const parts = scheme.split('-');
  const words: string[] = [];
  for (const [i, a] of m.axes.entries()) {
    const id = preset ? preset.pick[a.id] : parts[i];
    const o = a.options.find((x) => x.id === id);
    if (!o) return null;
    words.push(`${nameIn(a.name)}:${nameIn(o.name)}`);
  }
  if (!preset && parts.length !== m.axes.length) return null;
  return words.join(',');
}

const figureName = (id: string, packs: readonly FigurePack[]) => nameIn(packs.find((p) => p.id === id)?.manifest.name ?? { zh: id });

/**
 * Checks what `pet_set` asks for against the current config; returns the changes, or why one
 * cannot be made. A value equal to the current one is left out.
 */
export function planSettings(args: Record<string, unknown>, cfg: DesktopPetConfigSection, packs: readonly FigurePack[]):
  { changes: SettingChange[]; errors: string[] } {
  const changes: SettingChange[] = [];
  const errors: string[] = [];
  const skin = cfg.skin;
  // figure first: a scheme given with it is checked against the new figure
  let figure = skin.figure ?? COO;
  if ('figure' in args) {
    const v = args.figure;
    if (typeof v !== 'string' || !packs.some((p) => p.id === v)) errors.push(`figure 应为 ${packs.map((p) => p.id).join('、')} 之一,收到 ${JSON.stringify(v)}`);
    else if (v !== figure) {
      const pack = packs.find((p) => p.id === v)!;
      // a pack starts in its first pick; Coo keeps the one it had
      const scheme = pack.manifest.presets[0]?.id ?? pack.manifest.axes.map((a) => a.options[0]!.id).join('-');
      changes.push({ key: 'figure', tier: 'self', say: `形象 ${figureName(figure, packs)} → ${figureName(v, packs)}`, patch: { skin: { figure: v, ...(v !== COO && !('scheme' in args) ? { scheme } : {}) } } });
      figure = v;
    }
  }
  if ('scheme' in args) {
    const v = args.scheme;
    const pack = packs.find((p) => p.id === figure);
    const words = pack && typeof v === 'string' ? pickWords(pack, v) : null;
    if (!pack) errors.push(`现在的形象 ${figure} 没有装,不能换打扮`);
    else if (!words) errors.push(`scheme 不是${nameIn(pack.manifest.name)}的预设或选项组合:${JSON.stringify(v)}`);
    else {
      const now = lookOf(pack, skin);
      if (v !== now || figure !== skin.figure) {
        const before = (skin.figure ?? COO) === figure ? pickWords(pack, now) : null;
        changes.push({ key: 'scheme', tier: 'self', say: `${nameIn(pack.manifest.name)}的打扮 ${before ?? '默认'} → ${words}`, patch: { skin: lookPatch(pack, v as string) } });
      }
    }
  }
  if ('roam' in args) {
    const v = args.roam;
    if (typeof v !== 'string' || !(v in ROAM)) errors.push('roam 应为 free、calm 或 off');
    else if (v !== cfg.roam) changes.push({ key: 'roam', tier: 'self', say: `走动 ${ROAM[cfg.roam]} → ${ROAM[v]}`, patch: { roam: v as DesktopPetConfigSection['roam'] } });
  }
  if ('snoreSeconds' in args) {
    const v = args.snoreSeconds;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3600) errors.push('snoreSeconds 应为 0–3600 的整数');
    else if (v !== cfg.sounds.snoreSeconds) changes.push({ key: 'snoreSeconds', tier: 'self', say: `每次睡着打呼噜 ${v === 0 ? '一直打到醒' : `${v} 秒`}`, patch: { sounds: { snoreSeconds: v } } });
  }
  if ('sound' in args) {
    const v = args.sound;
    if (typeof v !== 'boolean') errors.push('sound 应为 true 或 false');
    else if (v !== cfg.sound) changes.push({ key: 'sound', tier: 'ask', say: `音效 ${v ? '打开' : '关掉'}`, patch: { sound: v } });
  }
  if ('scale' in args) {
    const v = args.scale;
    if (typeof v !== 'number' || !(v >= SCALE_MIN && v <= SCALE_MAX)) errors.push(`scale 应为 ${SCALE_MIN}–${SCALE_MAX} 的数`);
    else {
      const s = Math.round(v * 20) / 20;
      if (s !== cfg.window.scale) changes.push({ key: 'scale', tier: 'ask', say: `在屏幕上的大小 ${cfg.window.scale} 倍 → ${s} 倍`, patch: { window: { scale: s } } });
    }
  }
  if ('theme' in args) {
    const v = args.theme;
    if (typeof v !== 'string' || !(v in THEME)) errors.push('theme 应为 dark 或 light');
    else if (v !== cfg.theme) changes.push({ key: 'theme', tier: 'ask', say: `换成${THEME[v]}`, patch: { theme: v as DesktopPetConfigSection['theme'] } });
  }
  if ('hoverButtons' in args) {
    const v = args.hoverButtons;
    const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const list = hoverButtonList(ids.join(','));
    if (!Array.isArray(v) || !list.length || list.length !== ids.length) errors.push(`hoverButtons 应为 1–${MAX_HOVER_BUTTONS} 个不重复的 ${PET_ACTIONS.join('、')}`);
    else if (list.join(',') !== cfg.hoverButtons) changes.push({ key: 'hoverButtons', tier: 'ask', say: `悬停按钮换成 ${list.join('、')}`, patch: { hoverButtons: list.join(',') } });
  }
  if ('user' in args) {
    const v = typeof args.user === 'string' ? args.user.trim() : '';
    if (!v || v.length > 20) errors.push('user 应为 1–20 个字');
    else if (v !== cfg.user) changes.push({ key: 'user', tier: 'ask', say: `对你的称呼「${cfg.user}」→「${v}」`, patch: { user: v } });
  }
  const known = new Set(['figure', 'scheme', 'roam', 'snoreSeconds', 'sound', 'scale', 'theme', 'hoverButtons', 'user']);
  for (const k of Object.keys(args)) if (!known.has(k)) errors.push(`${k} 不是你能改的设置`);
  return { changes, errors };
}

/** What `pet_set` can pick from, for the bot's prompt: the figures and their picks. */
export function dressTable(packs: readonly FigurePack[]): string {
  const lines = ['- figure:' + packs.map((p) => `${p.id}(${nameIn(p.manifest.name)})`).join('、')];
  for (const p of packs) {
    const m = p.manifest;
    const presets = m.presets.map((x) => `${x.id}${x.name ? `(${nameIn(x.name)})` : ''}`).join('、');
    const axes = m.axes.map((a) => `${nameIn(a.name)}:${a.options.map((o) => `${o.id}(${nameIn(o.name)})`).join('、')}`).join(';');
    lines.push(`- ${p.id} 的 scheme:预设 ${presets || '无'}${m.axes.length > 1 ? `;或按 ${m.axes.map((a) => a.id).join('-')} 的顺序用 - 连起来的组合,${axes}` : ''}`);
  }
  return lines.join('\n');
}
