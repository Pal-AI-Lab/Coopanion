/**
 * 「习惯」: the everyday settings of the desktop pet, in sections: 通用 (language, what Coo calls you, Coo's
 * name, automatic updates and anonymous usage statistics in the `companion` group), 行为与互动, 显示,
 * 音效, 电脑操作 (features/cua) and 其他 (the OBS overlay, the Chat page's context ring). Every row names its
 * setting in the label column, except one that only refines the row above it. In each row the setting
 * comes first and what it means under it. An on/off setting is a switch; picks among several (sound
 * kinds, the popups) are checkboxes. Most are written to the desktop-pet World's config group through `/api/config` (only the keys shown here are sent). The pet's own menu
 * changes some of the same values, so they are read again every few seconds. Dressing up has its own
 * page (features/dress). The hover buttons are picked from the pet menu's own actions, drawn with the
 * pet page's icons. The 「音效」 section writes the World's sound group: the master switch (the same
 * one the pet menu flips), each kind of sound, and how long Coo snores in each sleep. 「说话声」 writes the
 * same group: the speech that replaces the babble, and its pitch and speed, each a step or 自定义; picking
 * 自定义 shows its number under the steps, starting from the step picked before. The speech switch is
 * disabled while sounds are off, and pitch and speed are greyed while the speech cannot be heard (sounds,
 * the 说话 kind or the speech itself off), as the kinds are while sounds are off.
 *
 * The first row is the app language (`language` in the `companion` group), listed by the names the
 * Core gives (`/api/config/options/coopanion.language`). A change applies at once: the Core tells the
 * app, which reloads this window in the new language.
 *
 * 「Coo 的名字」 is `displayName` in Core's config, the name the rail shows and renames.
 *
 * 「回应模式」 (`touch.wakeOn`) and 「自主配置权限」 (`selfAdjust`) are read from the pet panel's state,
 * which gives values written by earlier versions as they now read. Their 「自定义…」 opens a popup whose
 * picks (a list, a map) `/api/config` cannot write; they are saved through the pet panel's
 * `setWakeKinds` and `setSelfAdjustCustom`, which set the mode to `custom` in the same write.
 *
 * 「打字键」 (`typeKey`) is read from the same state and saved through the pet panel's `setTypeKey`; its
 * keys are set as the talk key's on the 语音输入 page (key-capture.ts), and how they are pressed is
 * picked beside them. The state names the keys in the app language and says why they cannot be read.
 */
import { ICONS } from 'cortico-world-desktop-pet/web/ui.js';
import { captureKey, PRESSES, splitTaps, withTaps } from 'cortico-world-desktop-pet/webui/key-capture.ts';
import { get, invokePanel, setConfig } from '../../base/api.ts';
import type { Page, PageContext } from '../../base/page.ts';
import { intro } from '../intro.ts';
import { CUA_GROUP, cuaSection } from '../cua/index.ts';
import { announceName } from '../bot-name.ts';
import { scaleSlider } from './scale-slider.ts';
import { S } from './strings.ts';

const GROUP = 'world:desktop-pet';
const SOUND_GROUP = 'world:desktop-pet:sound';
const STATS_GROUP = 'companion';
const STATS_KEY = 'companion.telemetry';
const AUTO_UPDATE_KEY = 'companion.autoUpdate';
const STATS_DOC = 'https://github.com/Pal-AI-Lab/Coopanion/blob/main/docs/TELEMETRY.md';
/** Whether the Chat page shows its context ring (features/chat/context.ts), in the `companion` group; off by default. */
const RING_KEY = 'companion.contextRing';
/** The app language: a key of the `companion` group, its choices from the Core. */
const LANGUAGE_KEY = 'language';
const LANGUAGE_OPTIONS = '/api/config/options/coopanion.language';
/** The bot's name: a key of Core's own group; cleared, it is Coopanion's default (DISPLAY_NAME in core/seed.ts). */
const NAME_GROUP = 'core';
const NAME_KEY = 'displayName';
const DEFAULT_NAME = 'Coo';
/** The pet panel's page: its `state` gives the default name for the person in the app language and the two rows below. */
const PET_PAGE = 'world:desktop-pet';
const K = 'worlds.desktop-pet';
const KEYS = {
  user: `${K}.user`,
  roam: `${K}.roam`,
  scale: `${K}.window.scale`,
  bubbleSize: `${K}.window.bubbleSize`,
  fontSize: `${K}.window.fontSize`,
  bubbleSpeed: `${K}.window.bubbleSpeed`,
  glow: `${K}.window.glow`,
  lockFps: `${K}.window.lockFrameRate`,
  frameRate: `${K}.window.frameRate`,
  hideFullscreen: `${K}.window.hideWhenFullscreen`,
  overlay: `${K}.window.exportOverlay`,
  sound: `${K}.sound`,
  snoreSeconds: `${K}.sounds.snoreSeconds`,
  speech: `${K}.speech.enabled`,
  speechPitch: `${K}.speech.pitch`,
  speechPitchHz: `${K}.speech.pitchHz`,
  speechSpeed: `${K}.speech.speed`,
  speechRate: `${K}.speech.unitsPerSecond`,
  remember: `${K}.rememberPosition`,
  hover: `${K}.hoverButtons`,
  dblclick: `${K}.doubleClickChat`,
  statusBubble: `${K}.statusBubble`,
  saidBubbles: `${K}.saidBubbles`,
  wakeOn: `${K}.touch.wakeOn`,
  selfAdjust: `${K}.selfAdjust`,
} as const;

