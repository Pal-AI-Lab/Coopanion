/**
 * The guide: a walkthrough that covers the whole settings window the first time it opens. Four
 * short screens in the order a new person needs them: say hello and set what Coo calls you and how
 * much it walks (written to the desktop-pet World's config, like the 「习惯」 page), connect the
 * model (saved and tested through the same calls as the home page), how to get along with Coo, and
 * where to find it afterwards. The small button at the top right skips it; finishing or skipping is
 * remembered in the window's localStorage, and the home page's 「使用引导」 opens it again through
 * `requestGuide`. main.ts shows it and owns its lifecycle, so it outlives the page under it. Styles
 * are in guide.css.
 */
import { get, post, setConfig } from '../../core/api.ts';
import { pick } from '../../core/language.ts';
import type { Router } from '../../core/router.ts';
import type { ConsoleUi } from '../../../shared/client-panel.ts';
import { KEY_URL, keyConnected, readDetail, readStatus, saveKey, type Detail, type Status } from '../home/model.ts';

const SEEN = 'companion.guide';
const REQUEST = 'companion-guide-request';
const PET_PAGE = 'world:desktop-pet';
const USER_KEY = 'worlds.desktop-pet.user';
const ROAM_KEY = 'worlds.desktop-pet.roam';
/** The seed's default name: shown as the placeholder, so the box invites a real one. */
const DEFAULT_USER = '主人';

