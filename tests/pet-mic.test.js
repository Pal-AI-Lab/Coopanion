import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../packages/cortico-world-desktop-pet/web/pet-app.js', import.meta.url), 'utf8');
const start = source.indexOf('let mic = null;');
const microphone = source.slice(start, source.indexOf('/* ---------- actions:', start));
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Media capture keeps its original device until its track is stopped. */
function page({ deviceId = '', aliases = true } = {}) {
  const messages = [], frames = [], streams = [], contexts = [], nodes = [], errors = [];
  const prefs = { mic: true, micDevice: deviceId };
  const media = new EventTarget();
  media.attempts = [];
  media.defaultId = 'virtual';
  media.inputs = [
    { kind: 'audioinput', deviceId: 'virtual', groupId: 'virtual-group', label: 'Virtual input' },
    { kind: 'audioinput', deviceId: 'array', groupId: 'array-group', label: 'Microphone array' },
  ];
  media.other = [];
  media.list = () => {
    const selected = media.inputs.find((d) => d.deviceId === media.defaultId);
    return [
      ...(aliases && selected ? [{ ...selected, deviceId: 'default', label: `Default - ${selected.label}` }, { ...selected, deviceId: 'communications' }] : []),
      ...media.inputs.filter((d) => d === selected), ...media.inputs.filter((d) => d !== selected), ...media.other,
    ];
  };
  media.enumerateDevices = async () => {
    const list = media.list();
    const pending = media.nextEnumeration; media.nextEnumeration = null;
    if (pending) await pending.promise;
    return list;
  };
  media.getUserMedia = async ({ audio }) => {
    const id = audio.deviceId?.exact || media.defaultId;
    media.attempts.push(id);
    const input = media.inputs.find((d) => d.deviceId === id);
    if (!input) throw new DOMException('Input is unavailable', 'NotFoundError');
    const track = Object.assign(new EventTarget(), {
      label: input.label, readyState: 'live',
      stop() { this.readyState = 'ended'; },
      end() { this.stop(); this.dispatchEvent(new Event('ended')); },
    });
    const stream = { id, track, getTracks: () => [track], getAudioTracks: () => [track] };
    const pending = media.nextOpen; media.nextOpen = null;
    if (pending) await pending.promise;
    streams.push(stream);
    return stream;
  };
  media.change = (id = media.defaultId) => { media.defaultId = id; media.dispatchEvent(new Event('devicechange')); };
  class AudioContext {
    state = 'running';
    audioWorklet = { addModule: async () => {
      const pending = media.nextWorklet; media.nextWorklet = null;
      if (pending) await pending.promise;
    } };
    constructor() { contexts.push(this); }
    createMediaStreamSource(stream) { return { connect: (node) => { node.stream = stream; } }; }
    async close() { this.state = 'closed'; }
  }
  class AudioWorkletNode {
    port = { onmessage: null };
    constructor(ctx) { this.ctx = ctx; nodes.push(this); }
    emit(data) { this.port.onmessage?.({ data }); }
  }
  const control = runInNewContext(`${microphone}\n({ startMic, stopMic })`, {
    navigator: { mediaDevices: media }, AudioContext, AudioWorkletNode, prefs,
    ws: { readyState: 1, send: (data) => frames.push(data) },
    send: (message) => messages.push(message), console: { error: (err) => errors.push(err) },
  });
  return {
    ...control, media, prefs, messages, frames, streams, contexts, nodes, errors,
    active: () => streams.filter((s) => s.track.readyState === 'live').map((s) => s.id),
    states: () => messages.filter((m) => m.t === 'mic'),
  };
}

