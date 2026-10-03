/**
 * 「电脑操作」: the cua World in the normal mode. The switch turns the World on and off through
 * `/api/worlds/activation`, as the advanced mode's World list does; the other rows write the cua
 * World's config group through `/api/config` (only the keys shown here are sent). Yielding to the
 * person and screenshot sizes stay on the World's own page in the advanced mode.
 */
import { get, post, setConfig } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';

const WORLD = 'cua';
const GROUP = 'world:cua';
const K = 'worlds.cua';
const KEYS = {
  control: `${K}.control`,
  permission: `${K}.permission`,
  grantMinutes: `${K}.grantMinutes`,
} as const;
/** The World's PERMISSION_LEVELS, strictest first. */
const LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
type Level = (typeof LEVELS)[number];
/** The bounds of `grantMinutes` in the World's config group. */
const GRANT_MIN = 1;
const GRANT_MAX = 1440;

const S = pick({
  zh: {
    nav: '电脑操作',
    title: '电脑操作',
    enabled: '让 Coo 操作这台电脑',
    enabledHint: '关掉后 Coo 看不到屏幕,也碰不到鼠标和键盘。',
    control: '允许动鼠标和键盘',
    controlHint: '关掉后只能截图和查看有哪些窗口。',
    permission: '什么时候先问你',
    levels: { 'ask-each-turn': '每轮都问', 'ask-before-acting': '动手前问', 'ask-once': '问一次', 'never-ask': '不问' } as Record<Level, string>,
    levelHints: {
      'ask-each-turn': '每一轮 Coo 第一次看屏幕或动鼠标键盘之前,先在气泡里问你。',
      'ask-before-acting': '看屏幕不问;每一轮第一次动鼠标键盘之前问你。',
      'ask-once': '看屏幕不问;动鼠标键盘之前问一次,同意后在「同意管多久」之内不再问。',
      'never-ask': '看屏幕和动鼠标键盘都不问。',
    } as Record<Level, string>,
    grant: '同意管多久',
    grantSuffix: '分钟',
    grantBad: `要填 ${GRANT_MIN} 到 ${GRANT_MAX} 之间的整数`,
    more: '让位时长、截图尺寸等其余参数在高级模式的「电脑操作」World 页。',
    saved: '已保存',
    turnedOn: '已打开电脑操作',
    turnedOff: '已关闭电脑操作',
    saveFailed: (why: string) => `没保存上:${why}`,
  },
  en: {
    nav: 'Computer use',
    title: 'Computer use',
    enabled: 'Let Coo use this computer',
    enabledHint: 'When off, Coo can neither see the screen nor touch the mouse and keyboard.',
    control: 'Allow the mouse and keyboard',
    controlHint: 'When off, Coo can only take screenshots and list windows.',
    permission: 'When to ask you',
    levels: { 'ask-each-turn': 'Every turn', 'ask-before-acting': 'Before acting', 'ask-once': 'Once', 'never-ask': 'Never' } as Record<Level, string>,
    levelHints: {
      'ask-each-turn': 'Every turn, Coo asks in its bubble before it first looks at the screen or uses the mouse and keyboard.',
      'ask-before-acting': 'Looking is not asked; every turn, Coo asks before it first uses the mouse and keyboard.',
      'ask-once': 'Looking is not asked; Coo asks once before using the mouse and keyboard, and after a yes not again for as long as set below.',
      'never-ask': 'Coo never asks, neither to look nor to act.',
    } as Record<Level, string>,
    grant: 'A yes lasts',
    grantSuffix: 'minutes',
    grantBad: `Enter a whole number from ${GRANT_MIN} to ${GRANT_MAX}`,
    more: 'Yielding to you, screenshot sizes and the other settings are on the Computer use World page in the advanced mode.',
    saved: 'Saved',
    turnedOn: 'Computer use is on',
    turnedOff: 'Computer use is off',
    saveFailed: (why: string) => `Not saved: ${why}`,
  },
});

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }
interface WorldEntry { id: string; status: 'active' | 'inactive' | 'missing' }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  const sheet = ui.sheet({ title: S.title });
  const msg = ui.msgline('');
  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.classList.toggle('bad', bad);
  };

  const enabled = ui.checkbox(S.enabled, { onChange: (on) => void activate(on) });
  const control = ui.checkbox(S.control, { onChange: (on) => void save(KEYS.control, on) });
  const levelHint = ui.h('p', 'home-note');
  const level = ui.segmented(LEVELS.map((value) => ({ value, label: S.levels[value] })), {
    size: 'sm',
    onSelect: (v) => { showLevel(v as Level); void save(KEYS.permission, v); },
  });
  const grant = ui.input({ type: 'number' });
  grant.min = String(GRANT_MIN);
  grant.max = String(GRANT_MAX);
  grant.step = '1';
  const grantBox = ui.h('div', 'companion-rangebox');
  grantBox.append(grant, ui.h('span', 'companion-rangeval', S.grantSuffix));

  const row = (label: string, control: HTMLElement, hint?: HTMLElement | string) => {
    const r = ui.h('div', 'companion-row');
    const c = ui.h('div', 'companion-control');
    c.append(control);
    if (hint) c.append(typeof hint === 'string' ? ui.h('p', 'home-note', hint) : hint);
    r.append(ui.h('div', 'companion-label', label), c);
    return r;
  };
  const grantRow = row(S.grant, grantBox);
  sheet.body.append(
    row('', enabled.el, S.enabledHint),
    row('', control.el, S.controlHint),
    row(S.permission, level.el, levelHint),
    grantRow,
    ui.h('p', 'home-note', S.more),
    msg,
  );
  root.append(sheet.el);

  const showLevel = (v: Level) => {
    levelHint.textContent = S.levelHints[v];
    grantRow.hidden = v !== 'ask-once';
  };

  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(GROUP, { [key]: value }, opts);
      say(S.saved);
    } catch (err) {
      if (!signal.aborted) say(S.saveFailed(errText(err)), true);
    }
  };
  const activate = async (on: boolean) => {
    const lock = ui.disable(enabled.input);
    try {
      await post('/api/worlds/activation', { id: WORLD, enabled: on }, opts);
      say(on ? S.turnedOn : S.turnedOff);
    } catch (err) {
      if (signal.aborted) return;
      enabled.setChecked(!on);
      say(S.saveFailed(errText(err)), true);
    } finally {
      lock.dispose();
    }
  };
  grant.addEventListener('change', () => {
    const n = Number(grant.value);
    if (!Number.isInteger(n) || n < GRANT_MIN || n > GRANT_MAX) { say(S.grantBad, true); return; }
    void save(KEYS.grantMinutes, n);
  }, { signal });

  const [worlds, config] = await Promise.all([
    get<{ worlds?: WorldEntry[] }>('/api/worlds', opts).catch(() => null),
    get<{ groups?: ConfigEntry[] }>('/api/config', opts).catch(() => null),
  ]);
  enabled.setChecked(worlds?.worlds?.find((w) => w.id === WORLD)?.status === 'active');
  const values = config?.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
  if (typeof values[KEYS.control] === 'boolean') control.setChecked(values[KEYS.control] as boolean);
  const current = LEVELS.find((l) => l === values[KEYS.permission]) ?? 'ask-each-turn';
  level.setValue(current);
  showLevel(current);
  if (typeof values[KEYS.grantMinutes] === 'number') grant.value = String(values[KEYS.grantMinutes]);
}

export const cuaFeature: FrameworkFeature = {
  route: 'cua',
  label: S.nav,
  icon: 'eye',
  navMode: 'primary',
  mount,
};
