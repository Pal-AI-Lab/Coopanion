/**
 * The `coopanion` World: what the app itself has to tell Coo, as internal events.
 *
 * - After an update, the release notes of every version since the last one this install ran
 *   (`docs/releases/v<version>.md`, which the installer ships), once the pet page is connected. A
 *   new install starts silent; an install from before this World (no state file) hears the
 *   current version's notes only. Development runs (`dev`) say nothing.
 * - When the person changes a setting Coo shows or works by (what it calls them, Coo's dress, size,
 *   colours, walking, voice input, computer use), what changed, from what to what. A switch of
 *   figure or of a figure pack's pick is the desktop-pet World's to tell: it knows the body.
 *   Both write paths (the settings window's forms and a World's own `persist`) change the live
 *   config object, which is read every second; changes in a row reach Coo as one event, after the
 *   bus's debounce. Changes the introduction makes are not told: the introduction's record tells them.
 * - When the introduction ends, walked through or closed, its record: Coo's lines and the
 *   person's answers (`guide.ts`), with what is Coo's to settle with the person after it.
 *
 * - Wake-ups Coo sets for itself (`alarms.ts`): its tools, and the event when one is due.
 *
 * The last version told is kept in `notice.json` in the deployment directory, written when the
 * event is delivered, so an update told while events are held (no key yet) is told on a later start.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ToolDef, World, WorldHost } from 'cortico/core/types.ts';
import type { WorldDefinition, WorldSection } from 'cortico/world.ts';
import { Alarms } from './alarms.ts';
import type { GuideEnd } from './guide.ts';

export const NOTICE_ID = 'coopanion';
/** How often the watched settings are compared with the last look. */
const LOOK_EVERY_MS = 1000;
/** Where the release notes stop being about the app: the download list that ends each file. */
const NOTES_END = /^## 下载/m;

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
  /** A value of the live config by dotted path. */
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
 * list; with `from` null, the notes of `to` only. Versions without a file are left out.
 */
export function releaseNotes(dir: string, from: string | null, to: string): Array<{ version: string; text: string }> {
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
      const text = readFileSync(join(dir, name), 'utf8').replaceAll('\r\n', '\n');
      const end = text.search(NOTES_END);
      return { version: v.join('.'), text: (end < 0 ? text : text.slice(0, end)).trim() };
    });
}

export function updatedText(from: string | null, to: string, notes: Array<{ version: string; text: string }>): string {
  const head = from ? `[应用更新] Coopanion 刚从 ${from} 更新到 ${to}。` : `[应用更新] Coopanion 刚更新到 ${to}。`;
  if (!notes.length) return `${head}这个版本没有附带更新说明。`;
  return [
    `${head}下面是${notes.length > 1 ? '这之间各版本' : '这个版本'}的更新说明,原文是写给对方看的:`,
    ...notes.map((n) => `\n<release version="${n.version}">\n${n.text}\n</release>`),
    '\n挑对方用得上的新功能和修复,用你自己的话告诉对方,不用照念,也不用一次说完。',
  ].join('\n');
}

interface Labels {
  /** id → name of Coo's palettes and its accessories (all slots). */
  palettes: Record<string, string>;
  accessories: Record<string, string>;
}

/** Names as the dressing page shows them, from the pet package; ids stand in for any that fail to load. */
async function loadLabels(): Promise<Labels> {
  const labels: Labels = { palettes: {}, accessories: {} };
  const require = createRequire(import.meta.url);
  try {
    const core = await import(pathToFileURL(require.resolve('cortico-world-desktop-pet/web/coo/coo.js')).href) as {
      PALETTES: Array<{ id: string; label: string }>;
      SLOT_LISTS: Record<string, Array<[string, string]>>;
    };
    for (const p of core.PALETTES) labels.palettes[p.id] = p.label;
    for (const list of Object.values(core.SLOT_LISTS)) for (const [id, label] of list) labels.accessories[id] = label;
  } catch { /* ids */ }
  return labels;
}

interface Watched {
  path: string;
  name: string;
  /** How a value is told; absent: as it is. */
  say?: (value: unknown, labels: Labels) => string;
  /** Told as changed, without the values. */
  changedOnly?: true;
}

const onOff = (v: unknown) => (v ? '开' : '关');
const named = (table: Record<string, string>) => (v: unknown) => table[String(v)] ?? String(v);
const PET = 'worlds.desktop-pet';
const CUA = 'worlds.cua';

