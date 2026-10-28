/**
 * Figure packs: the pet's body, as a directory with a `figure.json` manifest. Coo is one, built in
 * (`web/coo/`), and so is the whale maid (`web/whale/`).
 *
 * A pack's code runs only inside the sandboxed figure frame (`web/figure-frame.html`): an opaque
 * origin that may fetch only its own pack's files (an installed pack's), talking to the pet page by `postMessage` alone. The body there is
 * the pack's own (walking, falling, faces, drawing; most packs build it on the kit, `web/kit/body.js`).
 * What the World and the pages need without running it is in the manifest: names, the dress-up axes
 * and presets, what the bot is told the body looks like, the words it does (`vocab`, the whole of the
 * bot's vocabulary while it is on), its own sound files and voice, whether it walks, the targets of its own
 * `pet_move_to` takes (`moves`), the data about the desktop it asks the window for (`needs`), how far its
 * effects reach past its box (`effects`) and its bubbles' colours (`bubble`).
 *
 * The embedding app names directories whose subdirectories are more packs (`packRoots`). A built-in
 * id wins over an installed pack with the same id, and `coo` is only ever the built-in one.
 *
 * `skin.figure` is the pack id, `skin.scheme` the picked option of each axis joined by `-` in the
 * manifest's axis order (one axis: the option id), or a preset id. Coo keeps its picks in the skin's
 * own fields, one per axis (`lookOf`, `lookPatch`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Language } from 'cortico/core/language.ts';
import type { ModelLanguage } from './model-text.ts';
import { INLINE_TAG_MAX, type VocabWord } from './script.ts';
import { petText, type PetText } from './i18n/index.ts';

type PackText = PetText['packs'];

export const MANIFEST_FILE = 'figure.json';
/**
 * The manifest version this World reads packs as, and the figure frame's contract (`web/figure-frame.js`).
 * A pack made for an older version keeps loading (README, 形象包兼容承诺): the version that replaces one of
 * these brings the older manifest up to it in `readManifest` and keeps running the older contract in the frame.
 * The oldest ones are where that promise starts; they never go up.
 */
export const MANIFEST_VERSION = 2;
export const FIGURE_API = 2;
export const MANIFEST_OLDEST = 2;
export const FIGURE_API_OLDEST = 2;
/** The built-in body, and the one shown when the skin names a pack that is not there. */
export const COO = 'coo';
/** Kinds a pack's own sounds are filed under, as web/sound.js mutes them (BODY_SOUND_KINDS). */
export const PACK_SOUND_KINDS = ['move', 'touch', 'face', 'snore', 'talk'] as const;
/** Data about the desktop a pack may ask for: `windows`, the windows on the pet's display and their visible top edges. */
export const PACK_NEEDS = ['windows'] as const;
/** The range of `voice.pitch`, and of `effects.reach` in 256-unit squares. */
export const VOICE_PITCH = { min: .5, max: 2 } as const;
export const EFFECTS_REACH_MAX = 2;
/** Most targets a pack declares, and most numbers one of them takes. */
export const MOVES_MAX = 8;
export const MOVE_PARAMS_MAX = 2;
/** What `pet_move_to` takes as a target of its own; a pack's target cannot be one of these or a number. */
export const DEFAULT_TARGETS = ['left', 'center', 'right', 'cursor'] as const;
/** Audio files every platform's Chromium decodes. */
const AUDIO = new Set(['.ogg', '.mp3', '.wav']);

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Option ids are joined with `-` into `skin.scheme`, so they cannot hold one. */
const OPTION_ID = /^[a-z0-9]{1,24}$/;

export type Names = Record<string, string>;

export interface FigureAxis {
  id: string;
  name: Names;
  options: Array<{ id: string; name: Names; thumb?: string; accent?: string }>;
}

/** The settings window's colours for a preset, see core/console-theme.ts in Coopanion. */
export interface ConsoleHues { a: string; a2: string; on: string; t: string; c3: string; c4: string }