const S = pick({
  zh: {
    brand: '认识 Coo',
    skip: '跳过',
    skipHint: '跳过引导;之后可以在「开始」页重新打开',
    back: '上一步',
    next: '下一步',
    later: '稍后再填',
    finish: '开始使用',
    dot: (n: number) => `第 ${n} 页`,

    helloTitle: '你好,我是 Coo',
    helloLead: '我住在你屏幕的底边。先认识一下吧。',
    helloBubble: (name: string) => (name ? `你好,${name}!` : '你好呀!'),
    user: '我该怎么称呼你?',
    roam: '我平时',
    roamFree: '常走动',
    roamCalm: '多待着',
    roamOff: '不乱动',
    changeLater: '这些之后都能在「习惯」页改。',

    modelTitle: '连上模型,我才能说话',
    modelLead: '填一个 DeepSeek 的 API Key。按用量计费,注意 token 消耗哦。',
    howTitle: '还没有 Key?',
    how1: '打开 DeepSeek 开放平台,注册登录',
    how1Link: '打开',
    how2: '在「充值」里充值',
    how3: '「API Keys」→ 创建,复制 sk- 开头的那串',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-…',
    connect: '保存并连接',
    connecting: '正在连接…',
    connectedTitle: '已经连上了',
    changeKey: '换一个 Key',
    connectOk: '连上了!',
    connectFail: (why: string) => `没连上:${why}。检查 Key 是否完整、账户是否有余额。`,
    keyEmpty: '先粘贴 Key。',
    modelLater: '先跳过也行,我会时不时在气泡里提醒你。',

    useTitle: '和我相处',
    talkHold: (key: string) => `按住 ${key} 说话,松开就发出。`,
    talkToggle: (key: string) => `按一下 ${key} 开始说话,再按一下停。`,
    talkAlways: '直接说话,我一直在听。',
    talkOff: '语音输入关着,可在「语音输入」页打开。',
    tips: [
      ['说话', ''],
      ['打字', '鼠标停在我身上点气泡按钮,或双击我。'],
      ['互动', '点我、摸头、拎起来甩;右键打开菜单。'],
      ['操作电脑', '每次动手前我都先问你,点「可以」才动。'],
    ] as Array<[string, string]>,
    talkHeard: '明天',
    talkHearing: '会下雨吗',
    talkKeyDefault: '右 Ctrl',

    doneTitle: '准备好了',
    doneLead: '关掉窗口我也还在:任务栏右下角的托盘图标能打开设置,右键可以「显示桌宠」。',
    doneNoKey: '还没连上模型,我暂时不会说话。',
    doneNoKeyBtn: '去填 Key',
    trayMenu: ['打开设置', '显示桌宠', '开机自动启动', '退出'],
    trayTip: '托盘图标',
    dress: '给我换身装扮',
    skipped: '引导已跳过。想再看,点「开始」页右上角的「使用引导」。',
  },
  en: {
    brand: 'Meet Coo',
    skip: 'Skip',
    skipHint: 'Skip the guide; the Start page opens it again',
    back: 'Back',
    next: 'Next',
    later: 'Later',
    finish: 'Start',
    dot: (n: number) => `Page ${n}`,

    helloTitle: "Hi, I'm Coo",
    helloLead: 'I live at the bottom of your screen. Let us get to know each other.',
    helloBubble: (name: string) => (name ? `Hi, ${name}!` : 'Hello!'),
    user: 'What should I call you?',
    roam: 'I usually',
    roamFree: 'Walk a lot',
    roamCalm: 'Stay around',
    roamOff: 'Stay put',
    changeLater: 'Change these any time on the Habits page.',

    modelTitle: 'Connect a model so I can talk',
    modelLead: 'Enter a DeepSeek API key. It is billed by use; keep an eye on token usage.',
    howTitle: 'No key yet?',
    how1: 'Open the DeepSeek platform and sign up',
    how1Link: 'Open',
    how2: 'Top up the account',
    how3: '"API Keys" → create, copy the string starting with sk-',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-…',
    connect: 'Save and connect',
    connecting: 'Connecting…',
    connectedTitle: 'Connected',
    changeKey: 'Use another key',
    connectOk: 'Connected!',
    connectFail: (why: string) => `Not connected: ${why}. Check the key and the account balance.`,
    keyEmpty: 'Paste the key first.',
    modelLater: 'You can skip this; I will remind you in my bubble now and then.',

    useTitle: 'Getting along',
    talkHold: (key: string) => `Hold ${key} and talk; let go to send.`,
    talkToggle: (key: string) => `Press ${key} to talk, press again to stop.`,
    talkAlways: 'Just talk, I am always listening.',
    talkOff: 'Voice input is off; turn it on on the Voice input page.',
    tips: [
      ['Talk', ''],
      ['Type', 'Hover me and click the bubble button, or double-click me.'],
      ['Play', 'Click me, pet my head, pick me up; right-click for the menu.'],
      ['Computer', 'I ask before every action and act only after "OK".'],
    ] as Array<[string, string]>,
    talkHeard: 'Rain ',
    talkHearing: 'tomorrow?',
    talkKeyDefault: 'Right Ctrl',

    doneTitle: 'All set',
    doneLead: 'Closing the window does not send me away: the tray icon at the bottom right opens settings, and its menu can show me again.',
    doneNoKey: 'No model connected yet, so I stay silent for now.',
    doneNoKeyBtn: 'Enter the key',
    trayMenu: ['Open settings', 'Show pet', 'Start at login', 'Quit'],
    trayTip: 'Tray icon',
    dress: 'Dress me up',
    skipped: 'Guide skipped. Open it again with "Guide" at the top right of the Start page.',
  },
});

export function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === 'done';
  } catch {
    return true; // without storage it would show on every open
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN, 'done');
  } catch { /* 无痕/配额满:这次会话里不再弹 */ }
}

/** Pages ask for the guide (the home page's link); main.ts owns it. */
export function requestGuide(): void {
  window.dispatchEvent(new CustomEvent(REQUEST));
}

export function onGuideRequest(cb: () => void, signal: AbortSignal): void {
  window.addEventListener(REQUEST, () => cb(), { signal });
}

/** The toast after a skip, so the way back is known. */
export const guideSkippedText = S.skipped;

/* ---------- Coo, drawn after the app icon: a C for a body, two ring eyes, two legs ---------- */