/** `touch.wakeOn` in the row's order, and the touches 「自定义…」 picks from (the World's TOUCH_KINDS). */
const WAKE_MODES = ['none', 'poke', 'all', 'custom'] as const;
const TOUCH_KINDS = ['poke', 'pet', 'throw', 'drop'] as const;
/** `selfAdjust` in the row's order, and `pet_set`'s items in the World's order (SELF_KEYS), the first four direct by default. */
const SELF_MODES = ['off', 'default', 'any', 'custom'] as const;
const SELF_KEYS = ['figure', 'scheme', 'roam', 'snoreSeconds', 'sound', 'scale', 'bubbleSize', 'fontSize', 'theme', 'hoverButtons', 'user'] as const;
const SELF_DEFAULT: readonly string[] = ['figure', 'scheme', 'roam', 'snoreSeconds'];

/** What the pet panel's state says of the two rows and of the typing key. */
interface HabitState {
  wake?: { wakeOn: string; wakeKinds: string[] };
  selfAdjust?: { mode: string; custom: Record<string, boolean> };
  typeKey?: TypeKeyState;
}
type Habits = Required<Pick<HabitState, 'wake' | 'selfAdjust'>>;
interface TypeKeyState { enabled: boolean; hotkey: string; keyLabel: string; problem: string | null }

