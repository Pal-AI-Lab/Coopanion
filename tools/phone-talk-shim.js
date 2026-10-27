/* Coo Mobile：手机/平板上的语音入口
 *
 * 桌面版靠全局热键（默认左 Alt）开收音；手机没有键盘，所以这个脚本在页面上放一个按钮：
 *  - 手机是"真正的 pet"时：按住说话，按下/松开给 World 发 {t:'gate', open}，
 *    World 侧走的是和热键完全相同的 setTalking() 路径（开闸 → 收音频帧 → 松开 flush →
 *    转写 → 交给 bot）。
 *  - 电脑上的桌宠窗正连着时：协议规定 window 优先，手机只能是"旁观者"，音频和 gate 都会被
 *    服务器丢掉。按钮此时变成"电脑在当家 · 点我接管"：调 PC 反代的
 *    /__coo/petwindow/yield 让那个窗口让位（记下它的命令行，随时可还原），然后重载页面，
 *    手机就连成了真正的 pet。
 *
 * 注入方式：PC 侧 tools/lan-proxy.py 在响应 /web/pet-app.js 时，如果请求带
 * `X-Coo-Mobile: 1`（手机本机反代会加），就把本文件追加到那个模块末尾。
 * 追加进的是**模块作用域**，所以能直接用页面自己的 send()/ws，不用改 Coopanion 任何前端文件。
 */
(function cooMobileTalk() {
  if (window.__cooMobileTalk) return;
  window.__cooMobileTalk = true;

  let held = false;
  let blocked = false; // 由页面自己的 watching 变量驱动：电脑上的桌宠窗在当家
  const btn = document.createElement('button');
  btn.id = 'coo-talk';
  btn.type = 'button';
  btn.textContent = '按住说话';

  const gate = (open) => {
    try {
      send({ t: 'gate', open });
    } catch (err) {
      console.error('Coo Mobile gate 发送失败:', err);
    }
  };

  function paint() {
    btn.classList.toggle('watching', blocked);
    btn.textContent = blocked ? '电脑在当家 · 点我接管' : held ? '松开发送' : '按住说话';
  }

  async function takeOver() {
    btn.disabled = true;
    btn.textContent = '正在让电脑让位…';
    try {
      const res = await fetch('/__coo/petwindow/yield');
      const body = await res.json();
      console.log('Coo Mobile 接管:', JSON.stringify(body));
    } catch (err) {
      console.error('Coo Mobile 接管失败:', err);
    }
    // 让位后重连：此时不再有 window 连接，手机就被接受为真正的 pet
    setTimeout(() => location.reload(), 600);
  }

  function press() {
    if (blocked) return;
    if (held) return;
    held = true;
    btn.classList.add('on');
    paint();
    gate(true);
  }

  function release() {
    if (!held) return;
    held = false;
    btn.classList.remove('on');
    paint();
    gate(false);
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    if (blocked) {
      void takeOver();
      return;
    }
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (_) {
      /* 有的 WebView 不给捕获，靠 pointerup 也能收尾 */
    }
    press();
  });
  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    release();
  });
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());

  const style = document.createElement('style');
  style.textContent = [
    '#coo-talk{position:fixed;left:50%;transform:translateX(-50%);bottom:104px;z-index:9999;',
    'min-width:152px;padding:13px 26px;border-radius:999px;border:1px solid rgba(255,255,255,.28);',
    'background:rgba(18,22,34,.74);color:#eaf2ff;font:600 17px/1 system-ui,-apple-system,"Noto Sans SC",sans-serif;',
    'backdrop-filter:blur(8px);box-shadow:0 6px 24px rgba(0,0,0,.35);touch-action:none;',
    'user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}',
    '#coo-talk.on{background:rgba(56,132,255,.88);border-color:rgba(255,255,255,.6);transform:translateX(-50%) scale(1.04)}',
    '#coo-talk.watching{background:rgba(122,86,20,.82);border-color:rgba(255,208,120,.55);font-size:15px;min-width:190px}',
    'html[data-coo-overlay] #coo-talk{bottom:auto;top:12px;min-width:116px;padding:10px 18px;font-size:15px;opacity:.86}',
  ].join('');
  document.head.appendChild(style);
  document.body.appendChild(btn);

  // 页面自己的 `watching` 变量就是权威状态（服务端接受为 pet 后它为 false）。
  // 不能只听那一帧：页面在模块初始化末尾才挂监听，帧可能早到了。
  const sync = () => {
    let now = false;
    try {
      now = !!watching;
    } catch (_) {
      now = false;
    }
    if (now !== blocked) {
      blocked = now;
      paint();
    }
  };
  sync();
  setInterval(sync, 500);

  paint();

  /** 诊断入口：window.__cooTalk(true/false) 直接开关闸门（CDP 联调用）。 */
  window.__cooTalk = gate;
  /**
   * 诊断入口（联调语音链路用）：把页面自己的模块内部句柄露出来，
   * 这样用 CDP 就能换掉麦克风音源、手动重开麦，而不必改 Coopanion 的前端。
   */
  window.__cooDbg = {
    send,
    prefs,
    startMic,
    stopMic,
    mic: () => mic,
    ws: () => ws,
    listen: () => listen,
    watching: () => watching, // 页面自己的状态：true = 手机只是旁观者
  };
})();