describe('pet microphone', () => {
  it.each([true, false])('follows the default input with device aliases: %s', async (aliases) => {
    const p = page({ aliases });
    await p.startMic(); await settle();
    const oldNode = p.nodes[0];
    oldNode.emit('old audio');
    p.media.change('array'); await settle();
    expect(p.active()).toEqual(['array']);
    expect(p.contexts[0].state).toBe('closed');
    expect(p.states().at(-1)).toMatchObject({ state: 'on', detail: 'Microphone array' });
    oldNode.emit('queued old audio');
    p.nodes.at(-1).emit('new audio');
    expect(p.frames).toEqual(['old audio', 'new audio']);
    p.stopMic();
    expect(p.active()).toEqual([]);
    expect(p.contexts.every((ctx) => ctx.state === 'closed')).toBe(true);
  });

  it('keeps an explicitly selected input when the system default changes', async () => {
    const p = page({ deviceId: 'virtual' });
    await p.startMic(); await settle();
    const stream = p.streams[0];
    p.media.change('array'); await settle();
    expect(p.streams).toEqual([stream]);
    expect(p.active()).toEqual(['virtual']);
    expect(p.messages.at(-1)).toEqual({ t: 'devices', list: [
      { id: 'array', label: 'Microphone array' }, { id: 'virtual', label: 'Virtual input' },
    ] });
    p.stopMic();
  });

  it('distinguishes default inputs with identical labels by their group', async () => {
    const p = page();
    p.media.inputs[1].label = p.media.inputs[0].label;
    await p.startMic(); await settle();
    p.media.change('array'); await settle();
    expect(p.active()).toEqual(['array']);
    p.stopMic();
  });

  it('keeps the stream when a camera, speaker or non-default input changes', async () => {
    const p = page();
    await p.startMic(); await settle();
    const stream = p.streams[0];
    p.media.other.push({ kind: 'videoinput', deviceId: 'camera' }, { kind: 'audiooutput', deviceId: 'speaker' });
    p.media.inputs.push({ kind: 'audioinput', deviceId: 'usb', groupId: 'usb-group', label: 'USB input' });
    p.media.change(); await settle();
    expect(p.streams).toEqual([stream]);
    expect(p.active()).toEqual(['virtual']);
    expect(p.messages.at(-1).list).toContainEqual({ id: 'usb', label: 'USB input' });
    p.stopMic();
  });

  it.each(['nextOpen', 'nextWorklet'])('follows a switch while %s is pending', async (phase) => {
    const p = page();
    const pending = p.media[phase] = deferred();
    const opening = p.startMic(); await settle();
    p.media.change('array');
    pending.resolve(); await opening; await settle();
    expect(p.active()).toEqual(['array']);
    expect(p.states().filter((s) => s.state === 'on')).toEqual([{ t: 'mic', state: 'on', detail: 'Microphone array' }]);
    p.stopMic();
  });

  it('opens only one replacement when audio mode changes during startup', async () => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextWorklet = deferred();
    p.media.change('array'); await settle();
    p.media.other.push({ kind: 'audiooutput', deviceId: 'headset-call-output' });
    p.media.change();
    pending.resolve(); await settle();
    expect(p.streams).toHaveLength(2);
    expect(p.active()).toEqual(['array']);
    p.stopMic();
  });

  it('follows a switch during a later opening after the default changed while stopped', async () => {
    const p = page();
    await p.startMic(); await settle();
    p.stopMic();
    p.media.change('array');
    const pending = p.media.nextOpen = deferred();
    const opening = p.startMic();
    p.media.change('virtual');
    pending.resolve(); await opening; await settle();
    expect(p.active()).toEqual(['virtual']);
    p.stopMic();
  });

  it('discards an older device enumeration when changes finish out of order', async () => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextEnumeration = deferred();
    p.media.change();
    p.media.change('array'); await settle();
    const latest = p.messages.at(-1);
    pending.resolve(); await settle();
    expect(p.active()).toEqual(['array']);
    expect(p.messages.at(-1)).toEqual(latest);
    p.stopMic();
  });

  it('does not reopen after stopping while a device enumeration is pending', async () => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextEnumeration = deferred();
    p.media.change('array');
    p.stopMic();
    pending.resolve(); await settle();
    p.media.change('virtual'); await settle();
    expect(p.active()).toEqual([]);
    expect(p.states().at(-1).state).toBe('off');
  });

  it.each([false, true])('releases a cancelled replacement with a late failure: %s', async (fail) => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextWorklet = deferred();
    p.media.change('array'); await settle();
    expect(p.contexts[0].state).toBe('closed');
    p.prefs.mic = false;
    p.stopMic();
    const states = [...p.states()];
    if (fail) pending.reject(new Error('Worklet failed')); else pending.resolve();
    await settle();
    expect(p.active()).toEqual([]);
    expect(p.contexts.every((ctx) => ctx.state === 'closed')).toBe(true);
    expect(p.states()).toEqual(states);
  });

  it('reports replacement failures and releases the audio resources', async () => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextWorklet = deferred();
    p.media.change('array'); await settle();
    pending.reject(new Error('Worklet failed')); await settle();
    expect(p.active()).toEqual([]);
    expect(p.contexts.every((ctx) => ctx.state === 'closed')).toBe(true);
    expect(p.states().at(-1)).toMatchObject({ state: 'error', detail: 'Worklet failed' });
  });

  it('does not overwrite a new stream with a cancelled open error', async () => {
    const p = page();
    const pending = p.media.nextOpen = deferred();
    const oldOpening = p.startMic(); await settle();
    p.stopMic();
    p.prefs.micDevice = 'array';
    await p.startMic(); await settle();
    const states = [...p.states()];
    pending.reject(new DOMException('Permission denied', 'NotAllowedError'));
    await oldOpening;
    expect(p.active()).toEqual(['array']);
    expect(p.states()).toEqual(states);
    p.stopMic();
  });

  it('recovers from a failed default input when a usable device is selected again', async () => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextOpen = deferred();
    p.media.change('array'); await settle();
    pending.reject(new DOMException('Input is busy', 'NotReadableError')); await settle();
    expect(p.active()).toEqual([]);
    expect(p.states().at(-1)).toMatchObject({ state: 'error', detail: 'Input is busy' });
    p.media.change('virtual'); await settle();
    expect(p.active()).toEqual(['virtual']);
    expect(p.states().at(-1)).toMatchObject({ state: 'on', detail: 'Virtual input' });
    p.stopMic();
  });

  it('retries a temporarily unavailable input when devices change without a new default', async () => {
    const p = page();
    const pending = p.media.nextOpen = deferred();
    const opening = p.startMic(); await settle();
    pending.reject(new DOMException('Input is not ready', 'NotReadableError'));
    await opening;
    p.media.change(); await settle();
    expect(p.active()).toEqual(['virtual']);
    p.stopMic();
  });

  it('reopens the selected microphone after its track ends and it is plugged back in', async () => {
    const p = page({ deviceId: 'virtual' });
    await p.startMic(); await settle();
    const input = p.media.inputs.shift();
    p.streams[0].track.end();
    p.media.change('array'); await settle();
    expect(p.active()).toEqual([]);
    expect(p.contexts[0].state).toBe('closed');
    p.media.inputs.push(input);
    p.media.change(); await settle();
    expect(p.active()).toEqual(['virtual']);
    p.stopMic();
  });

  it('never retries a permission denial on device changes', async () => {
    const p = page();
    const pending = p.media.nextOpen = deferred();
    const opening = p.startMic(); await settle();
    pending.reject(new DOMException('Permission denied', 'NotAllowedError'));
    await opening;
    p.media.change('array'); await settle();
    p.media.change('virtual'); await settle();
    expect(p.media.attempts).toHaveLength(1);
    expect(p.active()).toEqual([]);
    expect(p.states().at(-1).state).toBe('denied');
  });

  it.each(['disabled', 'stopped'])('does not retry an input after capture is %s', async (action) => {
    const p = page();
    const pending = p.media.nextOpen = deferred();
    const opening = p.startMic(); await settle();
    pending.reject(new DOMException('Input is busy', 'NotReadableError'));
    await opening;
    if (action === 'disabled') p.prefs.mic = false;
    p.stopMic();
    p.media.change('array'); await settle();
    expect(p.media.attempts).toHaveLength(1);
    expect(p.active()).toEqual([]);
  });

  it('compares a delayed device event with the default before capture opened', async () => {
    const p = page();
    const pending = p.media.nextOpen = deferred();
    const opening = p.startMic(); await settle();
    p.media.defaultId = 'array';
    pending.resolve(); await opening; await settle();
    p.media.change(); await settle();
    expect(p.active()).toEqual(['array']);
    p.stopMic();
  });

  it('does not request capture after stopping during the initial device query', async () => {
    const p = page();
    const pending = p.media.nextEnumeration = deferred();
    const opening = p.startMic();
    p.stopMic();
    pending.resolve(); await opening; await settle();
    expect(p.media.attempts).toHaveLength(0);
    expect(p.active()).toEqual([]);
  });

  it('keeps recording when device enumeration fails and handles the next change', async () => {
    const p = page();
    await p.startMic(); await settle();
    const pending = p.media.nextEnumeration = deferred();
    p.media.change('array');
    pending.reject(new Error('Enumeration failed')); await settle();
    expect(p.active()).toEqual(['virtual']);
    expect(p.errors).toHaveLength(1);
    p.media.change(); await settle();
    expect(p.active()).toEqual(['array']);
    p.stopMic();
  });
});
