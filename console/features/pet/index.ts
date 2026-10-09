/**
 * 「习惯」: the everyday settings of the desktop pet, written to the desktop-pet World's config
 * group through `/api/config` (only the keys shown here are sent). The pet's own menu changes some
 * of the same values, so they are read again every few seconds. Dressing up has its own page
 * (features/dress). The hover buttons are picked from the pet menu's own actions, drawn with the
 * pet page's icons. The last row switches the app's anonymous usage statistics (the `companion`
 * group, core/telemetry.ts). The 「音效」 card below writes the World's sound group: the master switch
 * (the same one the pet menu flips), each kind of sound, and how long Coo snores in each sleep.
 *
 * The first row is the app language (`language` in the `companion` group), listed by the names the
 * Core gives (`/api/config/options/coopanion.language`). A change applies at once: the Core tells the
 * app, which reloads this window in the new language.
 */
import { ICONS } from 'cortico-world-desktop-pet/web/ui.js';
import { get, post, setConfig } from '../../core/api.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
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
/** The pet panel's state, for the default name the World gives the person in the app language. */
const PET_STATE = '/api/console/providers/world%3Adesktop-pet/panels/pet/state';
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
  selfAdjust: `${K}.selfAdjust`,
} as const;

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
  const habits = ui.sheet({ title: S.settingsTitle });
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
  const selfAdjust = ui.checkbox(S.selfAdjust, { onChange: (on) => void save(KEYS.selfAdjust, on) });
  const stats = ui.checkbox(S.stats, { onChange: (on) => void save(STATS_KEY, on, STATS_GROUP) });
  const statsDoc = ui.h('a', 'home-link', S.statsDoc);
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

  const row = (label: string, control: HTMLElement, hint?: string) => {
    const r = ui.h('div', 'companion-row');
    const l = ui.h('div', 'companion-label', label);
    const c = ui.h('div', 'companion-control');
    c.append(control);
    if (hint) c.append(ui.h('p', 'home-note', hint));
    r.append(l, c);
    return r;
  };
  // the World declares this setting on Windows only; elsewhere its value never arrives and the row stays hidden
  const hideFullscreenRow = row('', hideFullscreen.el, S.hideFullscreenHint);
  hideFullscreenRow.hidden = true;
  habits.body.append(
    row(S.language, language, S.languageHint),
    row(S.user, user, S.userHint),
    row(S.roam, roam.el),
    row(S.theme, theme.el),
    row(S.scale, scaleBox),
    row(S.frameRate, frameRate.el, S.frameRateHint),
    row('', lockFps.el, S.lockFpsHint),
    hideFullscreenRow,
    row('', remember.el, S.rememberHint),
    row(S.hover, hoverBox, S.hoverHint(MAX_HOVER)),
    row('', dblclick.el),
    row('', statusBubble.el, S.statusBubbleHint),
    row('', selfAdjust.el, S.selfAdjustHint),
    row('', statsBox, S.statsHint),
    msg,
  );
  root.append(habits.el);

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
    row('', sound.el, S.soundHint),
    row(S.soundKinds, kindBox, S.soundKindsHint),
    row(S.snore, snoreBox, S.snoreHint),
    soundMsg,
  );
  root.append(sounds.el);

  /* ---------- behaviour ---------- */
  const save = async (key: string, value: string | number | boolean, group = GROUP, line = msg) => {
    try {
      await setConfig(group, { [key]: value }, opts);
      line.textContent = S.saved;
      line.classList.remove('bad');
    } catch (err) {
      if (signal.aborted) return;
      line.textContent = S.saveFailed(errText(err));
      line.classList.add('bad');
    }
  };
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
    if (typeof values[KEYS.selfAdjust] === 'boolean') selfAdjust.setChecked(values[KEYS.selfAdjust] as boolean);
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