export interface FigurePreset {
  id: string;
  /** The option of each axis. */
  pick: Record<string, string>;
  name?: Names;
  /** Colours the sleep z's and the listening and thinking marks. */
  accent?: string;
  console?: { light: ConsoleHues; dark: ConsoleHues };
  /** The bubbles' colours while this preset is on, over the pack's own. */
  bubble?: BubbleTheme;
}

/** A bubble's colours (hex): its fill, its text, and its outline with the tail. */
export interface BubbleColors { fill: string; text: string; line: string }
/** The bot's bubbles in each of the pet's themes; the lines the person said keep the page's. */
export interface BubbleTheme { light: BubbleColors; dark: BubbleColors }

/** How the body talks: `pitch` scales the page's babble and the speed its own `talk` sounds play at. */
export interface PackVoice { pitch: number }

export interface PackSound {
  /** Relative to the pack. */
  file: string;
  kind: typeof PACK_SOUND_KINDS[number];
  /** 0–1, times the page's volume. */
  volume: number;
}

/** A number a pack's target takes: `pet_move_to` refuses one outside min–max. */
export interface MoveParam {
  id: string;
  /** What it sets, for the bot, by language. */
  about: Names;
  min: number;
  max: number;
}

/** A target of the pack's own for `pet_move_to`; the World checks the call against it and the body does the rest. */
export interface MoveTarget {
  id: string;
  name: Names;
  /** Where it goes and how, for the bot, by language. */
  about: Names;
  params: MoveParam[];
}

export interface FigureManifest {
  manifest: number;
  api: number;
  id: string;
  version: string;
  name: Names;
  /** What the body looks like, for the bot's prompt, by language. */
  about: Names;
  author?: string;
  license?: string;
  credits?: Array<{ role: string; name: string; url?: string }>;
  /** The module the frame imports, relative to the pack, and the factory it exports. */
  entry: string;
  export: string;
  /** JSON handed to the factory as `opts.model`, relative to the pack. */
  model?: string;
  thumb?: string;
  axes: FigureAxis[];
  presets: FigurePreset[];
  /** The words the bot may use while this body is on: every expression and motion it does. */
  vocab: VocabWord[];
  /** Its own sound files by name; the body asks for them, the page plays them. */
  sounds: Record<string, PackSound>;
  /** `walk`: whether it walks to the default targets of `pet_move_to`. */
  can: { walk: boolean };
  moves: MoveTarget[];
  /** What the page passes its body beyond the stage's size (`host.bounds()`); the window reads none of it for a pack that does not ask. */
  needs: Array<typeof PACK_NEEDS[number]>;
  voice: PackVoice;
  /** `reach`: how far past the body's box its effects are drawn, in 256-unit squares at its scale, each side. */
  effects: { reach: number };
  bubble?: BubbleTheme;
}

export interface FigurePack {
  id: string;
  dir: string;
  /** URL path the pages load the pack's files from, ending in `/`. */
  base: string;
  builtin: boolean;
  manifest: FigureManifest;
}

const namesOf = (v: unknown): Names | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Names = {};
  for (const [k, s] of Object.entries(v)) if (typeof s === 'string' && s.trim()) out[k] = s.trim();
  return Object.keys(out).length ? out : null;
};
/** A path inside the pack: relative, no `..`, none of `<>"` or a control character (no Windows file name holds them). */
const inside = (p: unknown): p is string => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.split(/[\\/]/).includes('..') && !/^[a-z]+:/i.test(p)
  && !/[<>"\x00-\x1f]/.test(p);
/** Characters that end a word in a script's markers (script.ts): a name holding one could never be written. */
const NAME_BREAK = /[,，、\s【】<>＜＞]/;
const WORD_KINDS = new Set(['expression', 'motion']);
const SOUND_NAME = /^[a-z][a-zA-Z0-9-]{0,31}$/;
const PARAM_ID = /^[a-z][a-zA-Z0-9]{0,23}$/;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `raw` as bubble colours, or undefined when it is not one whole set of hex colours per theme (left out, as a bad accent is). */
function bubbleOf(raw: unknown): BubbleTheme | undefined {
  const theme = (v: unknown): BubbleColors | null => {
    const c = v as Record<string, unknown> | null;
    return c && typeof c === 'object' && [c.fill, c.text, c.line].every((h) => typeof h === 'string' && HEX.test(h))
      ? { fill: c.fill as string, text: c.text as string, line: c.line as string } : null;
  };
  const r = raw as Record<string, unknown> | null;
  const light = theme(r?.light), dark = theme(r?.dark);
  return light && dark ? { light, dark } : undefined;
}
/** A number in [min, max], else `fallback`. */
const within = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && v >= min && v <= max ? v : fallback);

