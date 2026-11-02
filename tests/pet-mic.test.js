import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMic } from '../packages/cortico-world-desktop-pet/web/mic.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The page's microphone over a media device list whose system default and devices the test moves.
 * Like Chromium's, the list leads with a 'default' entry that keeps its deviceId while the input
 * behind it changes, a capture stays on the device it opened on, an unplugged device ends its
 * captures, and asking for a device that is not listed fails with OverconstrainedError.
 */
function page({ micDevice = '', deny = false } = {}) {
  const messages = [], streams = [], contexts = [];
  const prefs = { mic: true, micDevice };
  const media = new EventTarget();
  const devices = {
    virtual: { kind: 'audioinput', deviceId: 'virtual', groupId: 'g-virtual', label: 'Virtual input' },
    array: { kind: 'audioinput', deviceId: 'array', groupId: 'g-array', label: 'Microphone array' },
  };
  const inputs = Object.values(devices);
  let defaultId = 'virtual';
  media.enumerateDevices = async () => {
    const d = inputs.find((i) => i.deviceId === defaultId);
    return [{ ...d, deviceId: 'default', label: `Default - ${d.label}` }, ...inputs];
  };
  media.getUserMedia = async ({ audio }) => {
    if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
    const input = inputs.find((i) => i.deviceId === (audio.deviceId?.exact ?? defaultId));
    if (!input) throw Object.assign(new Error('Requested device not found'), { name: 'OverconstrainedError' });
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
    /** Removes `id`, ends its captures and fires the device change; the default moves to the first remaining input. */
    unplug: (id) => {
      inputs.splice(inputs.indexOf(devices[id]), 1);
      if (defaultId === id) defaultId = inputs[0].deviceId;
      for (const s of streams) if (s.id === id && s.track.live) { s.track.live = false; s.track.dispatchEvent(new Event('ended')); }
      media.dispatchEvent(new Event('devicechange'));
    },
    /** Lists `id` again and fires the device change. */
    plug: (id) => { inputs.push(devices[id]); media.dispatchEvent(new Event('devicechange')); },
    errors: () => messages.filter((m) => m.t === 'mic' && m.state === 'error'),
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

  it('opens the system default input when the chosen one is not listed', async () => {
    const p = page({ micDevice: 'gone' });
    await p.mic.start();
    await settle();
    expect(p.live()).toEqual(['virtual']);
    expect(p.errors()).toEqual([]);
    expect(p.messages.filter((m) => m.t === 'mic').at(-1)).toMatchObject({ state: 'on', detail: 'Virtual input' });
  });

  it('moves to the default input while the chosen one is unplugged and back when it returns', async () => {
    const p = page({ micDevice: 'array' });
    await p.mic.start();
    p.unplug('array');
    await settle();
    expect(p.live()).toEqual(['virtual']);
    p.plug('array');
    await settle();
    expect(p.live()).toEqual(['array']);
    expect(p.errors()).toEqual([]);
  });

  it('follows the system default while the chosen input is not listed', async () => {
    const p = page({ micDevice: 'gone' });
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual(['array']);
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
