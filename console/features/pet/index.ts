/**
 * 「习惯」: the everyday settings of the desktop pet, written to the desktop-pet World's config
 * group through `/api/config` (only the keys shown here are sent). The pet's own menu changes some
 * of the same values, so they are read again every few seconds. Dressing up has its own page
 * (features/dress). The hover buttons are picked from the pet menu's own actions, drawn with the
 * pet page's icons.
 */
import { ICONS } from 'cortico-world-desktop-pet/web/pet-core.js';
import { get, setConfig } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';

const GROUP = 'world:desktop-pet';
const K = 'worlds.desktop-pet';
const KEYS = {
  user: `${K}.user`,
  roam: `${K}.roam`,
  theme: `${K}.theme`,
  scale: `${K}.window.scale`,
  sound: `${K}.sound`,
  hover: `${K}.hoverButtons`,
} as const;

/** The pet menu's actions in its order (the World's PET_ACTIONS), with the icon each shows. */
const ACTIONS: ReadonlyArray<[id: string, icon: string]> = [
  ['chat', 'chat'], ['voice', 'mic'], ['roam', 'roam_calm'], ['theme', 'moon'], ['sound', 'sound'], ['dress', 'shirt'], ['hide', 'eyeOff'],
];
/** Most hover buttons (the World's MAX_HOVER_BUTTONS). */
const MAX_HOVER = 6;

