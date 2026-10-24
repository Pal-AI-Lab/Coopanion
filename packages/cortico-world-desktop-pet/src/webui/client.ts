/**
 * Console panels for the desktop pet: `pet` (window, dressing, window runtime) and `voice`
 * (recognition engine, the FunASR or Whisper model download, microphone level, recognized lines). Data goes
 * through `ctx.invoke`, the level meter through `ctx.stream('voice')`. Text is the World's table
 * (src/i18n) for the console's language.
 */
import type { WebUiClientBundle, WebUiPanel, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import { petText } from '../i18n/index.ts';
import { captureKey, PRESSES, splitTaps, withTaps } from './key-capture.ts';
import './style.css';

interface Artifact { phase: 'absent' | 'working' | 'ready' | 'error'; path: string; done: number; total: number | null; detail: string | null }
interface PetState {
  inWindow: boolean;
  url: string | null;
  dressUrl: string | null;
  window: { phase: string; pid: number | null; source: string | null; detail: string | null } | null;
  electron: Artifact & { supported: boolean };
  screen: { w: number; h: number } | null;
}
interface VoiceState {
  enabled: boolean;
  /** The engine in force, and the setting it came from */
  engine: Engine;
  engineSetting: Engine;
  systemSupported: boolean;
  server: { phase: string; url: string; pid: number | null; detail: string | null } | null;
  /** The download of the FunASR or Whisper model: the engine in force's, else the app language's. */
  model: Artifact & { bytes: number; engine: Exclude<Engine, 'system'> };
  mic: { state: string; detail: string | null };
  input: {
    mode: MicMode;
    hotkey: string;
    deviceId: string;
    openOnPress: boolean;
    /** The keys alone; how they are pressed is the press choice beside them */
    keyLabel: string;
    hint: string;
    hotkeyProblem: string | null;
    open: boolean;
    devices: Array<{ id: string; label: string }>;
  };
  level: number;
  thresholdDb: number;
  recent: Array<{ text: string; at: number; ms: number; dropped?: boolean }>;
  counts: { utterances: number; delivered: number; dropped: number };
}

type MicMode = 'hold' | 'toggle' | 'always';
type Engine = 'funasr' | 'whisper' | 'system';

const MB = (n: number) => `${Math.round(n / 1048576)} MB`;
const progress = (a: Artifact) => (a.total ? `${Math.round((a.done / a.total) * 100)}%` : MB(a.done));
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function statusRow(ctx: WebUiPanelContext, name: string) {
  const { ui } = ctx;
  const row = ui.h('div', 'mountrow');
  const dot = ui.h('span', 'navdot');
  const state = ui.h('span', 'mstate', '—');
  const detail = ui.h('span', 'mdetail');
  const acts = ui.h('span', 'macts');
  row.append(dot, ui.h('span', 'mname', name), state, detail, acts);
  return {
    row, acts,
    set(text: string, tone: 'on' | 'off' | 'busy' | 'bad', more = '') {
      state.textContent = text;
      detail.textContent = more;
      // cut with an ellipsis where the row is short of room: the whole line on hover
      detail.title = more;
      dot.className = `navdot ${tone === 'on' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'busy' ? 'warn' : ''}`;
    },
  };
}

const petPanel: WebUiPanel = {
  mount(ctx) {
    const { ui, root } = ctx;
    const t = petText(ctx.language).panel;
    const card = ui.sheet({ title: t.pet });
    root.appendChild(card.el);
    const s = card.body;
    const msg = ui.msgline('');

    const win = statusRow(ctx, t.window);
    const btnOpen = ui.button(t.openWindow, { size: 'sm', variant: 'primary' });
    const btnClose = ui.button(t.closeWindow, { size: 'sm' });
    win.acts.append(btnClose, btnOpen);

    const rt = statusRow(ctx, t.runtime);
    const btnInstall = ui.button(t.install, { size: 'sm', variant: 'primary' });
    rt.acts.append(btnInstall);

    const links = ui.rowbar();
    const open = ui.h('a', 'btn sm', t.viewInBrowser);
    open.target = '_blank'; open.rel = 'noopener';
    links.append(open, msg);

    const dress = ui.sheet({ title: t.dress, desc: t.dressHint });
    root.appendChild(dress.el);
    const frameWrap = ui.h('div', 'pet-dressframe');
    const frame = ui.h('iframe');
    frame.title = t.dress;
    frameWrap.append(frame);
    dress.body.append(frameWrap);

    s.append(win.row, rt.row, links);

    let st: PetState | null = null;
    const render = (next: PetState) => {
      st = next;
      const w = next.window;
      if (next.inWindow) win.set(t.connected, 'on');
      else if (w?.phase === 'running') win.set(t.starting, 'busy');
      else win.set(w?.phase === 'missing' || w?.phase === 'error' ? t.cannotOpen : t.notOpen, w?.phase === 'missing' || w?.phase === 'error' ? 'bad' : 'off', w?.detail ?? '');
      btnOpen.disabled = w?.phase === 'running';
      btnClose.disabled = w?.phase !== 'running';
      const e = next.electron;
      if (w?.source && w.source !== e.path && e.phase !== 'ready') rt.set(t.external, 'on', w.source);
      else if (e.phase === 'ready') rt.set(t.installed, 'on', e.path);
      else if (e.phase === 'working') rt.set(t.downloading(progress(e)), 'busy', e.detail ?? '');
      else if (e.phase === 'error') rt.set(t.installFailed, 'bad', e.detail ?? '');
      else rt.set(e.supported ? t.notInstalled : t.noBuild, 'off', e.supported ? t.electronSize : '');
      btnInstall.hidden = e.phase === 'ready' || !e.supported;
      btnInstall.disabled = e.phase === 'working';
      if (next.url) open.href = next.url;
      if (next.dressUrl && frame.dataset.src !== next.dressUrl) {
        frame.dataset.src = next.dressUrl;
        frame.src = next.dressUrl;
      }
    };
    const refresh = async () => { try { render(await ctx.invoke<PetState>('state')); } catch (err) { msg.textContent = errText(err); } };
    const call = (method: string) => async () => {
      try { render(await ctx.invoke<PetState>(method)); } catch (err) { msg.textContent = errText(err); }
    };
    btnOpen.addEventListener('click', call('openWindow'));
    btnClose.addEventListener('click', call('closeWindow'));
    btnInstall.addEventListener('click', call('installElectron'));
    void refresh();
    ctx.interval(() => void refresh(), 1500);
  },
};

/** The engines with a name of their own; the system recognizer's is in the text table. */
const ENGINE_NAMES: Partial<Record<Engine, string>> = { funasr: 'FunASR', whisper: 'Whisper' };

const FLOOR_DB = -60;
const meterPct = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100));