/** The pet's actions in the menu's order (the World's PET_ACTIONS), with the icon each shows. */
const ACTIONS: ReadonlyArray<[id: string, icon: string]> = [
  ['chat', 'chat'], ['voice', 'mic'], ['roam', 'roam_calm'], ['theme', 'moon'], ['sound', 'sound'], ['hide', 'eyeOff'], ['dress', 'shirt'],
];
/** Kinds of sound (the World's SOUND_KINDS), each under `worlds.desktop-pet.sounds.<kind>`. */
const SOUND_KINDS = ['move', 'touch', 'face', 'snore', 'talk', 'ui'] as const;
/** The speech's steps, their numbers and the range of a custom one (SPEECH_LEVELS, SPEECH_PITCH_HZ, SPEECH_RATE in the World's config.ts). */
const SPEECH_LEVELS = ['low', 'mid', 'high', 'custom'] as const;
const SPEECH_PITCH = { steps: { low: 300, mid: 400, high: 500 } as Record<string, number>, min: 200, max: 700 };
const SPEECH_RATE = { steps: { low: 10, mid: 13, high: 16 } as Record<string, number>, min: 6, max: 20 };
/** Most hover buttons (the World's MAX_HOVER_BUTTONS). */
const MAX_HOVER = 6;

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** The size range (as SCALE_MIN, SCALE_MAX in the World's config.ts) and where the slider's short stretch starts; the frame-rate choices, 0 following the display. */
const SCALE_MIN = .5, SCALE_SOFT_MAX = 2, SCALE_MAX = 10;
/** The halo's reach in pixels, as GLOW_MAX and GLOW_DEFAULT in the World's config.ts: 0 turns it off. */
const GLOW_MAX = 16, GLOW_DEFAULT = 7;
/** The range of the bubble and text sizes, as BUBBLE_SIZE_MIN and BUBBLE_SIZE_MAX in the World's config.ts; 1 is the bubbles as they were drawn. */
const BUBBLE_SIZE_MIN = .8, BUBBLE_SIZE_MAX = 1.6;
/** The range of Coo's bubble speed, as BUBBLE_SPEED_MIN and BUBBLE_SPEED_MAX in the World's config.ts; at 1 a bubble types 20 characters a second. */
const BUBBLE_SPEED_MIN = .5, BUBBLE_SPEED_MAX = 2;
const FRAME_RATES = [60, 120, 144, 0];

/** While the size slider moves, at most one save per this many milliseconds. */
const SCALE_SEND_MS = 80;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function mount(ctx: PageContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');

  /* ---------- habits ---------- */
  const habits = ui.sheet({ title: S.groupGeneral });
  const msg = ui.msgline('');
  // a failure shows at the bottom of its own section
  const behaviorMsg = ui.msgline(''), displayMsg = ui.msgline('');

  const language = ui.select({ onChange: (v) => void save(LANGUAGE_KEY, v, STATS_GROUP) });
  void get<{ options?: Array<{ value: string; label: string }> }>(LANGUAGE_OPTIONS, opts).then((d) => {
    const current = language.value;
    language.replaceChildren(...(d.options ?? []).map((o) => { const el = ui.h('option', null, o.label); el.value = o.value; return el; }));
    if (current) language.value = current;
  }).catch(() => {});
  const user = ui.input();
  void invokePanel<{ defaultUser?: string }>(PET_PAGE, 'pet', 'state', [], opts).then((s) => { if (s?.defaultUser) user.placeholder = s.defaultUser; }).catch(() => {});
  const botName = ui.input();
  botName.placeholder = DEFAULT_NAME;
  const autoUpdate = ui.checkbox(S.autoUpdate, { onChange: (on) => void save(AUTO_UPDATE_KEY, on, STATS_GROUP) });
  const roam = ui.segmented([
    { value: 'free', label: S.roamFree }, { value: 'calm', label: S.roamCalm }, { value: 'off', label: S.roamOff },
  ], { size: 'sm', onSelect: (v) => void save(KEYS.roam, v, GROUP, behaviorMsg) });
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
  // 外发光: the same slider in whole pixels, 0 (off) to GLOW_MAX; saved once a drag or a key press ends
  const glowLabel = (v: number) => (v > 0 ? S.glowPx(v) : S.glowOff);
  const glowText = ui.h('span', 'companion-rangeval');
  const glowBox = ui.h('div', 'companion-rangebox');
  const glow = scaleSlider(root.ownerDocument, {
    min: 0, soft: GLOW_MAX, max: GLOW_MAX, step: 1, label: S.glow, format: glowLabel,
    room: () => glowBox.clientWidth - glowText.offsetWidth - 12,
    onInput: () => showGlow(),
    onChange: () => { showGlow(); void save(KEYS.glow, glow.value, GROUP, displayMsg); },
  });
  glowBox.append(glow.el, glowText);
  new ResizeObserver(() => glow.relayout()).observe(glowBox);
  const showGlow = () => { glowText.textContent = glowLabel(glow.value); };
  // 气泡尺寸, 字体尺寸 and 气泡速度: the same slider in steps of 5%, saved once a drag or a key press ends
  const percentSlider = (label: string, key: string, min: number, max: number) => {
    const text = ui.h('span', 'companion-rangeval');
    const box = ui.h('div', 'companion-rangebox');
    const show = () => { text.textContent = `${Math.round(slider.value * 100)}%`; };
    const slider = scaleSlider(root.ownerDocument, {
      min, soft: max, max, step: .05, label,
      room: () => box.clientWidth - text.offsetWidth - 12,
      onInput: () => show(),
      onChange: () => { show(); void save(key, slider.value, GROUP, displayMsg); },
    });
    box.append(slider.el, text);
    new ResizeObserver(() => slider.relayout()).observe(box);
    return { box, slider, show };
  };
  const bubbleSize = percentSlider(S.bubbleSize, KEYS.bubbleSize, BUBBLE_SIZE_MIN, BUBBLE_SIZE_MAX);
  const fontSize = percentSlider(S.fontSize, KEYS.fontSize, BUBBLE_SIZE_MIN, BUBBLE_SIZE_MAX);
  const bubbleSpeed = percentSlider(S.bubbleSpeed, KEYS.bubbleSpeed, BUBBLE_SPEED_MIN, BUBBLE_SPEED_MAX);
  const frameRate = ui.segmented(FRAME_RATES.map((n) => ({ value: String(n), label: n ? String(n) : S.frameUnlimited })),
    { size: 'sm', onSelect: (v) => void save(KEYS.frameRate, Number(v), GROUP, displayMsg) });
  const lockFps = ui.checkbox(S.lockFps, { onChange: (on) => void save(KEYS.lockFps, on, GROUP, displayMsg) });
  const hideFullscreen = ui.checkbox(S.hideFullscreen, { onChange: (on) => void save(KEYS.hideFullscreen, on, GROUP, displayMsg) });
  const remember = ui.checkbox(S.remember, { onChange: (on) => void save(KEYS.remember, on, GROUP, displayMsg) });
  const dblclick = ui.checkbox(S.dblclick, { onChange: (on) => void save(KEYS.dblclick, on, GROUP, behaviorMsg) });
  const statusBubble = ui.checkbox(S.statusBubble, { onChange: (on) => void save(KEYS.statusBubble, on, GROUP, behaviorMsg) });
  const saidBubbles = ui.checkbox(S.saidBubble, { onChange: (on) => void save(KEYS.saidBubbles, on, GROUP, behaviorMsg) });
  // the two rows below follow the pet panel's state; 「自定义…」 is picked by saving its popup
  let habit: Habits = { wake: { wakeOn: 'poke', wakeKinds: ['poke'] }, selfAdjust: { mode: 'default', custom: {} } };
  const wakeHint = ui.h('p', 'home-note');
  const wake = ui.segmented(WAKE_MODES.map((v) => ({ value: v, label: S.wakeModes[v] ?? v })), {
    size: 'sm',
    onSelect: (v) => {
      if (v === 'custom') return;
      habit.wake.wakeOn = v;
      renderHabits();
      void save(KEYS.wakeOn, v, GROUP, behaviorMsg);
    },
  });
  const selfHint = ui.h('p', 'home-note');
  const selfMode = ui.segmented(SELF_MODES.map((v) => ({ value: v, label: S.selfModes[v] ?? v })), {
    size: 'sm',
    onSelect: (v) => {
      if (v === 'custom') return;
      habit.selfAdjust.mode = v;
      renderHabits();
      void save(KEYS.selfAdjust, v, GROUP, behaviorMsg);
    },
  });
  // 「自定义…」 opens its popup each time, picked or not; the row shows it picked once the popup is saved
  wake.el.lastElementChild?.addEventListener('click', () => { renderHabits(); openWakePopup(); }, { signal });
  selfMode.el.lastElementChild?.addEventListener('click', () => { renderHabits(); openSelfPopup(); }, { signal });
  const directOf = (h: Habits) => (h.selfAdjust.mode === 'any' ? [...SELF_KEYS]
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
  // 打字键: the switch, and while it is on the keys, a button to set others and how they are pressed
  let typeKey: TypeKeyState = { enabled: false, hotkey: '', keyLabel: '', problem: null };
  const typeSwitch = ui.checkbox(S.typeKey, { onChange: (on) => void callPet('setTypeKey', [{ enabled: on }]) });
  const typeKeyName = ui.h('span', 'companion-rangeval');
  const typeKeyBtn = ui.button(S.typeKeyChange, { size: 'sm' });
  const typePress = ui.select({ onChange: (v) => void callPet('setTypeKey', [{ hotkey: withTaps(splitTaps(typeKey.hotkey).combo, Number(v)) }]) });
  const typeKeyBox = ui.h('div', 'companion-rangebox');
  typeKeyBox.append(typeKeyName, typeKeyBtn, typePress);
  const typeBox = ui.h('div', 'companion-switchbox');
  typeBox.append(typeSwitch.el, typeKeyBox);
  const typeHint = ui.h('p', 'home-note');
  let capture: { stop(): void } | null = null;
  typeKeyBtn.addEventListener('click', () => {
    if (capture) { capture.stop(); return; }
    typeKeyName.textContent = '…';
    typeKeyBtn.textContent = S.popupCancel;
    typeHint.textContent = S.typeKeyCapture;
    typeHint.classList.remove('bad');
    capture = captureKey(window, (combo) => {
      capture = null;
      typeKeyBtn.textContent = S.typeKeyChange;
      // how the keys are pressed stays as picked
      if (combo) void callPet('setTypeKey', [{ hotkey: withTaps(combo, splitTaps(typeKey.hotkey).taps) }]);
      else renderTypeKey();
    });
  }, { signal });
  signal.addEventListener('abort', () => capture?.stop());
  function renderTypeKey(): void {
    typeSwitch.setChecked(typeKey.enabled);
    typeKeyBox.hidden = !typeKey.enabled;
    if (capture) return;
    typeKeyName.textContent = typeKey.keyLabel;
    // a key set to three presses in config.json keeps its choice; the row offers two or one
    const { taps } = splitTaps(typeKey.hotkey);
    const presses = PRESSES.filter((n) => n < 3 || n === taps);
    if (typePress.dataset.list !== presses.join()) {
      typePress.dataset.list = presses.join();
      typePress.replaceChildren(...presses.map((n) => { const o = ui.h('option', null, S.typeKeyPresses[n] ?? String(n)); o.value = String(n); return o; }));
    }
    if (document.activeElement !== typePress) typePress.value = String(taps);
    const problem = typeKey.enabled ? typeKey.problem : null;
    typeHint.textContent = problem ?? S.typeKeyHint;
    typeHint.classList.toggle('bad', !!problem);
  }
  const stats = ui.checkbox(S.stats, { onChange: (on) => void save(STATS_KEY, on, STATS_GROUP) });
  const statsDoc = ui.h('a', 'home-link companion-statsdoc', S.statsDoc);
  statsDoc.href = STATS_DOC;
  statsDoc.target = '_blank';
  statsDoc.rel = 'noreferrer';
  const statsBox = ui.h('div', 'companion-switchbox');
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
      void save(KEYS.hover, picked.join(','), GROUP, behaviorMsg);
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
    // the setting first, what it means under it
    c.append(control);
    if (hint) c.append(typeof hint === 'string' ? ui.h('p', 'home-note', hint) : hint);
    r.append(l, c);
    return r;
  };
  // the World declares this setting on Windows only; elsewhere its value never arrives and the row stays hidden
  const hideFullscreenRow = row(S.hideFullscreenLabel, hideFullscreen.el, S.hideFullscreenHint);
  hideFullscreenRow.hidden = true;
  const autoUpdateRow = row(S.autoUpdateLabel, autoUpdate.el, S.autoUpdateHint);
  autoUpdateRow.hidden = true;

  // sections: general, how Coo behaves and is reached, how it shows on the screen, sounds, computer use;
  // every row names its setting on the left, except one that only refines the row above it
  habits.body.append(
    row(S.language, language, S.languageHint),
    row(S.user, user, S.userHint),
    row(S.botName, botName, S.botNameHint),
    autoUpdateRow,
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
    row(S.typeKeyLabel, typeBox, typeHint),
    row(S.statusBubbleLabel, statusBubble.el, S.statusBubbleHint),
    row(S.saidBubbleLabel, saidBubbles.el, S.saidBubbleHint),
    behaviorMsg,
  );
  const display = ui.sheet({ title: S.groupDisplay });
  display.body.append(
    row(S.scale, scaleBox),
    row(S.bubbleSize, bubbleSize.box, S.bubbleSizeHint),
    row(S.fontSize, fontSize.box, S.fontSizeHint),
    row(S.bubbleSpeed, bubbleSpeed.box, S.bubbleSpeedHint),
    row(S.glow, glowBox, S.glowHint),
    row(S.frameRate, frameRate.el, S.frameRateHint),
    row('', lockFps.el, S.lockFpsHint),
    hideFullscreenRow,
    row(S.rememberLabel, remember.el, S.rememberHint),
    displayMsg,
  );
  root.append(intro(ui, S.nav), habits.el, behavior.el, display.el);

  /* ---------- sounds ---------- */
  const sounds = ui.sheet({ title: S.soundTitle });
  const soundMsg = ui.msgline('');
  const sound = ui.checkbox(S.sound, { onChange: (on) => { void save(KEYS.sound, on, SOUND_GROUP, soundMsg); renderKinds(); renderSpeech(); } });
  const kindBox = ui.h('div', 'companion-checks');
  const kinds = SOUND_KINDS.map((kind) => {
    const [label, what] = S.kinds[kind] ?? [kind, ''];
    const c = ui.checkbox(label, { title: what, onChange: (on) => { void save(`${K}.sounds.${kind}`, on, SOUND_GROUP, soundMsg); renderSpeech(); } });
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
    row(S.soundLabel, sound.el),
    row(S.soundKinds, kindBox, S.soundKindsHint),
    row(S.snore, snoreBox, S.snoreHint),
    soundMsg,
  );
  /* ---------- speech ---------- */
  const speechSheet = ui.sheet({ title: S.speechTitle });
  const speechMsg = ui.msgline('');
  const speech = ui.checkbox(S.speech, { onChange: (on) => { void save(KEYS.speech, on, SOUND_GROUP, speechMsg); renderSpeech(); } });
  /** A step picker with the custom number under it, shown while 自定义 is picked. */
  const stepPicker = (labels: Record<string, string>, levelKey: string, numKey: string, range: typeof SPEECH_PITCH, unit: string) => {
    let level = 'mid';
    const num = ui.input({ type: 'number' });
    num.min = String(range.min); num.max = String(range.max); num.step = '1';
    const numBox = ui.h('div', 'companion-rangebox');
    numBox.append(num, ui.h('span', 'companion-rangeval', unit));
    const seg = ui.segmented(SPEECH_LEVELS.map((v) => ({ value: v, label: labels[v] ?? v })), {
      size: 'sm',
      onSelect: (v) => {
        if (v === 'custom') {
          // the custom number starts from the step it leaves
          num.value = num.dataset.saved = String(range.steps[level] ?? range.steps.mid);
          void saveAll({ [levelKey]: v, [numKey]: Number(num.value) }, SOUND_GROUP, speechMsg);
        } else void save(levelKey, v, SOUND_GROUP, speechMsg);
        level = v;
        numBox.hidden = v !== 'custom';
      },
    });
    num.addEventListener('change', () => {
      const n = Math.round(Number(num.value));
      if (num.value === '' || !Number.isFinite(n) || n < range.min || n > range.max) { num.value = num.dataset.saved ?? ''; return; }
      num.value = String(n);
      if (num.value !== num.dataset.saved) { num.dataset.saved = num.value; void save(numKey, n, SOUND_GROUP, speechMsg); }
    }, { signal });
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); }, { signal });
    const box = ui.h('div', 'companion-switchbox companion-steps');
    box.append(seg.el, numBox);
    numBox.hidden = true;
    const sync = (values: Record<string, unknown>) => {
      if (typeof values[levelKey] === 'string') { level = values[levelKey] as string; seg.setValue(level); numBox.hidden = level !== 'custom'; }
      if (typeof values[numKey] === 'number' && document.activeElement !== num) num.value = num.dataset.saved = String(values[numKey]);
    };
    const setEnabled = (on: boolean) => {
      for (const b of seg.el.querySelectorAll('button')) b.disabled = !on;
      num.disabled = !on;
    };
    return { box, sync, setEnabled };
  };
  const pitch = stepPicker(S.speechPitchLevels, KEYS.speechPitch, KEYS.speechPitchHz, SPEECH_PITCH, 'Hz');
  const speed = stepPicker(S.speechSpeedLevels, KEYS.speechSpeed, KEYS.speechRate, SPEECH_RATE, S.speechRateUnit);
  const pitchRow = row(S.speechPitch, pitch.box);
  const speedRow = row(S.speechSpeed, speed.box);
  // the speech only plays while sounds and the 说话 kind are on; pitch and speed only matter while it plays
  const renderSpeech = () => {
    speech.input.disabled = !sound.checked;
    const talk = kinds.find(([kind]) => kind === 'talk')![1];
    const audible = sound.checked && talk.checked && speech.checked;
    for (const [r, picker] of [[pitchRow, pitch], [speedRow, speed]] as const) {
      picker.setEnabled(audible);
      r.classList.toggle('is-off', !audible);
    }
  };
  speechSheet.body.append(
    row(S.speechTitle, speech.el, S.speechHint),
    pitchRow,
    speedRow,
    speechMsg,
  );
  const cua = cuaSection(ctx, row);
  root.append(sounds.el, speechSheet.el, cua.el);

  /* ---------- other: the OBS overlay, the context ring ---------- */
  const other = ui.sheet({ title: S.groupOther });
  const otherMsg = ui.msgline('');
  const overlay = ui.checkbox(S.overlay, { onChange: (on) => { overlayUrlBox.hidden = !on || !overlayUrl.value; void save(KEYS.overlay, on, GROUP, otherMsg); } });
  // the address to paste into OBS, while the overlay is exported
  const overlayUrl = ui.input();
  overlayUrl.readOnly = true;
  const overlayUrlBox = ui.h('div', 'companion-rangebox');
  overlayUrlBox.append(overlayUrl, ui.copyButton(() => overlayUrl.value));
  overlayUrlBox.hidden = true;
  const overlayBox = ui.h('div', 'companion-switchbox');
  overlayBox.append(overlay.el, overlayUrlBox);
  const ring = ui.checkbox(S.ring, { onChange: (on) => void save(RING_KEY, on, STATS_GROUP, otherMsg) });
  other.body.append(row(S.overlayLabel, overlayBox, S.overlayHint), row(S.ringLabel, ring.el, S.ringHint), otherMsg);
  root.append(other.el);

  /* ---------- behaviour ---------- */
  const save = (key: string, value: string | number | boolean, group = GROUP, line = msg) => saveAll({ [key]: value }, group, line);
  /** Whether the values were saved. */
  async function saveAll(values: Record<string, string | number | boolean>, group = GROUP, line = msg): Promise<boolean> {
    try {
      await setConfig(group, values, opts);
      // everything saves as it changes: only a failure is worth a line
      line.textContent = '';
      line.classList.remove('bad');
      return true;
    } catch (err) {
      if (signal.aborted) return false;
      line.textContent = S.saveFailed(errText(err));
      line.classList.add('bad');
      return false;
    }
  }
  /** Calls a pet panel method (回应模式, 自主配置权限, 打字键); a failure shows under 行为与互动, and the rows follow the state it returns. */
  const callPet = async (method: string, args: unknown[]) => {
    try {
      const state = await invokePanel<HabitState>(PET_PAGE, 'pet', method, args, opts);
      takeHabits(state);
      behaviorMsg.textContent = '';
      behaviorMsg.classList.remove('bad');
    } catch (err) {
      if (signal.aborted) return;
      behaviorMsg.textContent = S.saveFailed(errText(err));
      behaviorMsg.classList.add('bad');
    }
  };
  function takeHabits(state: HabitState | null | undefined): void {
    if (state?.typeKey) { typeKey = state.typeKey; renderTypeKey(); }
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
    void save(KEYS.scale, scale.value, GROUP, displayMsg);
  }
  signal.addEventListener('abort', () => { if (scaleTimer) clearTimeout(scaleTimer); });
  const saveUser = () => {
    const name = user.value.trim();
    if (name && name !== user.dataset.saved) { user.dataset.saved = name; void save(KEYS.user, name); }
  };
  user.addEventListener('change', saveUser);
  user.addEventListener('keydown', (e) => { if (e.key === 'Enter') user.blur(); });
  botName.addEventListener('change', () => {
    const name = botName.value.trim() || DEFAULT_NAME;
    botName.value = name;
    if (name === botName.dataset.saved) return;
    botName.dataset.saved = name;
    void save(NAME_KEY, name, NAME_GROUP).then((saved) => { if (saved) announceName(name); });
  });
  botName.addEventListener('keydown', (e) => { if (e.key === 'Enter') botName.blur(); });
  snore.addEventListener('change', () => {
    const n = Math.round(Number(snore.value));
    if (snore.value === '' || !Number.isFinite(n) || n < 0 || n > 3600) { snore.value = snore.dataset.saved ?? '0'; return; }
    snore.value = String(n);
    if (snore.value !== snore.dataset.saved) { snore.dataset.saved = snore.value; void save(KEYS.snoreSeconds, n, SOUND_GROUP, soundMsg); }
  });
  snore.addEventListener('keydown', (e) => { if (e.key === 'Enter') snore.blur(); });

  const refreshValues = async () => {
    // with the OBS overlay page while it is exported
    const habitState = invokePanel<HabitState & { overlayUrl?: string | null }>(PET_PAGE, 'pet', 'state', [], opts).catch(() => null);
    let values: Record<string, unknown> = {};
    let soundValues: Record<string, unknown> = {};
    let statsValues: Record<string, unknown> = {};
    let nameValues: Record<string, unknown> = {};
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      values = d.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
      soundValues = d.groups?.find((g) => g.group.id === SOUND_GROUP)?.values ?? {};
      statsValues = d.groups?.find((g) => g.group.id === STATS_GROUP)?.values ?? {};
      nameValues = d.groups?.find((g) => g.group.id === NAME_GROUP)?.values ?? {};
      cua.sync(d.groups?.find((g) => g.group.id === CUA_GROUP)?.values ?? {});
    } catch { return; }
    if (typeof statsValues[STATS_KEY] === 'boolean') stats.setChecked(statsValues[STATS_KEY] as boolean);
    autoUpdateRow.hidden = typeof statsValues[AUTO_UPDATE_KEY] !== 'boolean';
    if (!autoUpdateRow.hidden) autoUpdate.setChecked(statsValues[AUTO_UPDATE_KEY] as boolean);
    ring.setChecked(statsValues[RING_KEY] === true);
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
    if (typeof nameValues[NAME_KEY] === 'string' && active !== botName) {
      botName.value = nameValues[NAME_KEY] as string;
      botName.dataset.saved = botName.value;
    }
    if (typeof values[KEYS.roam] === 'string') roam.setValue(values[KEYS.roam] as string);
    if (typeof values[KEYS.scale] === 'number' && !scale.active && active !== scale.el) { scale.set(values[KEYS.scale] as number); showScale(); }
    if (!glow.active && active !== glow.el) { glow.set(typeof values[KEYS.glow] === 'number' ? values[KEYS.glow] as number : GLOW_DEFAULT); showGlow(); }
    for (const [s, key] of [[bubbleSize, KEYS.bubbleSize], [fontSize, KEYS.fontSize], [bubbleSpeed, KEYS.bubbleSpeed]] as const) {
      if (!s.slider.active && active !== s.slider.el) { s.slider.set(typeof values[key] === 'number' ? values[key] as number : 1); s.show(); }
    }
    if (typeof values[KEYS.frameRate] === 'number') frameRate.setValue(String(values[KEYS.frameRate]));
    if (typeof soundValues[KEYS.sound] === 'boolean') sound.setChecked(soundValues[KEYS.sound] as boolean);
    for (const [kind, c] of kinds) {
      const v = soundValues[`${K}.sounds.${kind}`];
      if (typeof v === 'boolean') c.setChecked(v);
    }
    renderKinds();
    if (typeof soundValues[KEYS.speech] === 'boolean') speech.setChecked(soundValues[KEYS.speech] as boolean);
    pitch.sync(soundValues);
    speed.sync(soundValues);
    renderSpeech();
    if (typeof soundValues[KEYS.snoreSeconds] === 'number' && active !== snore) {
      snore.value = String(soundValues[KEYS.snoreSeconds]);
      snore.dataset.saved = snore.value;
    }
    if (typeof values[KEYS.lockFps] === 'boolean') lockFps.setChecked(values[KEYS.lockFps] as boolean);
    if (typeof values[KEYS.hideFullscreen] === 'boolean') { hideFullscreen.setChecked(values[KEYS.hideFullscreen] as boolean); hideFullscreenRow.hidden = false; }
    if (typeof values[KEYS.remember] === 'boolean') remember.setChecked(values[KEYS.remember] as boolean);
    if (typeof values[KEYS.dblclick] === 'boolean') dblclick.setChecked(values[KEYS.dblclick] as boolean);
    if (typeof values[KEYS.statusBubble] === 'boolean') statusBubble.setChecked(values[KEYS.statusBubble] as boolean);
    if (typeof values[KEYS.saidBubbles] === 'boolean') saidBubbles.setChecked(values[KEYS.saidBubbles] as boolean);
    if (typeof values[KEYS.overlay] === 'boolean') overlay.setChecked(values[KEYS.overlay] as boolean);
    // a popup open over the page keeps the rows as they are until it is saved or closed
    const state = await habitState;
    if (!root.ownerDocument.querySelector('.companion-popup')) takeHabits(state);
    overlayUrl.value = state?.overlayUrl ?? '';
    overlayUrlBox.hidden = !overlay.checked || !overlayUrl.value;
    if (typeof values[KEYS.hover] === 'string') {
      picked = (values[KEYS.hover] as string).split(',').map((x) => x.trim()).filter((x) => ACTIONS.some(([a]) => a === x));
      renderHover();
    }
  };

  await refreshValues();
  ctx.lifecycle.interval(() => void refreshValues(), 3000);
}

export const petPage: Page = {
  route: 'pet',
  label: S.nav,
  icon: 'bot',
  mount,
};
