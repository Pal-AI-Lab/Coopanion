// @vitest-environment jsdom
/**
 * The chat page's context ring: full where Coo's Persona asks for the handoff, filled by the count
 * `/api/status` reports, and spinning while a handoff runs, as the phase line says.
 */
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORMINI_CONTEXT_DEFAULTS, Cormini } from '../vendor/cortico/bots/cormini/persona/persona.ts';
import { coopanionPersona } from '../core/persona.ts';
import { Lifecycle } from '../console/base/lifecycle.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { contextGauge } from '../console/features/chat/context.ts';
import { chatPage } from '../console/features/chat/index.ts';
import { S } from '../console/features/chat/strings.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const policy = CORMINI_CONTEXT_DEFAULTS;
const statusAt = (estTokens, hardTokens = null) => ({
  loop: { estTokens, lastTruncateAt: null, context: { hardTokens } },
  context: { maxTokens: policy.maxTokens, softRatio: policy.softRatio },
});

it('is full where Coo’s Persona asks for the handoff, or at the model’s input limit when that is lower', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coo-ring-'));
  try {
    const persona = new (coopanionPersona(Cormini))({ memoryDir: dir, context: () => policy });
    let estTokens = 0;
    let asked = 0;
    persona.attach({
      sessionInfo: (id) => ({ id, running: 0, snapshot: null, estTokens, hardTokens: null }),
      injectInternal: () => {},
      requestContextHandoff: () => { asked++; return true; },
    });
    const full = contextGauge(statusAt(0)).handoffAt;
    estTokens = Math.floor(full);
    persona.onBatchEnd();
    persona.onBatchEnd();
    expect(asked).toBe(0);
    estTokens = Math.floor(full) + 1;
    // the first batch end past the mark reminds Coo to take notes, the next asks for the handoff
    persona.onBatchEnd();
    expect(asked).toBe(0);
    persona.onBatchEnd();
    expect(asked).toBe(1);

    expect(contextGauge(statusAt(0, full - 1000)).handoffAt).toBe(full - 1000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

let sockets;
let status;
let life;

class FakeSocket {
  readyState = 0;
  onopen = null;
  onclose = null;
  onerror = null;
  onmessage = null;
  constructor(url) {
    this.url = url;
    sockets.push(this);
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send() {}
  close() { this.readyState = 3; }
  frame(f) { act(() => { this.onmessage?.({ data: JSON.stringify(f) }); }); }
}

beforeEach(() => {
  sockets = [];
  window.WebSocket = FakeSocket;
  vi.stubGlobal('fetch', async (path) => {
    if (path === '/api/status') return new Response(JSON.stringify(status));
    throw new Error(`Unexpected request: ${path}`);
  });
});

afterEach(() => {
  act(() => life?.dispose());
  life = null;
  document.body.replaceChildren();
  localStorage.clear();
  delete window.WebSocket;
  vi.unstubAllGlobals();
});

async function mountChat() {
  life = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  await act(() => chatPage.mount({
    root, ui, lifecycle: life, signal: life.signal, capabilities: {},
    router: { navigate() {}, addLeaveGuard: () => ({ dispose() {} }) },
    onError: (err) => { throw err; },
    mountPanel: async () => ({ dispose() {} }),
  }));
  await vi.waitFor(() => expect(sockets[0]?.readyState).toBe(1));
  return { root, socket: sockets[0], ring: root.querySelector('.chat-ctx') };
}

it('fills with the reported count and spins while the earlier conversation is tidied up', async () => {
  const full = contextGauge(statusAt(0)).handoffAt;
  status = statusAt(Math.round(full / 4));
  const { root, socket, ring } = await mountChat();
  await vi.waitFor(() => expect(ring.hidden).toBe(false));
  expect(Number.parseFloat(ring.style.getPropertyValue('--fill'))).toBeCloseTo(25, 0);
  socket.frame({ t: 'init', bot: 'Coo', items: [], phase: { state: 'idle', running: [] } });
  expect(ring.dataset.state).toBe('idle');

  socket.frame({ t: 'phase', phase: { state: 'handoff', running: [] } });
  expect(ring.dataset.state).toBe('busy');
  expect(ring.getAttribute('aria-label')).toBe(S.handoff);
  expect(root.querySelector('.chat-phase').textContent).toBe(S.handoff);

  status = { ...statusAt(1000), loop: { ...statusAt(1000).loop, lastTruncateAt: '2026-10-22T15:30:00.000+08:00' } };
  socket.frame({ t: 'phase', phase: { state: 'idle', running: [] } });
  await vi.waitFor(() => expect(ring.getAttribute('aria-label')).toContain(S.contextLast('').trim()));
  expect(ring.dataset.state).toBe('idle');
});
