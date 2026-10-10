/**
 * 「习惯」: the everyday settings of the desktop pet, in sections: 通用 (language, what Coo calls you,
 * the app's anonymous usage statistics in the `companion` group, core/telemetry.ts), 行为与互动, 显示,
 * 音效 and 电脑操作 (features/cua). Every row names its setting in the label column, except one that
 * only refines the row above it; on/off settings are checkboxes. Most are written to the desktop-pet
 * World's config group through `/api/config` (only the keys shown here are sent). The pet's own menu
 * changes some of the same values, so they are read again every few seconds. Dressing up has its own
 * page (features/dress). The hover buttons are picked from the pet menu's own actions, drawn with the
 * pet page's icons. The 「音效」 section writes the World's sound group: the master switch (the same
 * one the pet menu flips), each kind of sound, and how long Coo snores in each sleep.
 *
 * The first row is the app language (`language` in the `companion` group), listed by the names the
 * Core gives (`/api/config/options/coopanion.language`). A change applies at once: the Core tells the
 * app, which reloads this window in the new language.
 *
 * 「回应模式」 (`touch.wakeOn`) and 「自主配置权限」 (`selfAdjust`) are read from the pet panel's state,
 * which gives values written by earlier versions as they now read. Their 「自定义…」 opens a popup whose
 * picks (a list, a map) `/api/config` cannot write; they are saved through the pet panel's
 * `setWakeKinds` and `setSelfAdjustCustom`, which set the mode to `custom` in the same write.
 */
import { ICONS } from 'cortico-world-desktop-pet/web/ui.js';
import { get, post, setConfig } from '../../core/api.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { intro } from '../intro.ts';
import { cuaSection } from '../cua/index.ts';
import { scaleSlider } from './scale-slider.ts';
import { S } from './strings.ts';

const GROUP = 'world:desktop-pet';
const SOUND_GROUP = 'world:desktop-pet:sound';
const STATS_GROUP = 'companion';
const STATS_KEY = 'companion.telemetry';
const STATS_DOC = 'https://github.com/Pal-AI-Lab/Coopanion/blob/main/docs/TELEMETRY.md';
/** The app language: a key of the `companion` group, its choices from the Core. */
const LANGUAGE_KEY = 'language';
const LANGUAGE_OPTIONS = '/api/config/options/coopanion.language';
/** The pet panel's methods: `state` gives the default name for the person in the app language and the two rows below. */
const PET_PANEL = '/api/console/providers/world%3Adesktop-pet/panels/pet/';
const PET_STATE = `${PET_PANEL}state`;
const K = 'worlds.desktop-pet';
const KEYS = {
  user: `${K}.user`,
  roam: `${K}.roam`,
  theme: `${K}.theme`,
  scale: `${K}.window.scale`,
  lockFps: `${K}.window.lockFrameRate`,
  frameRate: `${K}.window.frameRate`,
  hideFullscreen: `${K}.window.hideWhenFullscreen`,
  sound: `${K}.sound`,
  snoreSeconds: `${K}.sounds.snoreSeconds`,
  remember: `${K}.rememberPosition`,
  hover: `${K}.hoverButtons`,
  dblclick: `${K}.doubleClickChat`,
  statusBubble: `${K}.statusBubble`,
  wakeOn: `${K}.touch.wakeOn`,
  selfAdjust: `${K}.selfAdjust`,
} as const;

/** `touch.wakeOn` in the row's order, and the touches 「自定义…」 picks from (the World's TOUCH_KINDS). */
const WAKE_MODES = ['none', 'poke', 'all', 'custom'] as const;
const TOUCH_KINDS = ['poke', 'pet', 'throw', 'drop'] as const;
/** `selfAdjust` in the row's order, and `pet_set`'s items in the World's order (SELF_KEYS), the first four direct by default. */
const SELF_MODES = ['off', 'default', 'any', 'custom'] as const;
const SELF_KEYS = ['figure', 'scheme', 'roam', 'snoreSeconds', 'sound', 'scale', 'theme', 'hoverButtons', 'user'] as const;
const SELF_DEFAULT: readonly string[] = ['figure', 'scheme', 'roam', 'snoreSeconds'];

/** What the pet panel's state says of the two rows. */
interface HabitState {
  wake?: { wakeOn: string; wakeKinds: string[] };
  selfAdjust?: { mode: string; custom: Record<string, boolean> };
}

