// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Lifecycle } from '../console/base/lifecycle.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { chatPage } from '../console/features/chat/index.ts';
import { dayRange } from '../console/features/chat/history.ts';
import { H } from '../console/features/chat/history-strings.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let socket, life, root;
class ChatSocket {
  readyState = 0;
  sent = [];
  constructor() {
    socket = this;
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; }
  frame(frame) { act(() => this.onmessage?.({ data: JSON.stringify(frame) })); }
  last(type) { return this.sent.filter((frame) => frame.t === type).at(-1); }
}
beforeEach(async () => {
  window.WebSocket = ChatSocket;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', async (path) => {
    if (path === '/api/config') return new Response(JSON.stringify({ groups: [] }));
    throw new Error(`Unexpected request: ${path}`);
  });
  life = new Lifecycle((error) => { throw error; });
  root = document.createElement('div'); document.body.append(root);
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  await act(() => chatPage.mount({
    root, ui, lifecycle: life, signal: life.signal, capabilities: {}, onError: (error) => { throw error; },
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) }, mountPanel: async () => ({ dispose() {} }),
  }));
  await vi.waitFor(() => expect(socket.readyState).toBe(1));
  socket.frame({ t: 'init', bot: 'Coo', items: [user(90, 'latest')], phase: { state: 'idle', running: [] } });
});
afterEach(() => {
  act(() => life.dispose()); document.body.replaceChildren(); localStorage.clear();
  delete window.WebSocket; delete window.coopanionWindow; delete Element.prototype.scrollIntoView;
  vi.unstubAllGlobals();
});
const user = (cursor, text) => ({ kind: 'user', cursor, ts: '2026-10-22T10:00:00.000Z', via: 'chat', text });
const button = (text) => [...root.querySelectorAll('button')].find((node) => node.textContent === text);
const submit = (query = '', date = '') => {
  root.querySelector('input[type="search"]').value = query;
  root.querySelector('input[type="date"]').value = date;
  act(() => root.querySelector('.chat-history-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  return socket.last('history');
};
const click = (node) => act(() => node.click());

it('finds unloaded history, navigates matches in context, and returns to live messages', () => {
  const request = submit('earlier', '2026-10-22');
  expect(request).toMatchObject({ query: 'earlier', ...dayRange('2026-10-22') });
  socket.frame({ t: 'history', id: request.id, matches: [user(1, 'earlier <script>'), user(2, 'earlier too')], more: false });
  expect(root.querySelectorAll('.chat-history-result')).toHaveLength(2);
  expect(root.querySelector('.chat-history-results script')).toBeNull();
  socket.frame({ t: 'located', id: socket.last('locate').id, cursor: 1, items: [user(1, 'earlier <script>'), user(2, 'earlier too')] });
  expect(root.querySelector('.chat-match').textContent).toContain('earlier <script>');
  expect(root.querySelector('.chat-thread').textContent).not.toContain('latest');
  click(button(H.next));
  expect(socket.last('locate').cursor).toBe(2);
  socket.frame({ t: 'item', item: user(91, 'arrived meanwhile') });
  click(button(H.latest));
  expect(root.querySelector('.chat-thread').textContent).toContain('arrived meanwhile');
  expect(root.querySelector('.chat-thread').textContent).toContain('latest');
});

it('ignores stale searches and location replies, and pages with the submitted filters', () => {
  const old = submit('old'); const current = submit('current');
  socket.frame({ t: 'history', id: old.id, matches: [user(1, 'old')], more: false });
  expect(root.querySelectorAll('.chat-history-result')).toHaveLength(0);
  socket.frame({ t: 'history', id: current.id, matches: [user(3, 'current')], more: true, before: 3, snapshot: 100 });
  const location = socket.last('locate');
  root.querySelector('input[type="search"]').value = 'unsent';
  click(button(H.more));
  expect(socket.last('history')).toMatchObject({ query: 'current', before: 3, snapshot: 100 });
  click(button(H.latest));
  socket.frame({ t: 'located', id: location.id, cursor: 3, items: [user(3, 'current')] });
  expect(root.querySelector('.chat-thread').textContent).toContain('latest');
});

it('exports the selected local day independently of the search and exposes native folder reveal after saving', async () => {
  let exported;
  let revealed = false;
  window.coopanionWindow = {
    exportChat: async (data) => { exported = data; return true; },
    revealChatExport: async () => { revealed = true; },
  };
  submit('only a keyword', '2026-10-22');
  click(button(H.export));
  const request = socket.last('export');
  expect(request).toMatchObject(dayRange('2026-10-22'));
  expect(request).not.toHaveProperty('query');
  socket.frame({ t: 'exported', id: request.id, text: '# transcript\n你好' });
  await vi.waitFor(() => expect(button(H.reveal).hidden).toBe(false));
  expect(exported).toEqual({ name: 'coopanion-chat-2026-10-22.md', text: '# transcript\n你好' });
  click(button(H.reveal));
  expect(revealed).toBe(true);
});

it('recovers search and export controls after server errors or a lost connection', () => {
  const request = submit('missing');
  socket.frame({ t: 'historyError', id: request.id, message: 'bad query' });
  expect(root.querySelector('[role="status"]').textContent).toBe(H.failed);
  expect(button(H.search).disabled).toBe(false);
  click(button(H.export));
  act(() => socket.onclose?.({}));
  expect(button(H.export).disabled).toBe(false);
});

it('keeps loading search pages when a concurrent location fails', () => {
  const request = submit('earlier');
  socket.frame({ t: 'history', id: request.id, matches: [user(3, 'earlier three')], more: true, before: 3 });
  const location = socket.last('locate');
  click(button(H.more));
  const page = socket.last('history');
  socket.frame({ t: 'historyError', id: location.id, message: 'missing' });
  socket.frame({ t: 'history', id: page.id, matches: [user(1, 'earlier one')], more: false });
  expect([...root.querySelectorAll('.chat-history-result span')].map((node) => node.textContent)).toEqual(['earlier one', 'earlier three']);
});

it('does not leave the latest messages when a canceled search arrives', () => {
  const request = submit('earlier');
  click(button(H.latest));
  socket.frame({ t: 'history', id: request.id, matches: [user(1, 'earlier')], more: false });
  expect(socket.last('locate')).toBeUndefined();
  expect(root.querySelector('.chat-thread').textContent).toContain('latest');
});

it('cancels the timeout of a replaced location', () => {
  vi.useFakeTimers();
  try {
    const request = submit('earlier');
    socket.frame({ t: 'history', id: request.id, matches: [user(1, 'earlier one'), user(2, 'earlier two')], more: false });
    act(() => vi.advanceTimersByTime(1000));
    click(button(H.next));
    const location = socket.last('locate');
    act(() => vi.advanceTimersByTime(29000));
    socket.frame({ t: 'located', id: location.id, cursor: 2, items: [user(2, 'earlier two')] });
    expect(root.querySelector('.chat-match').textContent).toContain('earlier two');
  } finally { vi.useRealTimers(); }
});

it('preserves the archive reading position when live pagination or initialization arrives', () => {
  const request = submit('earlier');
  socket.frame({ t: 'history', id: request.id, matches: [user(1, 'earlier')], more: false });
  socket.frame({ t: 'located', id: socket.last('locate').id, cursor: 1, items: [user(1, 'earlier')] });
  const scroll = root.querySelector('.chat-scroll');
  Object.defineProperty(scroll, 'scrollHeight', { value: 5000 });
  scroll.scrollTop = 1000;
  socket.frame({ t: 'older', items: [user(80, 'live earlier')], more: false });
  expect(scroll.scrollTop).toBe(1000);
  socket.frame({ t: 'init', bot: 'Coo', items: [user(90, 'latest')], phase: { state: 'idle', running: [] } });
  expect(scroll.scrollTop).toBe(1000);
});
