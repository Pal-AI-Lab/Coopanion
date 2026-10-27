/* 点她的身体 → 按住她的身体说话（平板/手机，无按钮）
 *
 * 手势：点一下她（0～1 秒内）再按住她的身体 → 按下即开闸开始听，松手关闸。
 *
 * 为什么必须"先点一下"：她的身体画在 sandbox 过的 /figure-frame iframe 里，父页面拿不到
 * contentDocument、也收不到里面的指针事件。她"被戳到了"的唯一可靠信号，是页面自己发给
 * World 的 {"t":"touch","kind":"poke"}，而这条消息是在**抬手**那一刻发出的（实测 ~8ms）。
 * 所以：poke = 确认刚才那一下点的是她，同时顺手把她的 WebSocket 实例记下来；随后 1 秒内
 * 的按下就直接 socket.send({"t":"gate","open":true})，松手 open:false。
 *
 * 窗口只有 ARM_MS：点了她之后超过 1 秒不按，就当误触作废（不会一直开着麦克风）。
 */
(function cooTapTalk() {
  if (window.__cooTapTalk) return;

  const ARM_MS = 1000; // 点完 1 秒内按住才算

  let pressed = false; // 有没有手指按在页面上
  let holding = false; // 这一次已经开闸，正在听
  let waiting = false; // 按下了，还在等「开始说话」的延迟
  let holdTimer = 0;
  let armedUntil = 0; // 待说话截止时间
  let sock = null;

  /* ---- 一、胶囊整条藏掉；只有「电脑在当家 · 点我接管」那一态还留着 ---- */
  const style = document.createElement('style');
  style.id = 'coo-tap-talk-style';
  style.textContent = [
    '#coo-talk{display:none!important}',
    'html #coo-talk.watching{display:flex!important}',
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  function sendGate(open) {
    try {
      if (!sock || sock.readyState !== 1) return false;
      sock.send(JSON.stringify({ t: 'gate', open: open }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function startHold() {
    if (holding || waiting) return;
    armedUntil = 0; // 这一次用掉了，别让同一窗口里第二次按下重复开闸
    // 「按住到开始收音」的延迟：手指还没停稳就开麦，会把拖动/滑动的摩擦声当成一句话。
    // 延迟里松开或挪过头（拖动），这次就作废 —— 两个参数都可以在面板里自由调。
    const delay = Math.max(0, Number(window.CooHoldDelay) || 0);
    if (!delay) {
      holding = true;
      sendGate(true);
      return;
    }
    waiting = true;
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      waiting = false;
      if (pressed && !dragging) {
        holding = true;
        sendGate(true);
      }
    }, delay);
  }

  /** 取消「等待开麦」和已经开的闸（拖动、松手、越界都用它）。 */
  function stopHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    waiting = false;
    if (!holding) return;
    holding = false;
    sendGate(false);
  }

  /* ---- 二、poke = 刚点到了她：记 socket、开 1 秒窗口 ---- */
  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function cooTapTalkSend(data) {
    try {
      if (typeof data === 'string' && data.indexOf('"t":"touch"') !== -1) {
        sock = this;
        armedUntil = Date.now() + ARM_MS;
        if (pressed) startHold(); // 按着的时候才抬手，说明这就是一次按住
      }
    } catch (_) {
      /* 非文本帧照常放行 */
    }
    return origSend.apply(this, arguments);
  };

  /* ---- 三、按下/松手 ---- */
  let downX = 0, downY = 0, dragging = false;

  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('#coo-talk')) return;
      if (t && t.closest && t.closest('button,.tool,.stage-mode')) return;
      pressed = true;
      downX = e.clientX;
      downY = e.clientY;
      dragging = false;
      if (Date.now() < armedUntil) startHold();
    },
    true,
  );

  /**
   * 按住她说话时手指一挪，就变成"拖着玩"了 —— 这时候继续收音是误触（用户抱怨过：
   * 想把她挪个位置，结果麦克风开了、说了一句废话）。所以位移超过阈值就当场把这次收音取消，
   * 之后哪怕手还没松也不会再开。
   *
   * 阈值单位是 CSS px（=dp），由宿主推 `window.CooDragCancel`，面板里可调。
   */
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!pressed || dragging) return;
      if (!holding && !waiting) return;
      const limit = Math.max(8, Number(window.CooDragCancel) || 40);
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < limit) return;
      dragging = true;
      stopHold(); // 还没开麦的就别开了，已经开的立刻关掉
      try {
        document.dispatchEvent(new CustomEvent('coo-talk-cancelled', { detail: { dragging: true } }));
      } catch (_) {
        /* 老 WebView 不支持 CustomEvent 构造也无所谓，收音已经关了 */
      }
    },
    true,
  );

  function endPress() {
    pressed = false;
    // 注意：这里**不能**清 armedUntil。poke 是抬手后才到的，页面的 pointerup 往往比它早，
    // 一旦在这里清零，紧接着那一下按住就会被判成"没点过她"——就是用户遇到的"按住没反应"。
    // 窗口交给 ARM_MS 自然过期。
    stopHold(); // 松手：等着的取消，开着的关掉
  }
  document.addEventListener('pointerup', endPress, true);
  document.addEventListener('pointercancel', endPress, true);

  window.__cooTapTalk = {
    get pressed() { return pressed; },
    get holding() { return holding; },
    get armed() { return Date.now() < armedUntil; },
    get hasSock() { return !!sock; },
  };
})();