const COO = `<svg class="coo" viewBox="0 0 512 512" aria-hidden="true">
  <g class="coo-body">
    <path d="M347 182 A118 118 0 1 0 347 318" fill="none" stroke="currentColor" stroke-width="62" stroke-linecap="round"/>
    <rect x="196" y="352" width="42" height="80" rx="21" fill="currentColor"/>
    <rect x="270" y="352" width="42" height="80" rx="21" fill="currentColor"/>
    <g class="coo-eyes" fill="none" stroke-width="13">
      <circle cx="236" cy="220" r="19"/>
      <circle cx="304" cy="220" r="19"/>
    </g>
  </g>
</svg>`;

/** Icons of the tips on the third screen: talk, type, play, computer. */
const TIP_ICONS = [
  '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h1M11 10h1M15 10h2M7 14h10"/>',
  '<path d="M4 14c2-3 4-3 6 0s4 3 6 0 3-3 4-1"/><path d="M4 9c2-3 4-3 6 0s4 3 6 0 3-3 4-1"/>',
  '<path d="M5 3l14 8-6 1.6L10 19z"/>',
];

/* ---------- the guide ---------- */

export interface GuideOptions {
  doc: Document;
  ui: ConsoleUi;
  router: Router;
  signal: AbortSignal;
  /** The guide closed: finished (possibly on the way to another page) or skipped at the top right. */
  onClose: (how: 'done' | 'skip') => void;
}

interface VoiceState { enabled?: boolean; input?: { effectiveMode?: 'hold' | 'toggle' | 'always'; hotkeyLabel?: string } }
interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

interface Step {
  el: HTMLElement;
  /** Runs each time the step comes on screen. */
  enter?: () => void;
  /** Runs when the step is left, forward or back, or the guide closes on it. */
  leave?: () => void;
}