const WATCHED: Watched[] = [
  { path: `${PET}.user`, name: '你对对方的称呼' },
  { path: `${PET}.skin.palette`, name: 'Coo 的配色', say: (v, l) => l.palettes[String(v)] ?? String(v) },
  { path: `${PET}.skin.head`, name: 'Coo 的头饰', say: (v, l) => l.accessories[String(v)] ?? String(v) },
  { path: `${PET}.skin.side`, name: 'Coo 的耳饰', say: (v, l) => l.accessories[String(v)] ?? String(v) },
  { path: `${PET}.skin.glasses`, name: 'Coo 的眼镜', say: (v, l) => l.accessories[String(v)] ?? String(v) },
  { path: `${PET}.skin.neck`, name: 'Coo 的颈饰', say: (v, l) => l.accessories[String(v)] ?? String(v) },
  { path: `${PET}.skin.colors`, name: 'Coo 配件的颜色', changedOnly: true },
  { path: `${PET}.window.scale`, name: '你在屏幕上的大小', say: (v) => `${v} 倍` },
  { path: `${PET}.theme`, name: '黑白模式', say: named({ dark: '夜间(浅色身体)', light: '白天(深色身体)' }) },
  { path: `${PET}.roam`, name: '你平时走动多少', say: named({ free: '常走动', calm: '多待着', off: '不乱动' }) },
  { path: `${PET}.sound`, name: '音效', say: onOff },
  { path: `${PET}.asr.enabled`, name: '语音输入', say: onOff },
  { path: `${CUA}.enabled`, name: '让你操作这台电脑', say: onOff },
  { path: `${CUA}.control`, name: '允许你动鼠标键盘', say: onOff },
  {
    path: `${CUA}.permission`, name: '你操作电脑前什么时候先问对方',
    say: named({ 'ask-each-turn': '每轮都问', 'ask-before-acting': '看屏幕不问,动鼠标键盘前每轮问', 'ask-once': '动手前问一次,同意后一段时间内不再问', 'never-ask': '都不问' }),
  },
];

type Look = Record<string, string>;

function look(read: (path: string) => unknown): Look {
  return Object.fromEntries(WATCHED.map((w) => [w.path, JSON.stringify(read(w.path) ?? null)]));
}

/** One line per watched setting that differs between the two looks, in `WATCHED` order. */
export function settingChanges(before: Look, after: Look, labels: Labels): string[] {
  return WATCHED.filter((w) => before[w.path] !== after[w.path]).map((w) => {
    const say = (raw: string | undefined) => {
      const v = raw === undefined ? null : JSON.parse(raw) as unknown;
      return w.say ? w.say(v, labels) : String(v);
    };
    return w.changedOnly ? `- ${w.name}:换了` : `- ${w.name}:${say(before[w.path])} → ${say(after[w.path])}`;
  });
}

const GUIDE_AFTER = (name: string) => [
  `接下来可以和${name}商量你们之间的设定:你的性格和说话方式、你怎么称呼对方、对方想怎么叫你、希望你平时做什么不做什么。`,
  '- 你的人设是工作区里的 CONSTITUTION.md,每次开新 session 都放进你的系统前缀。商量出结果后你可以自己改它,下一次 session 生效。',
  '- 对方的称呼是设置窗口「习惯」页的「怎么称呼你」,由对方自己改;商量好的称呼和其他偏好可以记进你的工作区。',
  '- 设置窗口的「系统提示词」页能看到并编辑你的整份系统提示词,CONSTITUTION 也在里面。可以引导对方去那里按自己的喜好改;对方想改什么,你也可以替对方改。',
  '不用一次说完,看对方的兴致。',
];

export function guideText(end: GuideEnd): string {
  const name = end.name ?? '对方';
  const head = end.finished
    ? `[启动引导] ${name}刚在你的气泡里走完了启动引导:定了你怎么称呼对方(「${name}」)、你平时活泼到什么程度、用哪家模型服务,也看过了怎么语音输入、按钮和菜单在哪。`
    : `[启动引导] ${name}在第 ${end.step} 步关掉了启动引导,后面的步骤没有走。`;
  return [
    head,
    '下面是引导里的对话。引导按程序写好的台词走,「Coo:」那几行是程序替你说的:',
    '<guide>', ...end.transcript, '</guide>',
    ...(end.finished ? GUIDE_AFTER(name) : []),
  ].join('\n');
}

export function changedText(lines: string[]): string {
  return ['[设置变化] 对方刚改了这些设置,已经生效:', ...lines].join('\n');
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
    this.alarms = new Alarms(a.alarmsFile, timezone);
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
    this.host?.pushDeferred({ type: 'coopanion.guide', origin: 'internal', render: () => guideText(end) }, { trigger: 'flush' });
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
        render: () => { this.record(to); return updatedText(from, to, releaseNotes(this.a.notesDir, from, to)); },
      }, { trigger: 'flush' });
    }
    if (JSON.stringify(now) === JSON.stringify(this.seen)) return;
    this.seen = now;
    // each change pushes again so the debounce waits for the last; the first render tells them all, the rest render nothing
    host.pushDeferred({
      type: 'coopanion.settings-changed', origin: 'internal',
      render: () => {
        const current = look(this.a.read);
        const lines = settingChanges(this.told, current, this.labels);
        this.told = current;
        return lines.length ? changedText(lines) : null;
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
