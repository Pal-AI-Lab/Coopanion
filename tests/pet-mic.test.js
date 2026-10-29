import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMic } from '../packages/cortico-world-desktop-pet/web/mic.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The page's microphone over a media device list whose system default the test moves. Like
 * Chromium's, the list leads with a 'default' entry that keeps its deviceId while the input
 * behind it changes, and a capture stays on the device it opened on.
 */
function page({ micDevice = '', deny = false } = {}) {
  const messages = [], streams = [], contexts = [];
  const prefs = { mic: true, micDevice };
  const media = new EventTarget();
  const inputs = [
    { kind: 'audioinput', deviceId: 'virtual', groupId: 'g-virtual', label: 'Virtual input' },
    { kind: 'audioinput', deviceId: 'array', groupId: 'g-array', label: 'Microphone array' },
  ];
  let defaultId = 'virtual';
  media.enumerateDevices = async () => {
    const d = inputs.find((i) => i.deviceId === defaultId);
    return [{ ...d, deviceId: 'default', label: `Default - ${d.label}` }, ...inputs];
  };
  media.getUserMedia = async ({ audio }) => {
    if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
    const input = inputs.find((i) => i.deviceId === (audio.deviceId?.exact ?? defaultId));
    const track = Object.assign(new EventTarget(), { label: input.label, live: true, stop() { this.live = false; } });
    const stream = { id: input.deviceId, track, getTracks: () => [track], getAudioTracks: () => [track] };
    streams.push(stream);
    return stream;
  };
  vi.stubGlobal('navigator', { mediaDevices: media });
  vi.stubGlobal('AudioContext', class {
    closed = false;
    audioWorklet = { addModule: async () => {} };
    constructor() { contexts.push(this); }
    createMediaStreamSource() { return { connect() {} }; }
    close() { this.closed = true; }
  });
  vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null }; });
  const mic = createMic({ prefs, send: (m) => messages.push(m), sendAudio: () => {} });
  return {
    mic, prefs, messages, contexts,
    /** The devices with a capture open on them. */
    live: () => streams.filter((s) => s.track.live).map((s) => s.id),
    /** Makes `id` the system default and fires the device change. */
    setDefault: (id) => { defaultId = id; media.dispatchEvent(new Event('devicechange')); },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('pet microphone', () => {
  it('moves to the new system default input when none is chosen', async () => {
    const p = page();
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual(['array']);
    expect(p.contexts[0].closed).toBe(true);
    expect(p.messages.filter((m) => m.t === 'mic').at(-1)).toMatchObject({ state: 'on', detail: 'Microphone array' });
  });

  it('stays on the chosen input when the system default changes', async () => {
    const p = page({ micDevice: 'virtual' });
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual(['virtual']);
    expect(p.contexts).toHaveLength(1);
  });

  it('does not try again after a permission denial when devices change', async () => {
    const p = page({ deny: true });
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.messages.filter((m) => m.t === 'mic')).toEqual([expect.objectContaining({ state: 'denied' })]);
  });

  it('releases the capture on stop and opens nothing on a later device change', async () => {
    const p = page();
    await p.mic.start();
    p.mic.stop();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual([]);
    expect(p.contexts.every((c) => c.closed)).toBe(true);
    expect(p.messages.filter((m) => m.t === 'mic').at(-1)).toEqual({ t: 'mic', state: 'off' });
  });
});
