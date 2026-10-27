/* 语音链路联调用的「假麦克风」：在页面任何脚本之前装上。
 *
 * 把 getUserMedia 的结果换成一端 AudioContext 里播放的测试音频（/__coo/test/*.wav），
 * 这样页面自己的 AudioWorklet 采集、WebSocket 送帧、World 的切句与 ASR 全都走真代码，
 * 唯一被替换的是"声音从哪来"。CDP 里调 window.__cooPlay() 才开始播。
 */
(() => {
  if (window.__cooFakeMic) return;
  window.__cooFakeMic = true;
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    try {
      const res = await fetch('/__coo/test/mic-test.wav');
      if (!res.ok) throw new Error('test wav HTTP ' + res.status);
      const bytes = await res.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 16000 });
      const buffer = await ctx.decodeAudioData(bytes);
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(dest);
      window.__cooTest = { ctx, src, dest, seconds: buffer.duration };
      window.__cooPlay = (delay = 0) => {
        try {
          src.start(ctx.currentTime + delay);
          return true;
        } catch (err) {
          console.warn('__cooPlay:', err && err.message);
          return false;
        }
      };
      return dest.stream;
    } catch (err) {
      console.warn('假麦克风失败，回落到真麦克风:', err && err.message);
      return orig(constraints);
    }
  };
})();