const S = pick({
  zh: {
    nav: '习惯',
    settingsTitle: '习惯',
    user: '怎么称呼你',
    userHint: 'Coo 会用这个名字叫你。',
    roam: '走动',
    roamFree: '常走动',
    roamCalm: '多待着',
    roamOff: '不乱动',
    theme: '颜色',
    themeDark: '夜间(浅色身体)',
    themeLight: '白天(深色身体)',
    scale: '大小',
    sound: '音效',
    hover: '悬停按钮',
    hoverHint: (n: number) => `鼠标停在 Coo 身上时旁边出现的按钮,最多 ${n} 个。`,
    actions: { chat: '打字', voice: '语音输入', roam: '行为模式', theme: '夜间模式', sound: '音效', dress: '装扮', hide: '隐藏桌宠' } as Record<string, string>,
    saved: '已保存',
    saveFailed: (why: string) => `没保存上:${why}`,
  },
  en: {
    nav: 'Habits',
    settingsTitle: 'Habits',
    user: 'What to call you',
    userHint: 'Coo calls you by this name.',
    roam: 'Walking',
    roamFree: 'Often',
    roamCalm: 'Now and then',
    roamOff: 'Stay put',
    theme: 'Colors',
    themeDark: 'Night (light body)',
    themeLight: 'Day (dark body)',
    scale: 'Size',
    sound: 'Sounds',
    hover: 'Hover buttons',
    hoverHint: (n: number) => `Buttons beside Coo while the pointer rests on it, up to ${n}.`,
    actions: { chat: 'Type', voice: 'Voice input', roam: 'Walking', theme: 'Night mode', sound: 'Sounds', dress: 'Dress up', hide: 'Hide pet' } as Record<string, string>,
    saved: 'Saved',
    saveFailed: (why: string) => `Not saved: ${why}`,
  },
});

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** While the size slider moves, at most one save per this many milliseconds. */
const SCALE_SEND_MS = 80;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- habits ---------- */
  const habits = ui.sheet({ title: S.settingsTitle });
  const msg = ui.msgline('');

  const user = ui.input({ placeholder: '伙伴' });
  const roam = ui.segmented([
    { value: 'free', label: S.roamFree }, { value: 'calm', label: S.roamCalm }, { value: 'off', label: S.roamOff },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.roam, v) });
  const theme = ui.segmented([
    { value: 'dark', label: S.themeDark }, { value: 'light', label: S.themeLight },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.theme, v) });
  const scale = ui.h('input', 'companion-range');
  scale.type = 'range';
  scale.min = '0.5'; scale.max = '2'; scale.step = '0.05';
  const scaleText = ui.h('span', 'companion-rangeval');
  const scaleBox = ui.h('div', 'companion-rangebox');
  scaleBox.append(scale, scaleText);
  const sound = ui.checkbox(S.sound, { onChange: (on) => void save(KEYS.sound, on) });
  // hover buttons: one round toggle per action, in the menu's order; picked ones are lit
  let picked: string[] = [];
  const hoverBox = ui.h('div', 'companion-hoverpick');
  const hoverBtns = ACTIONS.map(([id, iconName]) => {
    const b = ui.h('button', 'companion-hoverbtn');
    b.type = 'button';
    b.title = S.actions[id] ?? id;
    b.setAttribute('aria-label', b.title);
    b.innerHTML = ICONS[iconName] ?? '';
    b.append(ui.h('span', 'companion-hoverlbl', S.actions[id] ?? id));
    b.addEventListener('click', () => {
      const on = picked.includes(id);
      if (!on && picked.length >= MAX_HOVER) return;
      // kept in the menu's order, whatever order they were picked in
      picked = ACTIONS.map(([a]) => a).filter((a) => (a === id ? !on : picked.includes(a)));
      renderHover();
      void save(KEYS.hover, picked.join(','));
    });
    hoverBox.append(b);
    return [id, b] as const;
  });
  const renderHover = () => {
    for (const [id, b] of hoverBtns) {
      const on = picked.includes(id);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !on && picked.length >= MAX_HOVER;
    }
  };

  const row = (label: string, control: HTMLElement, hint?: string) => {
    const r = ui.h('div', 'companion-row');
    const l = ui.h('div', 'companion-label', label);
    const c = ui.h('div', 'companion-control');
    c.append(control);
    if (hint) c.append(ui.h('p', 'home-note', hint));
    r.append(l, c);
    return r;
  };
  habits.body.append(
    row(S.user, user, S.userHint),
    row(S.roam, roam.el),
    row(S.theme, theme.el),
    row(S.scale, scaleBox),
    row('', sound.el),
    row(S.hover, hoverBox, S.hoverHint(MAX_HOVER)),
    msg,
  );
  root.append(habits.el);

  /* ---------- behaviour ---------- */
  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(GROUP, { [key]: value }, opts);
      msg.textContent = S.saved;
      msg.classList.remove('bad');
    } catch (err) {
      if (signal.aborted) return;
      msg.textContent = S.saveFailed(errText(err));
      msg.classList.add('bad');
    }
  };
  const showScale = () => { scaleText.textContent = `${Math.round(Number(scale.value) * 100)}%`; };
  // saved while the slider moves, so the pet on the desktop grows and shrinks with it
  let scaleTimer: ReturnType<typeof setTimeout> | null = null;
  let scaleSent = '';
  const sendScale = () => {
    scaleTimer = null;
    if (scale.value === scaleSent) return;
    scaleSent = scale.value;
    void save(KEYS.scale, Number(scale.value));
  };
  scale.addEventListener('input', () => { showScale(); scaleTimer ??= setTimeout(sendScale, SCALE_SEND_MS); });
  scale.addEventListener('change', () => { if (scaleTimer) clearTimeout(scaleTimer); sendScale(); });
  signal.addEventListener('abort', () => { if (scaleTimer) clearTimeout(scaleTimer); });
  const saveUser = () => {
    const name = user.value.trim();
    if (name && name !== user.dataset.saved) { user.dataset.saved = name; void save(KEYS.user, name); }
  };
  user.addEventListener('change', saveUser);
  user.addEventListener('keydown', (e) => { if (e.key === 'Enter') user.blur(); });

  const refreshValues = async () => {
    let values: Record<string, unknown> = {};
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      values = d.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
    } catch { return; }
    const active = document.activeElement;
    if (typeof values[KEYS.user] === 'string' && active !== user) {
      user.value = values[KEYS.user] as string;
      user.dataset.saved = user.value;
    }
    if (typeof values[KEYS.roam] === 'string') roam.setValue(values[KEYS.roam] as string);
    if (typeof values[KEYS.theme] === 'string') theme.setValue(values[KEYS.theme] as string);
    if (typeof values[KEYS.scale] === 'number' && active !== scale) { scale.value = String(values[KEYS.scale]); showScale(); }
    if (typeof values[KEYS.sound] === 'boolean') sound.setChecked(values[KEYS.sound] as boolean);
    if (typeof values[KEYS.hover] === 'string') {
      picked = (values[KEYS.hover] as string).split(',').map((x) => x.trim()).filter((x) => ACTIONS.some(([a]) => a === x));
      renderHover();
    }
  };

  await refreshValues();
  ctx.lifecycle.interval(() => void refreshValues(), 3000);
}

export const petFeature: FrameworkFeature = {
  route: 'pet',
  label: S.nav,
  icon: 'bot',
  navMode: 'primary',
  mount,
};