/** The vocabulary in `raw`, checked; a string says what is wrong with it. A word of a kind this version does not know is left out and named in `skipped`. */
function readVocab(raw: unknown, skipped: string[], t: PackText): VocabWord[] | string {
  if (!Array.isArray(raw)) return t.vocabNotArray;
  const out: VocabWord[] = [];
  const taken = new Set<string>();
  for (const w of raw as Array<Record<string, unknown>>) {
    const id = w?.id;
    if (typeof id !== 'string' || !ID.test(id)) return t.badWordId(JSON.stringify(id));
    if (!WORD_KINDS.has(w.kind as string)) { skipped.push(t.unknownKind(id, JSON.stringify(w.kind))); continue; }
    const names: Record<string, string[]> = {};
    for (const [lang, list] of Object.entries((w.names ?? {}) as Record<string, unknown>)) {
      if (!Array.isArray(list)) return t.namesNotArray(id, lang);
      for (const n of list) {
        // longer than an inline marker holds, a name would be read as text there
        if (typeof n !== 'string' || !n.trim() || n.length > INLINE_TAG_MAX || NAME_BREAK.test(n)) return t.badWordName(id, JSON.stringify(n));
      }
      names[lang] = list as string[];
    }
    for (const n of [id, ...Object.values(names).flat()]) {
      if (taken.has(n)) return t.nameTaken(n);
      taken.add(n);
    }
    const about = namesOf(w.about);
    if (!about) return t.noWordAbout(id);
    if (typeof w.seconds !== 'number' || !(w.seconds > 0) || !Number.isFinite(w.seconds)) return t.badSeconds(id);
    out.push({ id, kind: w.kind as VocabWord['kind'], names, about, seconds: w.seconds, ...(w.lasting === true ? { lasting: true } : {}) });
  }
  return out;
}

/**
 * The sounds in `raw`, checked; a string says what is wrong with them. A sound whose file is not there, or
 * whose file type or kind this version does not know, is left out and named in `skipped`.
 */
function readSounds(raw: unknown, dir: string, skipped: string[], t: PackText): Record<string, PackSound> | string {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return t.soundsNotObject;
  const out: Record<string, PackSound> = {};
  for (const [name, d] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!SOUND_NAME.test(name)) return t.badSoundName(JSON.stringify(name));
    if (!inside(d?.file)) return t.badSoundFile(name);
    if (d.volume !== undefined && (typeof d.volume !== 'number' || !(d.volume >= 0 && d.volume <= 1))) return t.badVolume(name);
    if (!AUDIO.has(extname(d.file).toLowerCase())) { skipped.push(t.soundType(name, d.file)); continue; }
    if (!PACK_SOUND_KINDS.includes(d.kind as PackSound['kind'])) { skipped.push(t.soundKind(name, JSON.stringify(d.kind), PACK_SOUND_KINDS)); continue; }
    if (!existsSync(join(dir, d.file))) { skipped.push(t.soundMissing(name, d.file)); continue; }
    out[name] = { file: d.file, kind: d.kind as PackSound['kind'], volume: (d.volume as number | undefined) ?? 1 };
  }
  return out;
}