const voicePanel: WebUiPanel = {
  mount(ctx) {
    const { ui, root } = ctx;
    const t = petText(ctx.language).panel;
    const card = ui.sheet({ title: t.voice });
    root.appendChild(card.el);
    const s = card.body;
    const msg = ui.msgline('');

    // The master switch: everything below only works while it is on.
    const master = ui.h('label', 'pet-master');
    const masterText = ui.h('span', 'pet-mastertext');
    const masterTitle = ui.h('span', 'pet-mastertitle', t.enable);
    const masterHint = ui.h('span', 'pet-masterhint');
    masterText.append(masterTitle, masterHint);
    const enabled = ui.h('input', 'pet-switch');
    enabled.type = 'checkbox';
    enabled.setAttribute('role', 'switch');
    enabled.addEventListener('change', () => void call('setEnabled', [enabled.checked])());
    master.append(masterText, enabled);
    const settings = ui.h('div', 'pet-voicebody');

    const eng = statusRow(ctx, t.engine);
    const engineSel = ui.select();
    eng.acts.append(engineSel);

    const srv = statusRow(ctx, t.server);
    const btnStart = ui.button(t.start, { size: 'sm', variant: 'primary' });
    const btnStop = ui.button(t.stop, { size: 'sm' });
    srv.acts.append(btnStop, btnStart);

    const rt = statusRow(ctx, t.model);
    const btnInstall = ui.button(t.download, { size: 'sm', variant: 'primary' });
    rt.acts.append(btnInstall);

    const micRow = statusRow(ctx, t.mic);
    const deviceSel = ui.select();
    micRow.acts.append(deviceSel);

    const modeRow = statusRow(ctx, t.mode);
    const modeSel = ui.select();
    modeSel.replaceChildren(...(Object.keys(t.modes) as MicMode[]).map((m) => { const o = ui.h('option', null, t.modes[m]); o.value = m; return o; }));
    const pressSel = ui.select();
    modeRow.acts.append(modeSel, pressSel);
    // hold mode only: the microphone opens with the talk key
    const onPressRow = statusRow(ctx, t.openOnPress);
    const onPress = ui.h('input', 'pet-switch');
    onPress.type = 'checkbox';
    onPress.setAttribute('role', 'switch');
    onPress.addEventListener('change', () => void call('setMic', [{ openOnPress: onPress.checked }])());
    onPressRow.acts.append(onPress);
    // the talk key has a row of its own above how it listens: the key, and a button to set another
    const keyRow = statusRow(ctx, t.talkKeyName);
    const keyBtn = ui.button(t.changeKey, { size: 'sm' });
    keyRow.acts.append(keyBtn);

    // the level meter as one more row: its name in the names' column, the bar where the others' values start
    const meterRow = ui.h('div', 'mountrow pet-meterrow');
    const meterDot = ui.h('span', 'navdot');
    meterDot.style.visibility = 'hidden';
    const meter = ui.h('div', 'pet-meter');
    const fill = ui.h('div', 'pet-meterfill');
    const mark = ui.h('div', 'pet-metermark');
    meter.append(fill, mark);
    meterRow.append(meterDot, ui.h('span', 'mname', t.level), meter);

    const log = ui.log({ max: 100, empty: t.noResults });
    settings.append(eng.row, srv.row, rt.row, micRow.row, keyRow.row, modeRow.row, onPressRow.row, meterRow);
    s.append(master, msg, settings);
    const results = ui.sheet({ title: t.results, desc: t.resultsHint });
    results.body.append(log.el);
    root.appendChild(results.el);

    let st: VoiceState | null = null;
    let seen = 0;
    const render = (next: VoiceState) => {
      st = next;
      enabled.checked = next.enabled;
      master.classList.toggle('on', next.enabled);
      const onPressOn = next.input.mode === 'hold' && next.input.openOnPress;
      masterHint.textContent = !next.enabled ? t.disabledHint : onPressOn ? t.enabledHintOnPress : t.enabledHint;
      settings.classList.toggle('off', !next.enabled);
      const engines: Partial<Record<Engine, string>> = { funasr: t.funasr, whisper: t.whisper };
      // Windows' own recognizer exists only there
      if (next.systemSupported) engines.system = t.system;
      if (engineSel.dataset.list !== JSON.stringify(engines)) {
        engineSel.dataset.list = JSON.stringify(engines);
        engineSel.replaceChildren(...(Object.keys(engines) as Engine[]).map((k) => { const o = ui.h('option', null, engines[k] ?? k); o.value = k; return o; }));
      }
      if (document.activeElement !== engineSel) engineSel.value = next.engine;
      eng.set(ENGINE_NAMES[next.engine] ?? t.system, 'on', next.engine === 'system' ? t.systemHint : next.engine === 'whisper' ? t.whisperHint : t.funasrHint);
      const sv = next.server;
      if (!sv) srv.set('—', 'off');
      else if (sv.phase === 'running') srv.set(t.ready, 'on', sv.url);
      else if (sv.phase === 'starting') srv.set(t.starting, 'busy', sv.url);
      else if (sv.phase === 'error') srv.set(t.error, 'bad', sv.detail ?? '');
      else srv.set(t.stopped, 'off', sv.url);
      btnStart.disabled = !next.enabled || sv?.phase === 'running' || sv?.phase === 'starting';
      btnStop.disabled = sv?.phase !== 'running';

      const m = next.model;
      if (m.phase === 'working') rt.set(t.downloading(progress(m)), 'busy', m.detail ?? '');
      else if (m.phase === 'error') rt.set(t.downloadFailed, 'bad', m.detail ?? '');
      else if (m.phase === 'ready') rt.set(t.downloaded, 'on', m.path);
      else rt.set(t.notDownloaded, 'off', t.modelSource(MB(m.bytes)));
      btnInstall.disabled = m.phase === 'working';
      btnInstall.hidden = m.phase === 'ready';
      btnInstall.textContent = m.phase === 'error' ? t.retry : t.download;
      // the system recognizer has no model
      rt.row.style.display = next.engine === 'system' ? 'none' : '';

      const mic = next.mic;
      micRow.set(t.micStates[mic.state] ?? mic.state, mic.state === 'on' ? 'on' : mic.state === 'off' ? 'off' : 'bad', mic.detail ?? '');
      const input = next.input;
      const choices = [{ id: '', label: t.defaultDevice }, ...input.devices];
      if (input.deviceId && !choices.some((d) => d.id === input.deviceId)) choices.push({ id: input.deviceId, label: t.missingDevice });
      if (deviceSel.dataset.list !== JSON.stringify(choices)) {
        deviceSel.dataset.list = JSON.stringify(choices);
        deviceSel.replaceChildren(...choices.map((d, i) => { const o = ui.h('option', null, d.label || t.micN(i)); o.value = d.id; return o; }));
      }
      if (document.activeElement !== deviceSel) deviceSel.value = input.deviceId;
      if (document.activeElement !== modeSel) modeSel.value = input.mode;
      // a talk key set to three presses in config.json keeps its choice; the panel offers two or one
      const { taps } = splitTaps(input.hotkey);
      const press = input.mode === 'toggle' ? 'toggle' : 'hold';
      const presses = PRESSES.filter((n) => n < 3 || n === taps).map((n) => [n, t.presses[n]![press]] as const);
      if (pressSel.dataset.list !== JSON.stringify(presses)) {
        pressSel.dataset.list = JSON.stringify(presses);
        pressSel.replaceChildren(...presses.map(([n, label]) => { const o = ui.h('option', null, label); o.value = String(n); return o; }));
      }
      if (document.activeElement !== pressSel) pressSel.value = String(taps);
      // 「一直收音」 hides the key's row, its 「取消」 with it: a capture still listening there ends
      if (capture && input.mode === 'always') capture.stop();
      if (!capture) keyRow.set(input.keyLabel, input.hotkeyProblem ? 'bad' : 'on');
      pressSel.hidden = input.mode === 'always';
      keyRow.row.style.display = input.mode === 'always' ? 'none' : '';
      modeRow.set(input.open ? t.listening : t.waitingKey, input.open ? 'on' : 'off', input.hint);
      onPressRow.row.style.display = input.mode === 'hold' ? '' : 'none';
      onPress.checked = input.openOnPress;
      onPressRow.set(input.openOnPress ? t.switchOn : t.switchOff, input.openOnPress ? 'on' : 'off', t.openOnPressHint);
      // the loudness threshold only decides where speech starts when the key is not held down
      mark.hidden = input.mode === 'hold';
      mark.style.left = `${meterPct(next.thresholdDb)}%`;
      for (const line of next.recent) {
        if (line.at <= seen) continue;
        seen = line.at;
        const el = log.append(line.text, line.dropped ? 'dim' : 'plain');
        if (line.dropped) el.style.textDecoration = 'line-through';
      }
    };
    const refresh = async () => { try { render(await ctx.invoke<VoiceState>('state')); } catch (err) { msg.textContent = errText(err); } };
    const call = (method: string, args: unknown[] = []) => async () => {
      try { render(await ctx.invoke<VoiceState>(method, args)); msg.textContent = ''; } catch (err) { msg.textContent = errText(err); }
    };
    btnStart.addEventListener('click', call('start'));
    engineSel.addEventListener('change', () => void call('setEngine', [engineSel.value])());
    btnStop.addEventListener('click', call('stop'));
    btnInstall.addEventListener('click', call('install'));
    modeSel.addEventListener('change', () => void call('setMic', [{ mode: modeSel.value }])());
    deviceSel.addEventListener('change', () => void call('setMic', [{ deviceId: deviceSel.value }])());
    pressSel.addEventListener('change', () => {
      if (st) void call('setMic', [{ hotkey: withTaps(splitTaps(st.input.hotkey).combo, Number(pressSel.value)) }])();
    });

    // The talk key is a new combination (key-capture.ts); how it is pressed (`*2`) stays as chosen beside it.
    let capture: { stop(): void } | null = null;
    const finishCapture = (combo: string | null) => {
      capture = null;
      keyBtn.textContent = t.changeKey;
      if (combo && st) void call('setMic', [{ hotkey: withTaps(combo, splitTaps(st.input.hotkey).taps) }])();
      else void refresh();
    };
    keyBtn.addEventListener('click', () => {
      if (capture) { capture.stop(); return; }
      keyRow.set('…', 'busy', t.capture);
      keyBtn.textContent = t.cancelKey;
      capture = captureKey(window, finishCapture);
    });
    ctx.own({ dispose: () => capture?.stop() });
    ctx.stream({
      message: (text: string) => {
        const f = JSON.parse(text) as { type: string; level?: number; speaking?: boolean; open?: boolean };
        if (f.type === 'level' && typeof f.level === 'number') {
          fill.style.width = `${meterPct(f.level)}%`;
          fill.classList.toggle('on', !!f.speaking);
          meter.classList.toggle('open', !!f.open);
        } else void refresh();
      },
    });
    void refresh();
    ctx.interval(() => void refresh(), 1500);
  },
};

const bundle: WebUiClientBundle = { panels: { pet: petPanel, voice: voicePanel } };
export default bundle;
