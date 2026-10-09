/**
 * The `coopanion` World: what the app itself has to tell Coo, as internal events.
 *
 * - After an update, the release notes of every version since the last one this install ran
 *   (`docs/releases/v<version>.md`, which the installer ships), once the pet page is connected. A
 *   new install starts silent; an install from before this World (no state file) hears the
 *   current version's notes only. Development runs (`dev`) say nothing. With English model text a
 *   version's `v<version>.en.md` is read instead, when it exists.
 * - When the person changes a setting Coo shows or works by (what it calls them, Coo's dress, size,
 *   colours, walking, sounds, which touches wake it, what it may change itself, voice input, computer
 *   use), what changed, from what to what. A switch of
 *   figure or of a figure pack's pick is the desktop-pet World's to tell: it knows the body.
 *   Both write paths (the settings window's forms and a World's own `persist`) change the live
 *   config object, which is read every second; changes in a row reach Coo as one event, after the
 *   bus's debounce. Changes the introduction makes are not told: the introduction's record tells them.
 * - When the introduction ends, walked through or closed, its record: Coo's lines and the
 *   person's answers (`guide.ts`), with what is Coo's to settle with the person after it.
 *
 * - Wake-ups Coo sets for itself (`alarms.ts`): its tools, and the event when one is due.
 *
 * Every event is in the model-text language of the app language (`language.ts`), read when it is rendered.
 *
 * The last version told is kept in `notice.json` in the deployment directory, written when the
 * event is delivered, so an update told while events are held (no key yet) is told on a later start.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { ToolDef, World, WorldHost } from 'cortico/core/types.ts';
import type { WorldDefinition, WorldSection } from 'cortico/world.ts';
import { SELF_KEYS, selfAdjustMode } from 'cortico-world-desktop-pet';
import { Alarms } from './alarms.ts';
import type { GuideEnd } from './guide.ts';
import { modelLanguage, type ModelLanguage } from './language.ts';

export const NOTICE_ID = 'coopanion';
/** How often the watched settings are compared with the last look. */
const LOOK_EVERY_MS = 1000;
/** Where the release notes stop being about the app: the download list that ends each file, by the file's language. */
const NOTES_END: Record<ModelLanguage, RegExp> = { zh: /^## 下载/m, en: /^## Download/m };

export interface NoticeAssembly {
  /** The running version (`COOPANION_VERSION`), `dev` outside a packaged app. */
  version: string;
  /** `docs/releases` of the program directory. */
  notesDir: string;
  /** `notice.json` in the deployment directory. */
  stateFile: string;
  /** `alarms.json` in the deployment directory. */
  alarmsFile: string;
  /** A new install, introduction not run and no key: its first version is not news. */
  newInstall: () => boolean;
  /** A value of the live config by dotted path; `language` gives the model-text language. */
  read: (path: string) => unknown;
  /** The pet page is connected, so Coo can answer in its bubble. */
  petConnected: () => boolean;
  /** The introduction is running and makes its own changes. */
  guiding: () => boolean;
  /** The instance, once created, for the introduction to hand its record to. */
  onCreate?: (world: NoticeWorld) => void;
}

type Version = [number, number, number];

export function parseVersion(v: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/**
 * The notes of the versions after `from` up to `to`, oldest first, each cut before its download
 * list; with `from` null, the notes of `to` only. Versions without a file are left out. In English a
 * version's `.en.md` file is taken when there is one, its Chinese file otherwise.
 */
export function releaseNotes(dir: string, from: string | null, to: string, language: ModelLanguage = 'zh'): Array<{ version: string; text: string }> {
  const upper = parseVersion(to);
  if (!upper) return [];
  const lower = from === null ? null : parseVersion(from);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  return files
    .map((name) => ({ name, v: parseVersion(name.replace(/\.md$/, '')) }))
    .filter((f): f is { name: string; v: Version } => f.v !== null && f.name.endsWith('.md'))
    .filter(({ v }) => compare(v, upper) <= 0 && (lower ? compare(v, lower) > 0 : compare(v, upper) === 0))
    .sort((a, b) => compare(a.v, b.v))
    .map(({ name, v }) => {
      const english = name.replace(/\.md$/, '.en.md');
      const [file, written]: [string, ModelLanguage] = language === 'en' && existsSync(join(dir, english)) ? [english, 'en'] : [name, 'zh'];
      const text = readFileSync(join(dir, file), 'utf8').replaceAll('\r\n', '\n');
      const end = text.search(NOTES_END[written]);
      return { version: v.join('.'), text: (end < 0 ? text : text.slice(0, end)).trim() };
    });
}

interface Labels {
  /** id → Chinese name of Coo's palettes and its accessories (all slots). */
  palettes: Record<string, string>;
  accessories: Record<string, string>;
}

/** Names as the dressing page shows them in Chinese, from Coo's manifest in the pet package; ids stand in for any that fail to load. */
async function loadLabels(): Promise<Labels> {
  const labels: Labels = { palettes: {}, accessories: {} };
  const require = createRequire(import.meta.url);
  try {
    const manifest = JSON.parse(readFileSync(require.resolve('cortico-world-desktop-pet/web/coo/figure.json'), 'utf8')) as {
      axes: Array<{ id: string; options: Array<{ id: string; name: Record<string, string> }> }>;
    };
    for (const axis of manifest.axes) {
      const into = axis.id === 'palette' ? labels.palettes : labels.accessories;
      for (const o of axis.options) into[o.id] = o.name.zh ?? o.id;
    }
  } catch { /* ids */ }
  return labels;
}

const PET = 'worlds.desktop-pet';
const CUA = 'worlds.cua';

/** The settings told when they change, in this order; `key` names the setting in the text tables. */
const WATCHED = [
  { path: `${PET}.user`, key: 'user' },
  { path: `${PET}.skin.palette`, key: 'palette' },
  { path: `${PET}.skin.head`, key: 'head' },
  { path: `${PET}.skin.side`, key: 'side' },
  { path: `${PET}.skin.glasses`, key: 'glasses' },
  { path: `${PET}.skin.neck`, key: 'neck' },
  { path: `${PET}.skin.colors`, key: 'colors' },
  { path: `${PET}.window.scale`, key: 'scale' },
  { path: `${PET}.theme`, key: 'theme' },
  { path: `${PET}.roam`, key: 'roam' },
  { path: `${PET}.sound`, key: 'sound' },
  { path: `${PET}.touch.wakeOn`, key: 'wakeOn' },
  { path: `${PET}.touch.wakeKinds`, key: 'wakeKinds' },
  { path: `${PET}.selfAdjust`, key: 'selfAdjust' },
  { path: `${PET}.selfAdjustCustom`, key: 'selfAdjustCustom' },
  { path: `${PET}.asr.enabled`, key: 'voice' },
  { path: `${CUA}.enabled`, key: 'cua' },
  { path: `${CUA}.control`, key: 'control' },
  { path: `${CUA}.permission`, key: 'permission' },
] as const;

type WatchedKey = typeof WATCHED[number]['key'];

/**
 * How a watched setting is told: its name, and how a value is said (absent: as it is). `changedOnly`
 * settings are told as changed, without the values.
 */
interface SettingText {
  name: string;
  say?: (value: unknown, labels: Labels) => string;
  changedOnly?: true;
}

const named = (table: Record<string, string>) => (v: unknown) => table[String(v)] ?? String(v);
/** A list of ids by their names, or `none` when it is empty. */
const listed = (table: Record<string, string>, none: string, join: string) => (v: unknown) => {
  const ids = Array.isArray(v) ? v.map(String) : [];
  return ids.length ? ids.map((id) => table[id] ?? id).join(join) : none;
};
/** The items `selfAdjustCustom` lets Coo change at once, by the names `pet_set` takes them under, or `none`. */
const directItems = (none: string, join: string) => (v: unknown) => {
  const map = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const on = SELF_KEYS.filter((k) => map[k] === true);
  return on.length ? on.join(join) : none;
};
const label = (pick: (l: Labels) => Record<string, string>) => (v: unknown, l: Labels) => pick(l)[String(v)] ?? String(v);

const zh = {
  settings: {
    user: { name: '你对对方的称呼' },
    palette: { name: 'Coo 的配色', say: label((l) => l.palettes) },
    head: { name: 'Coo 的头饰', say: label((l) => l.accessories) },
    side: { name: 'Coo 的耳饰', say: label((l) => l.accessories) },
    glasses: { name: 'Coo 的眼镜', say: label((l) => l.accessories) },
    neck: { name: 'Coo 的颈饰', say: label((l) => l.accessories) },
    colors: { name: 'Coo 配件的颜色', changedOnly: true },
    scale: { name: '你在屏幕上的大小', say: (v) => `${v} 倍` },
    theme: { name: '黑白模式', say: named({ dark: '夜间(浅色身体)', light: '白天(深色身体)' }) },
    roam: { name: '你平时走动多少', say: named({ free: '常走动', calm: '多待着', off: '不乱动' }) },
    sound: { name: '音效', say: (v) => (v ? '开' : '关') },
    wakeOn: {
      name: '互动时你什么时候回应(回应模式)',
      say: named({ none: '安静(互动都跟着下一批事件送到)', poke: '默认(只有戳会马上叫你)', all: '积极(每种互动都马上叫你)', custom: '自定义(下一项里的互动马上叫你)' }),
    },
    wakeKinds: { name: '自定义回应模式下马上叫你的互动', say: listed({ poke: '戳', pet: '摸头', throw: '甩出去', drop: '拎起来放下' }, '无', '、') },
    selfAdjust: {
      name: '你能不能自己改设置(自主配置权限)',
      say: (v) => ({ off: '禁止(pet_set、pet_quiet 都用不了)', default: '默认', any: '任意(都直接改)', custom: '自定义(下一项里的直接改,其余先征得同意)' })[selfAdjustMode(v)],
    },
    selfAdjustCustom: {
      name: '自定义权限下你能直接改的设置',
      say: directItems('无', '、'),
    },
    voice: { name: '语音输入', say: (v) => (v ? '开' : '关') },
    cua: { name: '让你操作这台电脑', say: (v) => (v ? '开' : '关') },
    control: { name: '允许你动鼠标键盘', say: (v) => (v ? '开' : '关') },
    permission: {
      name: '你操作电脑前什么时候先问对方',
      say: named({ 'ask-each-turn': '每轮都问', 'ask-before-acting': '看屏幕不问,动鼠标键盘前每轮问', 'ask-once': '动手前问一次,同意后一段时间内不再问', 'never-ask': '都不问' }),
    },
  } as Record<WatchedKey, SettingText>,
  changedLine: (name: string) => `- ${name}:换了`,
  settingLine: (name: string, from: string, to: string) => `- ${name}:${from} → ${to}`,
  changed: '[设置变化] 对方刚改了这些设置,已经生效:',

  updatedFrom: (from: string, to: string) => `[应用更新] Coopanion 刚从 ${from} 更新到 ${to}。`,
  updatedTo: (to: string) => `[应用更新] Coopanion 刚更新到 ${to}。`,
  noNotes: '这个版本没有附带更新说明。',
  notesIntro: (several: boolean) => `下面是${several ? '这之间各版本' : '这个版本'}的更新说明,原文是写给对方看的:`,
  notesOutro: '\n挑对方用得上的新功能和修复,用你自己的话告诉对方,不用照念,也不用一次说完。',

  someone: '对方',
  guideFinished: (name: string) => `[启动引导] ${name}刚在你的气泡里走完了启动引导:定了你怎么称呼对方(「${name}」)、你平时活泼到什么程度、互动时你什么时候回应、用哪家模型服务,也看过了怎么语音输入、按钮和菜单在哪。`,
  guideClosed: (name: string, step: number) => `[启动引导] ${name}在第 ${step} 步关掉了启动引导,后面的步骤没有走。`,
  guideRecord: '下面是引导里的对话。引导按程序写好的台词走,「Coo:」那几行是程序替你说的:',
  guideAfter: (name: string) => [
    `接下来可以和${name}商量你们之间的设定:你的性格和说话方式、你怎么称呼对方、对方想怎么叫你、希望你平时做什么不做什么。`,
    '- 你的人设是工作区里的 CONSTITUTION.md,每次开新 session 都放进你的系统前缀。商量出结果后你可以自己改它,下一次 session 生效。',
    '- 对方的称呼是设置窗口「习惯」页的「怎么称呼你」,由对方自己改;商量好的称呼和其他偏好可以记进你的工作区。',
    '- 设置窗口的「系统提示词」页能看到并编辑你的整份系统提示词,CONSTITUTION 也在里面。可以引导对方去那里按自己的喜好改;对方想改什么,你也可以替对方改。',
    '不用一次说完,看对方的兴致。',
  ],
};

const en: typeof zh = {
  settings: {
    user: { name: 'what you call the person' },
    // English says the ids, which pet_set takes
    palette: { name: 'Coo\'s colours' },
    head: { name: 'Coo\'s headwear' },
    side: { name: 'Coo\'s ear accessory' },
    glasses: { name: 'Coo\'s glasses' },
    neck: { name: 'Coo\'s neckwear' },
    colors: { name: 'the colours of Coo\'s accessories', changedOnly: true },
    scale: { name: 'your size on screen', say: (v) => `${v}×` },
    theme: { name: 'night or day look', say: named({ dark: 'night (light body)', light: 'day (dark body)' }) },
    roam: { name: 'how much you walk about', say: named({ free: 'free (walks often)', calm: 'calm (mostly stays put)', off: 'off (does not wander)' }) },
    sound: { name: 'sound effects', say: (v) => (v ? 'on' : 'off') },
    wakeOn: {
      name: 'when you respond to touches (response mode)',
      say: named({ none: 'quiet (every touch comes with the next batch of events)', poke: 'default (only a poke wakes you)', all: 'eager (every touch wakes you)', custom: 'custom (the touches in the next item wake you)' }),
    },
    wakeKinds: { name: 'the touches that wake you in the custom response mode', say: listed({ poke: 'poke', pet: 'pat on the head', throw: 'throw', drop: 'pick up and put down' }, 'none', ', ') },
    selfAdjust: {
      name: 'whether you may change settings yourself (self-adjustment)',
      say: (v) => ({ off: 'off (neither pet_set nor pet_quiet works)', default: 'default', any: 'anything (all change at once)', custom: 'custom (the items in the next one change at once, the rest are asked first)' })[selfAdjustMode(v)],
    },
    selfAdjustCustom: {
      name: 'the settings you may change at once under custom self-adjustment',
      say: directItems('none', ', '),
    },
    voice: { name: 'voice input', say: (v) => (v ? 'on' : 'off') },
    cua: { name: 'letting you operate this computer', say: (v) => (v ? 'on' : 'off') },
    control: { name: 'letting you use the mouse and keyboard', say: (v) => (v ? 'on' : 'off') },
    permission: {
      name: 'when you ask the person before using the computer',
      say: named({ 'ask-each-turn': 'every turn', 'ask-before-acting': 'not before looking at the screen; every turn before mouse or keyboard input', 'ask-once': 'once before acting, then not again for a while after a yes', 'never-ask': 'never' }),
    },
  },
  changedLine: (name) => `- ${name}: changed`,
  settingLine: (name, from, to) => `- ${name}: ${from} → ${to}`,
  changed: '[settings changed] The person just changed these settings, now in effect:',

  updatedFrom: (from, to) => `[app update] Coopanion was just updated from ${from} to ${to}.`,
  updatedTo: (to) => `[app update] Coopanion was just updated to ${to}.`,
  noNotes: ' This version came without release notes.',
  notesIntro: (several) => ` Below are the release notes of ${several ? 'each version in between' : 'this version'}, written for the person to read:`,
  notesOutro: '\nPick the new features and fixes the person can use and tell them in your own words; no need to read them out or to say it all at once.',

  someone: 'the person',
  guideFinished: (name) => `[introduction] ${name} just walked through the introduction in your bubble: settled what you call them ("${name}"), how lively you are day to day, when you respond to touches, and which model service to use, and saw how voice input works and where the buttons and the menu are.`,
  guideClosed: (name, step) => `[introduction] ${name} closed the introduction at step ${step}; the steps after it were not walked through.`,
  guideRecord: 'Below is the conversation from the introduction. It follows lines the app wrote; the "Coo:" lines were said by the app on your behalf:',
  guideAfter: (name) => [
    `Next you can work out with ${name} how things are between you: your personality and way of talking, what you call them, what they want to call you, what they would like you to do or not do day to day.`,
    '- Your persona is CONSTITUTION.md in your workspace, which goes into your system prefix at the start of every new session. Once you have agreed on something you can edit it yourself; it takes effect from the next session.',
    '- What you call them is "What to call you" on the Habits page of the settings window, which they change themselves; a name you agreed on and other preferences can go into your workspace.',
    '- The System prompt page of the settings window shows your whole system prompt, CONSTITUTION included, and lets them edit it. You can point them there to change it to their liking; you can also make the changes they want for them.',
    'No need to cover it all at once; follow their interest.',
  ],
};

const NOTICE_TEXT: Record<ModelLanguage, typeof zh> = { zh, en };

export function updatedText(from: string | null, to: string, notes: Array<{ version: string; text: string }>, language: ModelLanguage = 'zh'): string {
  const t = NOTICE_TEXT[language];
  const head = from ? t.updatedFrom(from, to) : t.updatedTo(to);
  if (!notes.length) return `${head}${t.noNotes}`;
  return [
    `${head}${t.notesIntro(notes.length > 1)}`,
    ...notes.map((n) => `\n<release version="${n.version}">\n${n.text}\n</release>`),
    t.notesOutro,
  ].join('\n');
}

type Look = Record<string, string>;

function look(read: (path: string) => unknown): Look {
  return Object.fromEntries(WATCHED.map((w) => [w.path, JSON.stringify(read(w.path) ?? null)]));
}

/** One line per watched setting that differs between the two looks, in `WATCHED` order. */
export function settingChanges(before: Look, after: Look, labels: Labels, language: ModelLanguage = 'zh'): string[] {
  const t = NOTICE_TEXT[language];
  return WATCHED.filter((w) => before[w.path] !== after[w.path]).map((w) => {
    const s = t.settings[w.key];
    const say = (raw: string | undefined) => {
      const v = raw === undefined ? null : JSON.parse(raw) as unknown;
      return s.say ? s.say(v, labels) : String(v);
    };
    return s.changedOnly ? t.changedLine(s.name) : t.settingLine(s.name, say(before[w.path]), say(after[w.path]));
  });
}

export function guideText(end: GuideEnd, language: ModelLanguage = 'zh'): string {
  const t = NOTICE_TEXT[language];
  const name = end.name ?? t.someone;
  return [
    end.finished ? t.guideFinished(name) : t.guideClosed(name, end.step),
    t.guideRecord,
    '<guide>', ...end.transcript, '</guide>',
    ...(end.finished ? t.guideAfter(name) : []),
  ].join('\n');
}

export function changedText(lines: string[], language: ModelLanguage = 'zh'): string {
  return [NOTICE_TEXT[language].changed, ...lines].join('\n');
}

export class NoticeWorld implements World {
  readonly id = NOTICE_ID;
  private timer: ReturnType<typeof setInterval> | null = null;
  private host: WorldHost | null = null;
  private labels: Labels = { palettes: {}, accessories: {} };
  /** The settings as Coo last heard them, and as the last look saw them. */
  private told: Look = {};
  private seen: Look = {};
  private wasGuiding = false;
  /** The version Coo is to hear about, until the pet page connects. */
  private update: { from: string | null; to: string } | null = null;

  private readonly alarms: Alarms;

  constructor(private readonly a: NoticeAssembly, timezone: string) {
    this.alarms = new Alarms(a.alarmsFile, timezone, () => this.language);
  }

  /** The model-text language of the app language as it is now. */
  private get language(): ModelLanguage {
    return modelLanguage(this.a.read('language'));
  }

  envPromptVars(): null { return null; }
  tools(): ToolDef[] { return this.alarms.tools(); }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.labels = await loadLabels();
    this.told = this.seen = look(this.a.read);
    this.update = this.pendingUpdate();
    this.timer = setInterval(() => this.tick(), LOOK_EVERY_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.host = null;
  }

  /** The update to tell, or null; a version that is not news is recorded at once. */
  private pendingUpdate(): { from: string | null; to: string } | null {
    const to = this.a.version;
    if (!parseVersion(to)) return null;
    const last = existsSync(this.a.stateFile)
      ? (JSON.parse(readFileSync(this.a.stateFile, 'utf8')) as { version?: unknown }).version
      : undefined;
    if (last === undefined && this.a.newInstall()) { this.record(to); return null; }
    if (typeof last !== 'string') return { from: null, to };
    const from = parseVersion(last);
    if (from && compare(parseVersion(to)!, from) > 0) return { from: last, to };
    if (last !== to) this.record(to);
    return null;
  }

  /** The settings as they are now are Coo's own doing (`pet_set`): nothing to tell it. */
  acceptCurrent(): void {
    this.told = this.seen = look(this.a.read);
  }

  /** Hands Coo the introduction's record, delivered at once (held, like everything, while there is no key). */
  guideEnded(end: GuideEnd): void {
    this.host?.pushDeferred({ type: 'coopanion.guide', origin: 'internal', render: () => guideText(end, this.language) }, { trigger: 'flush' });
  }

  private record(version: string): void {
    writeFileSync(this.a.stateFile, `${JSON.stringify({ version }, null, 2)}\n`);
  }

  private tick(): void {
    const host = this.host;
    if (!host) return;
    for (const { alarm, missed } of this.alarms.takeDue(Date.now())) {
      host.pushDeferred({ type: 'coopanion.alarm', origin: 'internal', render: () => this.alarms.dueText(alarm, missed) }, { trigger: 'flush' });
    }
    const now = look(this.a.read);
    const guiding = this.a.guiding();
    // what the introduction set, up to the first look after it, is the introduction's to tell
    if (guiding || this.wasGuiding) {
      this.wasGuiding = guiding;
      this.told = this.seen = now;
      return;
    }
    if (this.update && this.a.petConnected()) {
      const { from, to } = this.update;
      this.update = null;
      host.pushDeferred({
        type: 'coopanion.updated', origin: 'internal',
        render: () => {
          this.record(to);
          const language = this.language;
          return updatedText(from, to, releaseNotes(this.a.notesDir, from, to, language), language);
        },
      }, { trigger: 'flush' });
    }
    if (JSON.stringify(now) === JSON.stringify(this.seen)) return;
    this.seen = now;
    // each change pushes again so the debounce waits for the last; the first render tells them all, the rest render nothing
    host.pushDeferred({
      type: 'coopanion.settings-changed', origin: 'internal',
      render: () => {
        const current = look(this.a.read);
        const lines = settingChanges(this.told, current, this.labels, this.language);
        this.told = current;
        return lines.length ? changedText(lines, this.language) : null;
      },
    }, { trigger: 'debounce' });
  }
}

export function noticeDefinition(assembly: NoticeAssembly): WorldDefinition<WorldSection> {
  return {
    id: NOTICE_ID,
    label: '应用通知',
    defaults: () => ({ enabled: false }),
    create: (ctx) => {
      const world = new NoticeWorld(assembly, ctx.timezone);
      assembly.onCreate?.(world);
      return world;
    },
  };
}