/** The pet menu's actions in its order (the World's PET_ACTIONS), with the icon each shows. */
const ACTIONS: ReadonlyArray<[id: string, icon: string]> = [
  ['chat', 'chat'], ['voice', 'mic'], ['roam', 'roam_calm'], ['theme', 'moon'], ['sound', 'sound'], ['dress', 'shirt'], ['hide', 'eyeOff'],
];
/** Kinds of sound (the World's SOUND_KINDS), each under `worlds.desktop-pet.sounds.<kind>`. */
const SOUND_KINDS = ['move', 'touch', 'face', 'snore', 'talk', 'ui'] as const;
/** Most hover buttons (the World's MAX_HOVER_BUTTONS). */
const MAX_HOVER = 6;

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** The size range (as SCALE_MIN, SCALE_MAX in the World's config.ts) and where the slider's short stretch starts; the frame-rate choices, 0 following the display. */
const SCALE_MIN = .5, SCALE_SOFT_MAX = 2, SCALE_MAX = 10;
const FRAME_RATES = [60, 120, 144, 0];

/** While the size slider moves, at most one save per this many milliseconds. */
const SCALE_SEND_MS = 80;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- habits ---------- */
  const habits = ui.sheet({ title: S.groupGeneral });
  const msg = ui.msgline('');

  const language = ui.select({ onChange: (v) => void save(LANGUAGE_KEY, v, STATS_GROUP) });
  void get<{ options?: Array<{ value: string; label: string }> }>(LANGUAGE_OPTIONS, opts).then((d) => {
    const current = language.value;
    language.replaceChildren(...(d.options ?? []).map((o) => { const el = ui.h('option', null, o.label); el.value = o.value; return el; }));
    if (current) language.value = current;
  }).catch(() => {});
  const user = ui.input();
  void post<{ defaultUser?: string }>(PET_STATE, { args: [] }, opts).then((s) => { if (s?.defaultUser) user.placeholder = s.defaultUser; }).catch(() => {});
  const roam = ui.segmented([
    { value: 'free', label: S.roamFree }, { value: 'calm', label: S.roamCalm }, { value: 'off', label: S.roamOff },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.roam, v) });
  const theme = ui.segmented([
    { value: 'dark', label: S.themeDark }, { value: 'light', label: S.themeLight },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.theme, v) });
  const scaleText = ui.h('span', 'companion-rangeval');
  const scaleBox = ui.h('div', 'companion-rangebox');
  const scale = scaleSlider(root.ownerDocument, {
    min: SCALE_MIN, soft: SCALE_SOFT_MAX, max: SCALE_MAX, label: S.scale,
    room: () => scaleBox.clientWidth - scaleText.offsetWidth - 12,
    onInput: () => { showScale(); scaleTimer ??= setTimeout(sendScale, SCALE_SEND_MS); },
    onChange: () => { if (scaleTimer) clearTimeout(scaleTimer); sendScale(); },
  });
  scaleBox.append(scale.el, scaleText);
  new ResizeObserver(() => scale.relayout()).observe(scaleBox);
  const frameRate = ui.segmented(FRAME_RATES.map((n) => ({ value: String(n), label: n ? String(n) : S.frameUnlimited })),
    { size: 'sm', onSelect: (v) => void save(KEYS.frameRate, Number(v)) });
  const lockFps = ui.checkbox(S.lockFps, { onChange: (on) => void save(KEYS.lockFps, on) });
  const hideFullscreen = ui.checkbox(S.hideFullscreen, { onChange: (on) => void save(KEYS.hideFullscreen, on) });
  const remember = ui.checkbox(S.remember, { onChange: (on) => void save(KEYS.remember, on) });
  const dblclick = ui.checkbox(S.dblclick, { onChange: (on) => void save(KEYS.dblclick, on) });
  const statusBubble = ui.checkbox(S.statusBubble, { onChange: (on) => void save(KEYS.statusBubble, on) });
  // the two rows below follow the pet panel's state; 「自定义…」 is picked by saving its popup
  let habit: Required<HabitState> = { wake: { wakeOn: 'poke', wakeKinds: ['poke'] }, selfAdjust: { mode: 'default', custom: {} } };
  const wakeHint = ui.h('p', 'home-note');
  const wake = ui.segmented(WAKE_MODES.map((v) => ({ value: v, label: S.wakeModes[v] ?? v })), {
    size: 'sm',
    onSelect: (v) => {
      if (v === 'custom') return;
      habit.wake.wakeOn = v;
      renderHabits();
      void save(KEYS.wakeOn, v);
    },
  });
  const selfHint = ui.h('p', 'home-note');
  const selfMode = ui.segmented(SELF_MODES.map((v) => ({ value: v, label: S.selfModes[v] ?? v })), {
    size: 'sm',
    onSelect: (v) => {
      if (v === 'custom') return;
      habit.selfAdjust.mode = v;
      renderHabits();
      void save(KEYS.selfAdjust, v);
    },
  });
  // 「自定义…」 opens its popup each time, picked or not; the row shows it picked once the popup is saved
  wake.el.lastElementChild?.addEventListener('click', () => { renderHabits(); openWakePopup(); }, { signal });
  selfMode.el.lastElementChild?.addEventListener('click', () => { renderHabits(); openSelfPopup(); }, { signal });
  const directOf = (h: Required<HabitState>) => (h.selfAdjust.mode === 'any' ? [...SELF_KEYS]
    : h.selfAdjust.mode === 'default' ? SELF_KEYS.filter((k) => SELF_DEFAULT.includes(k))
    : SELF_KEYS.filter((k) => h.selfAdjust.custom[k] ?? SELF_DEFAULT.includes(k)));
  function renderHabits(): void {
    const { wakeOn, wakeKinds } = habit.wake;
    wake.setValue(wakeOn);
    const kinds = TOUCH_KINDS.filter((k) => wakeKinds.includes(k)).map((k) => S.wakeKinds[k] ?? k);
    wakeHint.textContent = wakeOn !== 'custom' ? S.wakeHints[wakeOn] ?? '' : kinds.length ? S.wakeCustomHint(kinds) : S.wakeHints.none ?? '';
    const mode = habit.selfAdjust.mode;
    selfMode.setValue(mode);
    const direct = directOf(habit);
    const name = (k: string) => S.selfItems[k] ?? k;
    selfHint.textContent = mode !== 'custom' ? S.selfHints[mode] ?? ''
      : direct.length === SELF_KEYS.length ? S.selfHints.any ?? ''
      : S.selfCustomHint(direct.map(name), SELF_KEYS.filter((k) => !direct.includes(k)).map(name));
  }
  /** A popup of checkboxes; `onSave` gets the keys left checked. */
  function popup(title: string, note: string | null, items: ReadonlyArray<[key: string, label: string, on: boolean]>, onSave: (keys: string[]) => void): void {
    const body = ui.h('div', 'companion-popup');
    if (note) body.append(ui.h('p', 'home-note', note));
    const list = ui.h('div', 'companion-checks');
    const boxes = items.map(([key, label, on]) => {
      const c = ui.checkbox(label, { checked: on });
      list.append(c.el);
      return [key, c] as const;
    });
    const bar = ui.actions();
    const cancel = ui.button(S.popupCancel);
    const ok = ui.button(S.popupSave, { variant: 'primary' });
    bar.append(ui.h('span', 'grow'), cancel, ok);
    body.append(list, bar);
    const drawer = ui.drawer(title, body);
    cancel.addEventListener('click', () => drawer.dispose(), { signal });
    ok.addEventListener('click', () => {
      drawer.dispose();
      onSave(boxes.filter(([, c]) => c.checked).map(([key]) => key));
    }, { signal });
    boxes[0]?.[1].input.focus();
  }
  function openWakePopup(): void {
    const { wakeKinds } = habit.wake;
    popup(S.wakeTitle, null, TOUCH_KINDS.map((k) => [k, S.wakeKinds[k] ?? k, wakeKinds.includes(k)]), (kinds) => {
      habit.wake = { wakeOn: 'custom', wakeKinds: kinds };
      renderHabits();
      void callPet('setWakeKinds', [kinds]);
    });
  }
  function openSelfPopup(): void {
    // starts from what the mode in force lets Coo change directly; from `off`, from the custom picks
    const direct = habit.selfAdjust.mode === 'off' ? directOf({ ...habit, selfAdjust: { ...habit.selfAdjust, mode: 'custom' } }) : directOf(habit);
    popup(S.selfTitle, S.selfNote, SELF_KEYS.map((k) => [k, S.selfItems[k] ?? k, direct.includes(k)]), (keys) => {
      const custom = Object.fromEntries(SELF_KEYS.map((k) => [k, keys.includes(k)]));
      habit.selfAdjust = { mode: 'custom', custom };
      renderHabits();
      void callPet('setSelfAdjustCustom', [custom]);
    });
  }
  const stats = ui.checkbox(S.stats, { onChange: (on) => void save(STATS_KEY, on, STATS_GROUP) });
  const statsDoc = ui.h('a', 'home-link companion-statsdoc', S.statsDoc);
  statsDoc.href = STATS_DOC;
  statsDoc.target = '_blank';
  statsDoc.rel = 'noreferrer';
  const statsBox = ui.h('div');
  statsBox.append(stats.el, statsDoc);
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

  const row = (label: string, control: HTMLElement, hint?: string | HTMLElement) => {
    const r = ui.h('div', 'companion-row');
    const l = ui.h('div', 'companion-label', label);
    const c = ui.h('div', 'companion-control');
    // what the setting means first, the setting under it
    if (hint) c.append(typeof hint === 'string' ? ui.h('p', 'home-note', hint) : hint);
    c.append(control);
    r.append(l, c);
    return r;
  };
  // the World declares this setting on Windows only; elsewhere its value never arrives and the row stays hidden
  const hideFullscreenRow = row(S.hideFullscreenLabel, hideFullscreen.el, S.hideFullscreenHint);
  hideFullscreenRow.hidden = true;

  // sections: general, how Coo behaves and is reached, how it shows on the screen, sounds, computer use;
  // every row names its setting on the left, except one that only refines the row above it
  habits.body.append(
    row(S.language, language, S.languageHint),
    row(S.user, user, S.userHint),
    row(S.statsLabel, statsBox, S.statsHint),
    msg,
  );
  const behavior = ui.sheet({ title: S.groupBehavior });
  behavior.body.append(
    row(S.roam, roam.el),
    row(S.wake, wake.el, wakeHint),
    row(S.self, selfMode.el, selfHint),
    row(S.hover, hoverBox, S.hoverHint(MAX_HOVER)),
    row(S.dblclickLabel, dblclick.el),
    row(S.statusBubbleLabel, statusBubble.el, S.statusBubbleHint),
  );
  const display = ui.sheet({ title: S.groupDisplay });
  display.body.append(
    row(S.theme, theme.el),
    row(S.scale, scaleBox),
    row(S.frameRate, frameRate.el, S.frameRateHint),
    row('', lockFps.el, S.lockFpsHint),
    hideFullscreenRow,
    row(S.rememberLabel, remember.el, S.rememberHint),
  );
  root.append(intro(ui, S.nav), habits.el, behavior.el, display.el);

  /* ---------- sounds ---------- */
  const sounds = ui.sheet({ title: S.soundTitle });
  const soundMsg = ui.msgline('');
  const sound = ui.checkbox(S.sound, { onChange: (on) => { void save(KEYS.sound, on, SOUND_GROUP, soundMsg); renderKinds(); } });
  const kindBox = ui.h('div', 'companion-checks');
  const kinds = SOUND_KINDS.map((kind) => {
    const [label, what] = S.kinds[kind] ?? [kind, ''];
    const c = ui.checkbox(label, { title: what, onChange: (on) => void save(`${K}.sounds.${kind}`, on, SOUND_GROUP, soundMsg) });
    kindBox.append(c.el);
    return [kind, c] as const;
  });
  // the kinds only matter while sounds play at all
  const renderKinds = () => { for (const [, c] of kinds) c.input.disabled = !sound.checked; };
  const snore = ui.input({ type: 'number' });
  snore.min = '0'; snore.max = '3600'; snore.step = '1';
  const snoreBox = ui.h('div', 'companion-rangebox');
  snoreBox.append(snore, ui.h('span', 'companion-rangeval', S.snoreUnit));
  sounds.body.append(
    row(S.soundLabel, sound.el, S.soundHint),
    row(S.soundKinds, kindBox, S.soundKindsHint),
    row(S.snore, snoreBox, S.snoreHint),
    soundMsg,
  );
  root.append(sounds.el, cuaSection(ctx, row));

  /* ---------- behaviour ---------- */
  const save = async (key: string, value: string | number | boolean, group = GROUP, line = msg) => {
    try {
      await setConfig(group, { [key]: value }, opts);
      // everything saves as it changes: only a failure is worth a line
      line.textContent = '';
      line.classList.remove('bad');
    } catch (err) {
      if (signal.aborted) return;
      line.textContent = S.saveFailed(errText(err));
      line.classList.add('bad');
    }
  };
  /** Calls a pet panel method; a failure shows on the habits line, and the rows follow the state it returns. */
  const callPet = async (method: string, args: unknown[]) => {
    try {
      const state = await post<HabitState>(PET_PANEL + method, { args }, opts);
      takeHabits(state);
      msg.textContent = '';
      msg.classList.remove('bad');
    } catch (err) {
      if (signal.aborted) return;
      msg.textContent = S.saveFailed(errText(err));
      msg.classList.add('bad');
    }
  };
  function takeHabits(state: HabitState | null | undefined): void {
    if (!state?.wake || !state.selfAdjust) return;
    habit = { wake: state.wake, selfAdjust: state.selfAdjust };
    renderHabits();
  }
  function showScale(): void { scaleText.textContent = `${Math.round(scale.value * 100)}%`; }
  // saved while the slider moves, so the pet on the desktop grows and shrinks with it
  let scaleTimer: ReturnType<typeof setTimeout> | null = null;
  let scaleSent = NaN;
  function sendScale(): void {
    scaleTimer = null;
    if (scale.value === scaleSent) return;
    scaleSent = scale.value;
    void save(KEYS.scale, scale.value);
  }
  signal.addEventListener('abort', () => { if (scaleTimer) clearTimeout(scaleTimer); });
  const saveUser = () => {
    const name = user.value.trim();
    if (name && name !== user.dataset.saved) { user.dataset.saved = name; void save(KEYS.user, name); }
  };
  user.addEventListener('change', saveUser);
  user.addEventListener('keydown', (e) => { if (e.key === 'Enter') user.blur(); });
  snore.addEventListener('change', () => {
    const n = Math.round(Number(snore.value));
    if (snore.value === '' || !Number.isFinite(n) || n < 0 || n > 3600) { snore.value = snore.dataset.saved ?? '0'; return; }
    snore.value = String(n);
    if (snore.value !== snore.dataset.saved) { snore.dataset.saved = snore.value; void save(KEYS.snoreSeconds, n, SOUND_GROUP, soundMsg); }
  });
  snore.addEventListener('keydown', (e) => { if (e.key === 'Enter') snore.blur(); });

  const refreshValues = async () => {
    const habitState = post<HabitState>(PET_STATE, { args: [] }, opts).catch(() => null);
    let values: Record<string, unknown> = {};
    let soundValues: Record<string, unknown> = {};
    let statsValues: Record<string, unknown> = {};
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      values = d.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
      soundValues = d.groups?.find((g) => g.group.id === SOUND_GROUP)?.values ?? {};
      statsValues = d.groups?.find((g) => g.group.id === STATS_GROUP)?.values ?? {};
    } catch { return; }
    if (typeof statsValues[STATS_KEY] === 'boolean') stats.setChecked(statsValues[STATS_KEY] as boolean);
    if (typeof statsValues[LANGUAGE_KEY] === 'string' && document.activeElement !== language) {
      // before the choices arrive the select keeps the value as a lone option
      if (![...language.options].some((o) => o.value === statsValues[LANGUAGE_KEY])) language.append(Object.assign(ui.h('option', null, statsValues[LANGUAGE_KEY] as string), { value: statsValues[LANGUAGE_KEY] as string }));
      language.value = statsValues[LANGUAGE_KEY] as string;
    }
    const active = document.activeElement;
    if (typeof values[KEYS.user] === 'string' && active !== user) {
      user.value = values[KEYS.user] as string;
      user.dataset.saved = user.value;
    }
    if (typeof values[KEYS.roam] === 'string') roam.setValue(values[KEYS.roam] as string);
    if (typeof values[KEYS.theme] === 'string') theme.setValue(values[KEYS.theme] as string);
    if (typeof values[KEYS.scale] === 'number' && !scale.active && active !== scale.el) { scale.set(values[KEYS.scale] as number); showScale(); }
    if (typeof values[KEYS.frameRate] === 'number') frameRate.setValue(String(values[KEYS.frameRate]));
    if (typeof soundValues[KEYS.sound] === 'boolean') sound.setChecked(soundValues[KEYS.sound] as boolean);
    for (const [kind, c] of kinds) {
      const v = soundValues[`${K}.sounds.${kind}`];
      if (typeof v === 'boolean') c.setChecked(v);
    }
    renderKinds();
    if (typeof soundValues[KEYS.snoreSeconds] === 'number' && active !== snore) {
      snore.value = String(soundValues[KEYS.snoreSeconds]);
      snore.dataset.saved = snore.value;
    }
    if (typeof values[KEYS.lockFps] === 'boolean') lockFps.setChecked(values[KEYS.lockFps] as boolean);
    if (typeof values[KEYS.hideFullscreen] === 'boolean') { hideFullscreen.setChecked(values[KEYS.hideFullscreen] as boolean); hideFullscreenRow.hidden = false; }
    if (typeof values[KEYS.remember] === 'boolean') remember.setChecked(values[KEYS.remember] as boolean);
    if (typeof values[KEYS.dblclick] === 'boolean') dblclick.setChecked(values[KEYS.dblclick] as boolean);
    if (typeof values[KEYS.statusBubble] === 'boolean') statusBubble.setChecked(values[KEYS.statusBubble] as boolean);
    // a popup open over the page keeps the rows as they are until it is saved or closed
    const state = await habitState;
    if (!root.ownerDocument.querySelector('.companion-popup')) takeHabits(state);
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
