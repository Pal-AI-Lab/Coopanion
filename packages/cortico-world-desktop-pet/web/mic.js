/**
 * The pet page's microphone: 16 kHz mono through web/mic-worklet.js while the World asks for it.
 * With no device chosen the capture follows the system default input: a device change that moves
 * the default closes the stream and opens the new default. A capture whose track ended is opened
 * again, and an open that failed for any reason but a permission denial is tried again on the next
 * device change.
 *
 * `prefs.mic` is whether the World wants the microphone, `prefs.micDevice` the chosen deviceId or
 * '' for the default; `send(msg)` goes to the World, `sendAudio(data)` carries the worklet's chunks.
 */
export function createMic({ prefs, send, sendAudio }) {
  const media = navigator.mediaDevices;
  /** null, `{ starting, devicesChanged }` while opening, or the open capture. */
  let mic = null;
  let retry = false;

  /** Reports the inputs to the World and returns the default input's identity, or undefined when they cannot be read. */
  async function reportDevices() {
    try {
      const inputs = (await media.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      // Chromium's 'default' entry keeps its deviceId when the input behind it changes
      const input = inputs.find((d) => d.deviceId === 'default') ?? inputs[0];
      // before microphone access is granted the entries have an empty deviceId
      const list = inputs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
      send({ t: 'devices', list: list.map((d) => ({ id: d.deviceId, label: d.label })) });
      return JSON.stringify(input ? [input.deviceId, input.groupId, input.label] : null);
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async function start() {
    if (mic) return;
    retry = false;
    const opening = mic = { starting: true, devicesChanged: false };
    // 拿到一半就失败时也要停麦关声卡,否则录音指示灯常亮到页面刷新
    let stream = null, ctx = null;
    try {
      // read before opening: a report after it may already see the next default
      const defaultInput = await reportDevices();
      if (mic !== opening) return;
      const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      if (prefs.micDevice) audio.deviceId = { exact: prefs.micDevice };
      stream = await media.getUserMedia({ audio });
      ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.audioWorklet.addModule('/web/mic-worklet.js');
      // closed, or closed and opened again, while this one was opening
      if (mic !== opening) { stream.getTracks().forEach((t) => t.stop()); ctx.close(); return; }
      const node = new AudioWorkletNode(ctx, 'pet-mic');
      const active = mic = { stream, ctx, node, defaultInput };
      // chunks a replaced capture still had queued are dropped
      node.port.onmessage = (e) => { if (mic === active) sendAudio(e.data); };
      ctx.createMediaStreamSource(stream).connect(node);
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (mic !== active) return;
          stop();
          if (prefs.mic) void start();
        });
      }
      send({ t: 'mic', state: 'on', detail: stream.getAudioTracks()[0]?.label || null });
      // the labels are readable now; a change while opening may have moved the default away from this capture
      void (opening.devicesChanged ? followDefault() : reportDevices());
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
      if (mic !== opening) return;
      mic = null;
      const denied = err?.name === 'NotAllowedError';
      retry = !denied;
      send({ t: 'mic', state: denied ? 'denied' : 'error', detail: String(err?.message || err) });
      // access was granted, so the labels are readable: list the devices, another one may open where this one did not
      if (!denied) void reportDevices();
    }
  }

  /** Reopens a capture on the default input when the default is no longer the one it opened on. */
  async function followDefault() {
    const current = mic;
    const input = await reportDevices();
    if (mic === current && !prefs.micDevice && input !== undefined && input !== current.defaultInput) {
      stop();
      void start();
    }
  }

  function stop() {
    const m = mic;
    mic = null;
    retry = false;
    if (!m || m.starting) return;
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close();
    send({ t: 'mic', state: 'off' });
  }

  media?.addEventListener('devicechange', () => {
    if (!mic) { if (prefs.mic && retry) void start(); }
    else if (mic.starting) mic.devicesChanged = true;
    else void followDefault();
  });

  return { start, stop };
}
