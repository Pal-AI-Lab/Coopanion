/**
 * The pet page's microphone: 16 kHz mono through web/mic-worklet.js while the World asks for it.
 * The capture opens on the chosen device while the inputs list it and on the system default input
 * otherwise; a device change that moves this target (the default changing, the chosen device leaving
 * or coming back) closes the stream and opens the new target. A capture whose track ended is opened
 * again, and an open that failed for any reason but a permission denial is tried again on the next
 * device change.
 *
 * `prefs.mic` is whether the World wants the microphone, `prefs.micDevice` the chosen deviceId or
 * '' for the default; `send(msg)` goes to the World, `sendAudio(data)` carries the worklet's chunks.
 */
export function createMic({ prefs, send, sendAudio }) {
  const media = navigator.mediaDevices;
  /** null, `{ starting }` while opening, or the open capture. */
  let mic = null;
  let retry = false;

  /**
   * Reports the inputs to the World and returns the capture's target: `deviceId` is the chosen device,
   * or '' for the system default, and `key` changes when the input behind the target changes.
   * Undefined when the inputs cannot be read or, before microphone access, told apart.
   */
  async function reportDevices() {
    try {
      const inputs = (await media.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      // before microphone access is granted the entries have an empty deviceId
      const list = inputs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
      send({ t: 'devices', list: list.map((d) => ({ id: d.deviceId, label: d.label })) });
      if (!inputs.some((d) => d.deviceId)) return undefined;
      if (prefs.micDevice && list.some((d) => d.deviceId === prefs.micDevice)) return { deviceId: prefs.micDevice, key: prefs.micDevice };
      // Chromium's 'default' entry keeps its deviceId when the input behind it changes
      const input = inputs.find((d) => d.deviceId === 'default') ?? inputs[0];
      return { deviceId: '', key: JSON.stringify([input.deviceId, input.groupId, input.label]) };
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  async function start() {
    if (mic) return;
    retry = false;
    const opening = mic = { starting: true };
    // 拿到一半就失败时也要停麦关声卡,否则录音指示灯常亮到页面刷新
    let stream = null, ctx = null;
    try {
      // read before opening: a report after it may already see the next default
      const target = await reportDevices();
      if (mic !== opening) return;
      // AGC can change the system microphone volume on Windows.
      const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false };
      // inputs that cannot be told apart yet: the chosen device is asked for by its id
      const deviceId = target ? target.deviceId : prefs.micDevice;
      if (deviceId) audio.deviceId = { exact: deviceId };
      stream = await media.getUserMedia({ audio });
      ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.audioWorklet.addModule('/web/mic-worklet.js');
      // closed, or closed and opened again, while this one was opening
      if (mic !== opening) { stream.getTracks().forEach((t) => t.stop()); ctx.close(); return; }
      const node = new AudioWorkletNode(ctx, 'pet-mic');
      const active = mic = { stream, ctx, node, deviceId, key: target?.key };
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
      // the labels are readable now; a change while opening may have moved the target away from this capture
      void follow();
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

  /** Reopens the capture when its target is no longer the input it opened on. */
  async function follow() {
    const current = mic;
    const target = await reportDevices();
    if (mic !== current || target === undefined) return;
    // opened before the inputs could be told apart: it is on the target when it asked for the same device
    if (current.key === undefined && target.deviceId === current.deviceId) { current.key = target.key; return; }
    if (target.key !== current.key) {
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
    else if (!mic.starting) void follow();
  });

  return { start, stop };
}