/** The targets in `raw`, checked; a string says what is wrong with them. */
function readMoves(raw: unknown, t: PackText): MoveTarget[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return t.movesNotArray;
  if (raw.length > MOVES_MAX) return t.tooManyMoves(MOVES_MAX);
  const out: MoveTarget[] = [];
  for (const m of raw as Array<Record<string, unknown>>) {
    const id = m?.id;
    if (typeof id !== 'string' || !ID.test(id) || (DEFAULT_TARGETS as readonly string[]).includes(id) || Number.isFinite(Number(id))) return t.badMoveId(JSON.stringify(id));
    if (out.some((o) => o.id === id)) return t.moveTaken(id);
    const name = namesOf(m.name), about = namesOf(m.about);
    if (!name || !about) return t.noMoveText(id);
    const params: MoveParam[] = [];
    const list = m.params ?? [];
    if (!Array.isArray(list) || list.length > MOVE_PARAMS_MAX) return t.badMoveParams(id, MOVE_PARAMS_MAX);
    for (const p of list as Array<Record<string, unknown>>) {
      const pa = namesOf(p?.about);
      if (typeof p?.id !== 'string' || !PARAM_ID.test(p.id) || params.some((q) => q.id === p.id) || !pa
        || typeof p.min !== 'number' || typeof p.max !== 'number' || !Number.isFinite(p.min) || !Number.isFinite(p.max) || !(p.min < p.max)) return t.badMoveParams(id, MOVE_PARAMS_MAX);
      params.push({ id: p.id, about: pa, min: p.min, max: p.max });
    }
    out.push({ id, name, about, params });
  }
  return out;
}

/** The data asked for in `raw`, checked; what this version does not provide is left out and named in `skipped`. */
function readNeeds(raw: unknown, skipped: string[], t: PackText): FigureManifest['needs'] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return t.needsNotArray;
  const out: FigureManifest['needs'] = [];
  for (const n of raw) {
    if ((PACK_NEEDS as readonly unknown[]).includes(n)) { if (!out.includes(n)) out.push(n); } else skipped.push(t.unknownNeed(JSON.stringify(n)));
  }
  return out;
}

/**
 * The manifest at `dir`, checked; a string says what is wrong with it. `builtin`: one of the package's own
 * (only those may be `coo`). What a newer version may add, and this one does not know (a word's kind, a sound's
 * kind or file type, a value of `can` or `needs`), is left out and named in `skipped` with the sound files that are not
 * there; the pack loads without it. Unknown fields are not read at all. What is wrong is said in the words of `t`.
 */