export function openGuide(o: GuideOptions): void {
  const { ui, signal } = o;
  const opts = { signal };
  const h = ui.h;

  const root = h('div', 'guide');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', S.brand);

  /* ---------- frame ---------- */
  const top = h('header', 'guide-top');
  const brand = h('div', 'guide-brand');
  const brandMark = h('span', 'guide-brandmark');
  brandMark.innerHTML = COO;
  brand.append(brandMark, h('span', null, S.brand));
  const skip = h('button', 'guide-skip');
  skip.type = 'button';
  skip.title = S.skipHint;
  skip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  skip.prepend(h('span', null, S.skip));
  top.append(brand, skip);

  const stage = h('main', 'guide-stage');
  const foot = h('footer', 'guide-foot');
  const dots = h('div', 'guide-dots');
  const back = ui.button(S.back);
  const next = ui.button(S.next, { variant: 'primary' });
  next.classList.add('guide-next');
  foot.append(dots, h('span', 'grow'), back, next);
  root.append(top, stage, foot);

  /* ---------- shared state ---------- */
  let status: Status | null = null;
  let detail: Detail | null = null;
  let connected = false;
  let voice: VoiceState | null = null;
  let at = 0;
  let shown = false;

  const head = (title: string, lead: string) => {
    const box = h('div', 'guide-head');
    box.append(h('h2', 'guide-title', title), h('p', 'guide-lead', lead));
    return box;
  };
  /** Coo standing on the floor line, with a bubble over its head when given. */
  const actor = (cls: string, bubble?: HTMLElement) => {
    const box = h('div', `guide-actor ${cls}`);
    const pet = h('div', 'guide-coo');
    pet.innerHTML = COO;
    if (bubble) box.append(bubble);
    box.append(pet);
    return box;
  };

  /* ---------- 1 hello: what to call you, how much to walk ---------- */
  const userInput = ui.input({ placeholder: DEFAULT_USER });
  userInput.maxLength = 20;
  /** The name as the config holds it; an empty box keeps it. */
  let savedUser = '';
  const saveUser = () => {
    const name = userInput.value.trim();
    if (!name || name === savedUser) return;
    savedUser = name;
    void setConfig(PET_PAGE, { [USER_KEY]: name }, opts).catch(() => { savedUser = ''; });
  };
  const roam = ui.segmented([
    { value: 'free', label: S.roamFree }, { value: 'calm', label: S.roamCalm }, { value: 'off', label: S.roamOff },
  ], { size: 'sm', onSelect: (v) => void setConfig(PET_PAGE, { [ROAM_KEY]: v }, opts).catch(() => {}) });
  const helloBubble = h('div', 'guide-bubble', S.helloBubble(''));
  const greet = () => { helloBubble.textContent = S.helloBubble(userInput.value.trim()); };
  const hello = (): Step => {
    const el = h('section', 'guide-step guide-split');
    const art = h('div', 'guide-art guide-art-hello');
    art.append(h('div', 'guide-floor'), actor('guide-coo-bob', helloBubble));
    const box = head(S.helloTitle, S.helloLead);
    const fields = h('div', 'guide-fields');
    const nameField = h('label', 'guide-field');
    nameField.append(h('span', 'guide-label', S.user), userInput);
    const roamField = h('div', 'guide-field');
    roamField.append(h('span', 'guide-label', S.roam), roam.el);
    fields.append(nameField, roamField);
    box.append(fields, h('p', 'guide-note', S.changeLater));
    el.append(art, box);
    userInput.addEventListener('input', greet, opts);
    userInput.addEventListener('change', saveUser, opts);
    userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(at + 1); } }, opts);
    return { el, leave: saveUser };
  };

  /* ---------- 2 model ---------- */
  const modelMsg = h('p', 'guide-msg');
  const keyInput = ui.input({ placeholder: S.keyPlaceholder });
  const say = (s: string, bad: boolean, ok = false) => {
    modelMsg.textContent = s;
    modelMsg.classList.toggle('bad', bad);
    modelMsg.classList.toggle('ok', ok);
  };
  let renderModel = () => {};
  const model = (): Step => {
    const el = h('section', 'guide-step guide-split');
    const how = h('div', 'guide-art guide-how');
    how.append(h('p', 'guide-howtitle', S.howTitle));
    const ol = h('ol', 'guide-howlist');
    const li1 = h('li', null, S.how1);
    const link = h('a', 'guide-link', S.how1Link);
    link.href = KEY_URL; link.target = '_blank'; link.rel = 'noopener';
    li1.append(link);
    ol.append(li1, h('li', null, S.how2), h('li', null, S.how3));
    how.append(ol);

    const box = head(S.modelTitle, S.modelLead);
    /** "Use another key" shows the form again while connected. */
    let editing = false;
    const done = h('div', 'guide-connected');
    const check = h('span', 'guide-check');
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const doneText = h('div');
    const doneModel = h('span', 'guide-connectedmodel');
    doneText.append(h('strong', null, S.connectedTitle), doneModel);
    const change = ui.button(S.changeKey, { size: 'sm', onClick: () => { editing = true; render(); keyInput.focus(); } });
    done.append(check, doneText, h('span', 'grow'), change);

    const form = h('form', 'guide-keyform');
    keyInput.type = 'password';
    keyInput.autocomplete = 'off';
    keyInput.spellcheck = false;
    keyInput.setAttribute('aria-label', S.keyLabel);
    const connect = ui.button(S.connect, { variant: 'primary' });
    connect.type = 'submit';
    const row = h('div', 'guide-keyrow');
    row.append(keyInput, connect);
    form.append(row, modelMsg);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = keyInput.value.trim();
      if (!key) { say(S.keyEmpty, true); keyInput.focus(); return; }
      connect.disabled = true;
      keyInput.disabled = true;
      say(S.connecting, false);
      try {
        const r = await saveKey(key, detail, signal);
        if (r.ok) { keyInput.value = ''; editing = false; say(S.connectOk, false, true); }
        else say(S.connectFail(r.why ?? '?'), true);
        await refresh();
      } catch (err) {
        say(S.connectFail(err instanceof Error ? err.message : String(err)), true);
      } finally {
        connect.disabled = false;
        keyInput.disabled = false;
      }
    }, opts);
    const later = h('p', 'guide-note', S.modelLater);
    box.append(done, form, later);
    el.append(how, box);

    const render = () => {
      const showForm = !connected || editing;
      done.hidden = showForm;
      form.hidden = !showForm;
      how.classList.toggle('dim', connected && !editing);
      later.hidden = connected;
      const mc = status?.modelConnection;
      doneModel.textContent = mc?.model ? `${mc.moduleTitle} · ${mc.model}` : '';
      syncFoot();
    };
    renderModel = render;
    return { el, enter: () => { render(); if (!connected) keyInput.focus(); } };
  };

  /* ---------- 3 getting along ---------- */
  let renderUse = () => {};
  const use = (): Step => {
    const el = h('section', 'guide-step guide-split');
    const art = h('div', 'guide-art guide-art-talk');
    const keycap = h('kbd', 'guide-keycap', S.talkKeyDefault);
    const bubble = h('div', 'guide-bubble');
    bubble.append(h('span', null, S.talkHeard), h('span', 'guide-hearing', S.talkHearing));
    const wave = h('div', 'guide-wave');
    for (let i = 0; i < 5; i++) wave.append(h('i'));
    art.append(h('div', 'guide-floor'), keycap, wave, actor('guide-coo-listen', bubble));

    const box = h('div', 'guide-head');
    box.append(h('h2', 'guide-title', S.useTitle));
    const list = h('ul', 'guide-tips');
    const lines = S.tips.map(([name, line], i) => {
      const li = h('li');
      const icon = h('span', 'guide-tipicon');
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TIP_ICONS[i] ?? ''}</svg>`;
      const body = h('div');
      const desc = h('span', null, line);
      body.append(h('strong', null, name), desc);
      li.append(icon, body);
      list.append(li);
      return desc;
    });
    box.append(list);
    el.append(art, box);
    const render = () => {
      const key = voice?.input?.hotkeyLabel || S.talkKeyDefault;
      const mode = voice?.input?.effectiveMode ?? 'hold';
      const on = voice?.enabled !== false;
      keycap.textContent = key;
      keycap.hidden = !on || mode === 'always';
      wave.hidden = !on;
      lines[0]!.textContent = !on ? S.talkOff : mode === 'hold' ? S.talkHold(key) : mode === 'toggle' ? S.talkToggle(key) : S.talkAlways;
    };
    renderUse = render;
    return { el, enter: render };
  };

  /* ---------- 4 done ---------- */
  const noKey = h('div', 'guide-warn');
  const done = (): Step => {
    const el = h('section', 'guide-step guide-split');
    const art = h('div', 'guide-art guide-art-tray');
    const menu = h('div', 'guide-traymenu');
    S.trayMenu.forEach((item, i) => menu.append(h('span', i === 1 ? 'on' : null, item)));
    const bar = h('div', 'guide-taskbar');
    const icons = h('div', 'guide-trayicons');
    for (let i = 0; i < 3; i++) icons.append(h('i'));
    const mine = h('span', 'guide-trayicon');
    mine.title = S.trayTip;
    mine.innerHTML = COO;
    icons.append(mine);
    bar.append(h('span', 'grow'), icons, h('span', 'guide-clock', '9:41'));
    art.append(menu, bar);

    const box = head(S.doneTitle, S.doneLead);
    noKey.append(h('span', null, S.doneNoKey), ui.button(S.doneNoKeyBtn, { size: 'sm', onClick: () => go(1) }));
    const dress = h('button', 'guide-textbtn', S.dress);
    dress.type = 'button';
    dress.addEventListener('click', () => { close('done'); o.router.navigate(['dress']); }, opts);
    box.append(noKey, dress);
    el.append(art, box);
    return { el, enter: () => { noKey.hidden = connected; } };
  };

  const steps: Step[] = [hello(), model(), use(), done()];
  const TOTAL = steps.length;

  steps.forEach((_, i) => {
    const d = h('button', 'guide-dot');
    d.type = 'button';
    d.setAttribute('aria-label', S.dot(i + 1));
    d.addEventListener('click', () => go(i), opts);
    dots.append(d);
  });

  function syncFoot(): void {
    back.hidden = at === 0;
    const keyLater = at === 1 && !connected;
    next.textContent = at === TOTAL - 1 ? S.finish : keyLater ? S.later : S.next;
    next.classList.toggle('primary', !keyLater);
    skip.hidden = at === TOTAL - 1;
    [...dots.children].forEach((d, i) => {
      d.classList.toggle('on', i === at);
      d.classList.toggle('past', i < at);
      if (i === at) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
  }

  function go(i: number): void {
    const n = Math.max(0, Math.min(TOTAL - 1, i));
    if (shown && n === at) return;
    if (shown) steps[at]!.leave?.();
    const forward = n >= at;
    at = n;
    shown = true;
    const step = steps[n]!;
    step.el.classList.remove('from-left', 'from-right');
    step.el.classList.add(forward ? 'from-right' : 'from-left');
    stage.replaceChildren(step.el);
    stage.scrollTop = 0;
    syncFoot();
    step.enter?.();
    if (n === 0) userInput.focus({ preventScroll: true });
    else if (!(n === 1 && !connected)) next.focus({ preventScroll: true });
  }

  const remove = () => { root.remove(); o.doc.body.classList.remove('guide-open'); };
  let closed = false;
  function close(how: 'done' | 'skip'): void {
    if (closed) return;
    closed = true;
    steps[at]!.leave?.();
    markSeen();
    // fades out on its own; the owner's lifecycle may end right away
    root.classList.add('leaving');
    root.inert = true;
    setTimeout(remove, 180);
    o.onClose(how);
  }

  back.addEventListener('click', () => go(at - 1), opts);
  next.addEventListener('click', () => {
    if (at === TOTAL - 1) { close('done'); o.router.navigate(['home']); return; }
    go(at + 1);
  }, opts);
  skip.addEventListener('click', () => close('skip'), opts);
  signal.addEventListener('abort', () => { if (!closed) remove(); }, { once: true });

  /* ---------- live data ---------- */
  async function refresh(): Promise<void> {
    detail = await readDetail(signal);
    try { status = await readStatus(signal); } catch { status = null; }
    connected = keyConnected(status, detail);
    renderModel();
    noKey.hidden = connected;
    syncFoot();
  }
  const refreshVoice = async () => {
    try {
      voice = await post<VoiceState>(`/api/console/providers/${encodeURIComponent(PET_PAGE)}/panels/voice/state`, { args: [] }, opts);
    } catch { voice = null; }
    renderUse();
  };
  const loadHabits = async () => {
    try {
      const d = await get<{ groups?: ConfigEntry[] }>('/api/config', opts);
      const values = d.groups?.find((g) => g.group.id === PET_PAGE)?.values ?? {};
      const name = values[USER_KEY];
      if (typeof name === 'string') {
        savedUser = name;
        // the default stays a placeholder, so the box asks for a real name
        if (name !== DEFAULT_USER && !userInput.value) { userInput.value = name; greet(); }
      }
      if (typeof values[ROAM_KEY] === 'string') roam.setValue(values[ROAM_KEY] as string);
    } catch { /* 读不到就留空,照样能填 */ }
  };

  o.doc.body.classList.add('guide-open');
  o.doc.body.append(root);
  go(0);
  void loadHabits();
  void refresh();
  void refreshVoice();
  const timer = setInterval(() => { void refresh(); void refreshVoice(); }, 3000);
  signal.addEventListener('abort', () => clearInterval(timer), { once: true });
}
