/**
 * LAN rooms. The page only names the player and asks the desktop-pet World to host or join; the
 * World owns the listener and connection. Hosting and joining are mutually exclusive here and in
 * the World. The active button closes the room instead of starting a second connection.
 */
import { invokePanel } from '../../base/api.ts';
import type { Page, PageContext } from '../../base/page.ts';
import { intro } from '../intro.ts';
import { S } from './strings.ts';

const PET_PAGE = 'world:desktop-pet';
const NAME_KEY = 'coopanion.online.name';
const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = '11451';

interface OnlineUiState {
  mode: 'off' | 'host' | 'guest';
  phase: 'idle' | 'connecting' | 'connected' | 'error';
  name: string;
  host: string;
  port: number;
  players: Array<{ id: string; name: string }>;
  addresses: string[];
  error: { code: keyof typeof S.errors; detail: string | null } | null;
}

const errText = (err: unknown) => err instanceof Error ? err.message : String(err);

async function mount(ctx: PageContext): Promise<void> {
  const { ui, root, signal } = ctx;
  const opts = { signal };
  root.classList.add('home');
  root.append(intro(ui, S.nav, { desc: S.intro }));

  let savedName = '';
  try { savedName = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* storage may be unavailable */ }

  const profile = ui.sheet({ title: S.profileTitle });
  const name = ui.input({ value: savedName, placeholder: S.name });
  name.maxLength = 24;
  name.autocomplete = 'off';
  name.spellcheck = false;
  name.addEventListener('input', () => {
    try { localStorage.setItem(NAME_KEY, name.value); } catch { /* storage may be unavailable */ }
  }, opts);
  const nameField = ui.field(S.name, name);
  nameField.classList.add('online-grow');
  const profileRow = ui.h('div', 'online-form');
  profileRow.append(nameField, ui.h('p', 'home-note', S.nameHint));
  profile.body.append(profileRow);

  const join = ui.sheet({ title: S.joinTitle, desc: S.joinHint });
  const joinHost = ui.input({ value: DEFAULT_HOST, placeholder: DEFAULT_HOST });
  joinHost.autocomplete = 'off';
  joinHost.spellcheck = false;
  const joinPort = ui.input({ value: DEFAULT_PORT, type: 'number' });
  joinPort.min = '1';
  joinPort.max = '65535';
  joinPort.step = '1';
  const joinButton = ui.button(S.join, { variant: 'primary' });
  const joinRow = ui.h('div', 'online-form online-connect');
  joinRow.append(
    ui.field(S.joinHost, joinHost),
    ui.field(S.port, joinPort),
    joinButton,
  );
  join.body.append(joinRow);

  const host = ui.sheet({ title: S.hostTitle, desc: S.hostHint });
  const hostAddress = ui.input({ value: DEFAULT_HOST, placeholder: DEFAULT_HOST });
  hostAddress.autocomplete = 'off';
  hostAddress.spellcheck = false;
  const hostPort = ui.input({ value: DEFAULT_PORT, type: 'number' });
  hostPort.min = '1';
  hostPort.max = '65535';
  hostPort.step = '1';
  const createButton = ui.button(S.create, { variant: 'primary' });
  const hostRow = ui.h('div', 'online-form online-connect');
  hostRow.append(
    ui.field(S.hostAddress, hostAddress),
    ui.field(S.port, hostPort),
    createButton,
  );
  host.body.append(hostRow);

  const status = ui.sheet({ title: S.statusTitle });
  const statusLine = ui.h('div', 'online-statusline');
  const statusPill = ui.pill(S.idle, 'off');
  const statusText = ui.h('span', 'online-statustext');
  statusLine.append(statusPill, statusText);
  const message = ui.msgline('');
  const addressLine = ui.h('p', 'home-note');
  const playersLine = ui.h('p', 'home-note');
  status.body.append(statusLine, message, addressLine, playersLine);
  root.append(profile.el, join.el, host.el, status.el);

  let state: OnlineUiState | null = null;
  let pending = false;

  const actionError = (st: OnlineUiState | null): string => {
    if (!st?.error) return '';
    const reason = S.errors[st.error.code] ?? st.error.code;
    return st.error.detail ? `${reason} ${st.error.detail}` : reason;
  };

  const render = (): void => {
    const st = state;
    const active = !!st && st.mode !== 'off';
    const hosting = st?.mode === 'host' && st.phase === 'connected';
    const joined = st?.mode === 'guest' && st.phase === 'connected';
    name.disabled = active;
    joinHost.disabled = active;
    joinPort.disabled = active;
    hostAddress.disabled = active;
    hostPort.disabled = active;

    joinButton.textContent = joined ? S.leave : S.join;
    createButton.textContent = hosting ? S.close : S.create;
    joinButton.disabled = pending || hosting;
    createButton.disabled = pending || joined;

    statusPill.textContent = st?.phase === 'connecting' ? S.connecting
      : hosting ? S.hosting(st.port)
        : joined ? S.joined(st.host, st.port) : S.idle;
    statusPill.className = `pill ${hosting || joined ? 'on' : st?.phase === 'error' ? 'off' : 'off'}`;
    statusText.textContent = st?.players.length ? S.players(st.players.length + (hosting || joined ? 1 : 0)) : '';
    const failure = actionError(st);
    message.textContent = failure;
    message.classList.toggle('bad', !!failure);
    addressLine.textContent = hosting && st.addresses.length ? `${S.address}: ${st.addresses.join(', ')}` : '';
    addressLine.hidden = !addressLine.textContent;
    playersLine.textContent = st?.players.length ? st.players.map((p) => p.name).join(' · ') : active ? S.noPlayers : '';
    playersLine.hidden = !playersLine.textContent;
  };

  const call = async (method: string, args: unknown[]): Promise<void> => {
    if (pending) return;
    if (!name.value.trim()) {
      message.textContent = S.errors.name;
      message.classList.add('bad');
      name.focus();
      return;
    }
    const port = method === 'createOnlineRoom' ? Number(hostPort.value) : Number(joinPort.value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      message.textContent = S.errors.port;
      message.classList.add('bad');
      (method === 'createOnlineRoom' ? hostPort : joinPort).focus();
      return;
    }
    pending = true;
    render();
    try {
      state = await invokePanel<OnlineUiState>(PET_PAGE, 'pet', method, args, opts);
    } catch (err) {
      if (signal.aborted) return;
      state = state ?? null;
      message.textContent = errText(err);
      message.classList.add('bad');
    } finally {
      pending = false;
      render();
    }
  };

  const leave = async (): Promise<void> => {
    if (pending) return;
    pending = true;
    render();
    try {
      state = await invokePanel<OnlineUiState>(PET_PAGE, 'pet', 'leaveOnlineRoom', [], opts);
    } catch (err) {
      if (!signal.aborted) {
        message.textContent = errText(err);
        message.classList.add('bad');
      }
    } finally {
      pending = false;
      render();
    }
  };

  joinButton.addEventListener('click', () => {
    if (state?.mode === 'guest') void leave();
    else void call('joinOnlineRoom', [name.value.trim(), joinHost.value.trim(), Number(joinPort.value)]);
  }, opts);
  createButton.addEventListener('click', () => {
    if (state?.mode === 'host') void leave();
    else void call('createOnlineRoom', [name.value.trim(), hostAddress.value.trim(), Number(hostPort.value)]);
  }, opts);

  const refresh = async (): Promise<void> => {
    try {
      state = await invokePanel<OnlineUiState>(PET_PAGE, 'pet', 'onlineState', [], opts);
      render();
    } catch (err) {
      if (signal.aborted) return;
      message.textContent = errText(err);
      message.classList.add('bad');
    }
  };

  await refresh();
  ctx.lifecycle.interval(() => void refresh(), 1500);
}

export const onlinePage: Page = {
  route: 'online',
  label: S.nav,
  icon: 'network',
  mount,
};