export function readManifest(dir: string, builtin = false, skipped: string[] = [], t: PackText = petText().packs): FigureManifest | string {
  const file = join(dir, MANIFEST_FILE);
  if (!existsSync(file)) return t.noManifest(MANIFEST_FILE);
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; } catch (err) { return t.badJson(MANIFEST_FILE, (err as Error).message); }
  for (const [key, oldest, now] of [['manifest', MANIFEST_OLDEST, MANIFEST_VERSION], ['api', FIGURE_API_OLDEST, FIGURE_API]] as const) {
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isInteger(v)) return t.notInteger(key, JSON.stringify(v));
    if (v > now) return t.tooNew(key, v, now);
    if (v < oldest) return t.tooOld(key, v, oldest);
  }
  if (typeof raw.id !== 'string' || !ID.test(raw.id) || (raw.id === COO && !builtin)) return t.badId(JSON.stringify(raw.id));
  const name = namesOf(raw.name), about = namesOf(raw.about);
  if (!name) return t.noName;
  if (!about) return t.noAbout;
  if (!inside(raw.entry) || typeof raw.export !== 'string' || !raw.export) return t.badEntry;
  if (raw.model !== undefined && !inside(raw.model)) return t.badModel;
  if (raw.thumb !== undefined && !inside(raw.thumb)) return t.badThumb;
  const axes: FigureAxis[] = [];
  for (const a of Array.isArray(raw.axes) ? raw.axes as Array<Record<string, unknown>> : []) {
    const an = namesOf(a?.name);
    if (typeof a?.id !== 'string' || !ID.test(a.id) || !an || !Array.isArray(a.options) || !a.options.length) return t.badAxis(JSON.stringify(a?.id));
    const options: FigureAxis['options'] = [];
    for (const o of a.options as Array<Record<string, unknown>>) {
      const on = namesOf(o?.name);
      if (typeof o?.id !== 'string' || !OPTION_ID.test(o.id) || !on || (o.thumb !== undefined && !inside(o.thumb))) return t.badOption(a.id, JSON.stringify(o?.id));
      options.push({ id: o.id, name: on, ...(o.thumb ? { thumb: o.thumb as string } : {}), ...(typeof o.accent === 'string' ? { accent: o.accent } : {}) });
    }
    axes.push({ id: a.id, name: an, options });
  }
  const presets: FigurePreset[] = [];
  for (const p of Array.isArray(raw.presets) ? raw.presets as Array<Record<string, unknown>> : []) {
    const pick = p?.pick as Record<string, unknown> | undefined;
    if (typeof p?.id !== 'string' || !ID.test(p.id) || !pick || typeof pick !== 'object') return t.badPreset(JSON.stringify(p?.id));
    for (const a of axes) if (!a.options.some((o) => o.id === pick[a.id])) return t.presetMissing(p.id, a.id);
    presets.push({
      id: p.id, pick: Object.fromEntries(axes.map((a) => [a.id, pick[a.id] as string])),
      ...(namesOf(p.name) ? { name: namesOf(p.name)! } : {}),
      ...(typeof p.accent === 'string' ? { accent: p.accent } : {}),
      ...(p.console && typeof p.console === 'object' ? { console: p.console as FigurePreset['console'] } : {}),
      ...(bubbleOf(p.bubble) ? { bubble: bubbleOf(p.bubble)! } : {}),
    });
  }
  const vocab = readVocab(raw.vocab, skipped, t);
  if (typeof vocab === 'string') return vocab;
  const sounds = readSounds(raw.sounds, dir, skipped, t);
  if (typeof sounds === 'string') return sounds;
  const can = (raw.can ?? {}) as Record<string, unknown>;
  if (can.walk !== undefined && typeof can.walk !== 'boolean') skipped.push(t.badWalk(JSON.stringify(can.walk)));
  const moves = readMoves(raw.moves, t);
  if (typeof moves === 'string') return moves;
  const needs = readNeeds(raw.needs, skipped, t);
  if (typeof needs === 'string') return needs;
  const voice = { pitch: within((raw.voice as Record<string, unknown> | undefined)?.pitch, VOICE_PITCH.min, VOICE_PITCH.max, 1) };
  const effects = { reach: within((raw.effects as Record<string, unknown> | undefined)?.reach, 0, EFFECTS_REACH_MAX, 0) };
  const bubble = bubbleOf(raw.bubble);
  return {
    manifest: MANIFEST_VERSION, api: raw.api as number, id: raw.id, version: typeof raw.version === 'string' ? raw.version : '0.0.0',
    name, about, entry: raw.entry, export: raw.export, axes, presets, vocab, sounds, can: { walk: can.walk !== false }, moves, needs, voice, effects,
    ...(bubble ? { bubble } : {}),
    ...(typeof raw.author === 'string' ? { author: raw.author } : {}),
    ...(typeof raw.license === 'string' ? { license: raw.license } : {}),
    ...(Array.isArray(raw.credits) ? { credits: raw.credits as FigureManifest['credits'] } : {}),
    ...(raw.model ? { model: raw.model as string } : {}),
    ...(raw.thumb ? { thumb: raw.thumb as string } : {}),
  };
}

/** What a scan found wrong in a pack directory: `loaded` false when the pack was left out, true for a part of it left out. */
export interface PackProblem { dir: string; reason: string; loaded: boolean }
export interface PackScan { packs: FigurePack[]; problems: PackProblem[] }

/** The packs that ship with the World: directory and the URL path the pages load it from. */
export const BUILTIN_PACKS: ReadonlyArray<{ dir: string; base: string }> = [
  { dir: fileURLToPath(new URL('../web/coo/', import.meta.url)), base: '/web/coo/' },
  { dir: fileURLToPath(new URL('../web/whale/', import.meta.url)), base: '/web/whale/' },
];

/** The built-in packs and those installed under `roots` (each subdirectory one pack); problems are worded in `language`. */
export function figurePacks(roots: readonly string[], language: Language = 'zh'): PackScan {
  return scanPacks(BUILTIN_PACKS, roots, petText(language).packs);
}

/**
 * The built-in packs (`builtin`: directory → URL path), then each pack directory under `roots`. An app may
 * ship the World without a built-in pack's directory (the whale's): that pack is not there, and one
 * installed with its id loads in its place.
 */
export function scanPacks(builtin: ReadonlyArray<{ dir: string; base: string }>, roots: readonly string[], t: PackText = petText().packs): PackScan {
  const packs: FigurePack[] = [];
  const problems: PackProblem[] = [];
  const add = (dir: string, base: (id: string) => string, isBuiltin: boolean) => {
    const skipped: string[] = [];
    const m = readManifest(dir, isBuiltin, skipped, t);
    if (typeof m === 'string') { problems.push({ dir, reason: m, loaded: false }); return; }
    const taken = packs.find((p) => p.id === m.id);
    if (taken) { problems.push({ dir, reason: t.idTaken(m.id, taken.builtin), loaded: false }); return; }
    for (const reason of skipped) problems.push({ dir, reason, loaded: true });
    packs.push({ id: m.id, dir, base: base(m.id), builtin: isBuiltin, manifest: m });
  };
  for (const b of builtin) if (existsSync(b.dir)) add(b.dir, () => b.base, true);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory()) add(join(root, e.name), (id) => `/packs/${id}/`, false);
    }
  }
  return { packs, problems };
}

/** A file of `pack` by its path inside it, or null when the path leaves the pack. */
export function packFile(pack: FigurePack, path: string): string | null {
  const root = normalize(pack.dir).replace(/[\\/]+$/, '') + sep;
  const full = normalize(join(root, path));
  return full.startsWith(root) ? full : null;
}

/** The name in `language`, else Chinese, else the first one given. */
export function nameIn(n: Names, language = 'zh'): string {
  return n[language] ?? n.zh ?? Object.values(n)[0] ?? '';
}

/**
 * A name of a figure, axis, option or preset as the bot reads it: in Chinese as `nameIn` gives it,
 * in English the English name, else `id` (what the tools take).
 */
export function modelName(n: Names | undefined, id: string, language: ModelLanguage): string {
  if (language === 'en') return n?.en ?? id;
  return n ? nameIn(n) : id;
}

/** The pack the skin asks for: the one with `figure`'s id, else Coo (a pack that went away shows as Coo). */
export function packFor(packs: readonly FigurePack[], figure: string | undefined): FigurePack | null {
  return packs.find((p) => p.id === (figure ?? COO)) ?? packs.find((p) => p.id === COO) ?? null;
}

/** Coo's picks are the skin's own fields named by its axes; another pack's are `skin.scheme`. */
type SkinLook = { scheme?: string } & object;

/** The scheme the skin picks for `pack` (see the top of this file). */
export function lookOf(pack: FigurePack, skin: SkinLook): string {
  if (pack.id !== COO) return skin.scheme ?? '';
  const fields = skin as Record<string, unknown>;
  return pack.manifest.axes.map((a) => String(fields[a.id] ?? a.options[0]!.id)).join('-');
}

/** The skin fields that pick `scheme` for `pack` (a scheme `pickWords` accepted). */
export function lookPatch(pack: FigurePack, scheme: string): Record<string, string> {
  if (pack.id !== COO) return { scheme };
  const preset = pack.manifest.presets.find((p) => p.id === scheme);
  const parts = scheme.split('-');
  return Object.fromEntries(pack.manifest.axes.map((a, i) => [a.id, preset ? preset.pick[a.id]! : parts[i]!]));
}
