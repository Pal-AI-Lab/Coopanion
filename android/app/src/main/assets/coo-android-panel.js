/* Coo Mobile：面板（17788）的安卓改造
 *
 * 1) 桌宠 tab 里摘掉 PC 专属的两行（桌宠窗口 / 窗口运行时），换成安卓真能用的设置；
 *    只在这个 tab 里插 —— 面板每个 tab 共用一个 .sheetbody，判断依据是这一页有没有
 *    .mountrow（只有"桌宠"页才有那两行挂载项）。
 * 2) 「习惯」是**独立一页**：在左侧栏加一项，点进去是整页，
 *    不再是桌宠 tab 底部的一坨。内容是上游文案里那套「习惯」——
 *    她能自己改哪些设置（selfAdjustCustom.*）、哪些互动会马上唤醒她（touch.wakeKinds）、帧率。
 * 3) 新增「系统语音」：用手机自带 TTS 念她说的话（开关 / 语速 / 音高 / 试听）。
 * 4) 大小 / 拖动距离 / 开始收音的延迟 / 语速音高都是**自由输入**，没有挡位。
 */
(function cooAndroidPanel() {
  if (window.__cooAndroidPanel) return;
  window.__cooAndroidPanel = true;

  var A = window.CooAndroid;
  if (!A) return;

  var GROUP = 'world:desktop-pet';
  var K = 'worlds.desktop-pet.';
  var SELF_KEYS = [
    ['figure', '形象'], ['scheme', '配色'], ['roam', '走动'], ['snoreSeconds', '打呼时长'],
    ['sound', '音效'], ['scale', '大小'], ['bubbleSize', '气泡尺寸'], ['fontSize', '字号'],
    ['theme', '夜间模式'], ['hoverButtons', '悬停按钮'], ['user', '称呼']
  ];
  var TOUCH_KINDS = [['poke', '戳一下'], ['pet', '摸'], ['throw', '甩出去'], ['drop', '放下']];

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function btn(label, primary, onClick) {
    var b = mk('button', 'btn sm' + (primary ? ' primary' : ''), label);
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); onClick(); });
    return b;
  }
  function num(v, min, max, step, onChange) {
    var i = mk('input');
    i.type = 'number';
    i.value = v;
    i.min = min; i.max = max; i.step = step;
    i.style.cssText = 'width:5.6em;text-align:right;padding:2px 4px;margin-right:6px';
    i.addEventListener('change', function () {
      var x = parseFloat(i.value);
      if (isFinite(x)) onChange(x);
    });
    return i;
  }
  /** 文本输入：改完（失焦或回车）才提交，不绑逐字输入——config 每敲一个字写一次太重。 */
  function text(value, maxLength, placeholder, onCommit) {
    var i = mk('input');
    i.type = 'text';
    i.value = value || '';
    i.placeholder = placeholder || '';
    i.maxLength = maxLength || 32;
    i.style.cssText = 'width:9em;padding:4px 8px;margin-right:6px;border:1px solid var(--border,#3c4048);'
      + 'border-radius:8px;background:var(--card,transparent);color:inherit;font:inherit';
    var last = i.value;
    i.addEventListener('change', function () {
      var v = i.value.trim();
      if (v !== last) { last = v; onCommit(v); }
    });
    i.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') i.blur(); });
    return i;
  }
  function row(id, name, detail) {
    var r = mk('div', 'mountrow');
    r.setAttribute('data-coo-android', id);
    var st = mk('span', 'mstate', '');
    var acts = mk('span', 'macts');
    r.append(mk('span', 'navdot ok'), mk('span', 'mname', name), st, mk('span', 'mdetail', detail || ''), acts);
    r.style.cssText = 'flex-wrap:wrap';
    return { row: r, state: st, acts: acts };
  }

  /* 习惯页几个下拉的中文标签：行尾状态用它，改完立刻能看见。 */
  var MODE_LABEL = { off: '禁止', default: '默认', any: '任意', custom: '自定义' };
  var WAKE_LABEL = { none: '都不', poke: '只有戳', all: '所有互动', custom: '按勾选' };
  var FPS_LABEL = { '60': '60', '120': '120', '144': '144', '0': '不限' };
  function syncState(r, map, v) { if (r && r.state) r.state.textContent = map[v] || v; }
  function check(text, checked, onChange) {
    var lab = mk('label');
    lab.style.cssText = 'display:inline-flex;align-items:center;gap:5px;cursor:pointer;margin:2px 10px 2px 0';
    var cb = mk('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.addEventListener('change', function () { onChange(cb.checked); });
    lab.append(cb, mk('span', null, text));
    return lab;
  }
  function select(options, value, onChange) {
    var s = mk('select');
    s.style.cssText = 'padding:2px 6px';
    options.forEach(function (o) {
      var op = mk('option', null, o[1]);
      op.value = o[0];
      s.appendChild(op);
    });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }
  function state() {
    try { var raw = A.state(); return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  }
  function readHabits() {
    try { var raw = A.habitState(); return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  }
  /** group 缺省写 desktop-pet 那组；displayName 这类顶层键属于 core 组，得单独指定。 */
  function save(values, group) {
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ group: group || GROUP, values: values })
    }).catch(function (err) { console.error('coo habit save', err); });
  }
  function ttsStatus() {
    try { var raw = A.ttsStatus(); return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  }

  var rows = null;
  var habitPage = null;
  var habitNav = null;
  var hc = null;   // habit 控件引用

  /* ---------- 窄屏 / 竖屏：侧栏搬到底部 ---------- */
  /**
   * 面板的侧栏是 PC 那套：宽屏竖着站左边（262px），窄屏上游自己那条 @media(≤720px) 更糟 ——
   * `#rail{width:100%;position:sticky;top:0}` 把它压成贴顶的一条横滚，还挡住页头，手指够不着。
   *
   * 而且竖屏平板根本不吃那条媒体查询：777×1164 的屏，宽度 777 > 720，
   * 于是整条 262px 的侧栏横在竖屏左边，白吃掉三分之一屏宽，内容只剩 500 出头。
   *
   * 所以这里不管上游怎么写，自己钉一套：
   *   窄屏（<700px）或竖屏 → 侧栏贴到屏幕最下沿，导航项横排、可横滚，内容区在上面铺满；
   *   横屏且宽（≥700px）→ 一条都不写，保持原来的左侧栏。
   * 全都带 !important：上游的 @media 块和 companion.css 里都写死了 #rail 的 position / width，
   * 我们的 <style> 虽然后插，光靠选择器优先级压不住它们。
   */
  var NAV_CSS = [
    '@media (max-width: 700px), (orientation: portrait) {',
    // 竖排：内容在上，导航贴底；body 留出导航的高度，否则最后一屏内容被压在栏底下
    '  body { flex-direction: column !important; overflow: hidden !important;',
    '    padding-left: 0 !important; padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)) !important; }',
    // 侧栏整块搬到底部：定宽 262 换成整行，原来是左侧切片的边框改成上边框
    '  #rail { position: fixed !important; left: 0 !important; right: 0 !important; bottom: 0 !important; top: auto !important;',
    '    width: 100% !important; height: auto !important; max-height: none !important; flex: none !important;',
    '    z-index: 100 !important; border: 0 !important; border-top: 1px solid var(--border, #e3e4e3) !important;',
    '    background: var(--paper-2, #ecedec) !important; box-shadow: 0 -6px 20px rgba(0,0,0,.07) !important;',
    '    transition: none !important; }',
    '  #rail.is-collapsed { width: 100% !important; }',   // 折叠是桌面才有的概念，窄屏一律摊开
    // 侧栏内部也横过来：导航占满，最右边留一个「基础/高级」模式键（竖排时它藏在脚注上方，
    // 横排以后没有脚注可依，塞在行尾最省地方，又不会让人找不到它）
    '  #rail { display: flex !important; flex-direction: row !important; align-items: stretch !important; }',
    // 底下这排不放 brand / 头像脚注 / 分组标题，只留导航项和模式键
    '  #rail .brand, #rail .railfoot, #rail .stacklabel,',
    '  #rail .companion-sidebar-toggle, .companion-sidebar-backdrop { display: none !important; }',
    '  #rail .companion-mode, #rail.is-collapsed .companion-mode { display: flex !important; align-items: center !important;',
    '    flex: none !important; height: 44px !important; min-height: 44px !important; opacity: 1 !important;',
    '    margin: 6px 8px 6px 0 !important; padding: 0 12px !important; gap: 6px !important; border-radius: 10px !important; }',
    '  #rail .companion-mode .lbl { font-size: 13px !important; opacity: 1 !important; visibility: visible !important; }',
    // 竖排的 nav.stack 转成横排：一行横滚，滚动条藏掉，上游那两道 mask 渐变也去掉（横滚时会糊掉两头）
    '  #rail nav.stack { display: flex !important; flex-direction: row !important; align-items: stretch !important;',
    '    flex: 1 1 auto !important; min-width: 0 !important; gap: 4px !important; padding: 6px 8px !important;',
    '    overflow-x: auto !important; overflow-y: hidden !important; -webkit-overflow-scrolling: touch;',
    '    scrollbar-width: none; mask-image: none !important; -webkit-mask-image: none !important; }',
    '  #rail nav.stack::-webkit-scrollbar { display: none; }',
    // 上游每个一级项各占一个 navgroup，横排时这些 group 也横过去，别竖着叠
    '  #rail .navgroup { display: flex !important; flex-direction: row !important;',
    '    gap: 4px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; }',
    // 44px 高是手指按得住的下限；图标照留，字不换行
    '  #rail .navitem { flex: none !important; min-height: 44px !important;',
    '    padding: 6px 12px !important; gap: 7px !important; border-radius: 10px !important; white-space: nowrap; }',
    '  #rail .navitem .lbl { font-size: 13.5px !important; }',
    '  #rail .navitem.active::after { display: none !important; }',   // 左边那条竖线是竖排侧栏的语言，横排里改成底色
    '  #kernel-root { flex: 1 1 auto !important; height: auto !important; min-height: 0 !important; }',
    '  .scroll { padding-left: 16px !important; padding-right: 16px !important; }',
    '}',
  ].join('\n');

  /** 挂一次就够（按 id 幂等）；面板重渲染后 head 还在，不用重挂。 */
  function ensureMobileNav() {
    if (document.getElementById('coo-mobile-nav')) return;
    var st = mk('style');
    st.id = 'coo-mobile-nav';
    st.textContent = NAV_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 安卓设置（桌宠 tab） ---------- */
  function buildAndroid(body) {
    var overlay = row('overlay', '悬浮桌宠', '她站在桌面最上层，只有她身上会接住点击');
    var scale = row('scale', '桌宠大小', '1% 一级，直接填数字；改完立刻生效');
    var range = row('range', '活动范围', '她只在这段屏幕里走动，横屏/竖屏各存一份');
    var cua = row('cua', 'CUA 接头', '看屏幕 / 点击类插件靠它工作（安卓无障碍授权）');
    var live = row('live', '实时看屏幕', '授权一次，屏幕画面持续抓（约 8 帧/秒）；她每看一眼都是当下的画面，不用等系统慢慢截');
    var keepon = row('keepon', '屏幕别灭', '屏幕一黑投屏就断（系统规定，改不了）。想连着看很久就开这个，代价是更耗电');
    var hold = row('hold', '按住说话', '两个都能自由填：拖动超过多少就不算说话；按住多久才开始收音');
    var frag = document.createDocumentFragment();
    // 顺序：悬浮桌宠 → 大小 → 范围 → CUA → 实时看屏幕 → 屏幕别灭 → 按住说话
    [overlay, scale, range, cua, live, keepon, hold].forEach(function (r) { frag.appendChild(r.row); });
    var anchor = body.querySelector('.mountrow:not([data-coo-android])') || body.firstChild;
    body.insertBefore(frag, anchor);
    rows = { overlay: overlay, scale: scale, range: range, cua: cua, live: live, keepon: keepon, hold: hold };
  }

  /* ---------- 「习惯」独立页 ---------- */
  function buildHabitPage() {
    // 和面板其他栏同一套外壳：视图容器 → providerchrome（标题头）→ panelslot > sheet > sheetbody。
    // 之前是 absolute 覆盖整屏 + 插在隐藏容器里，点它像"跳出到另一个页面"，跟旁边的栏完全不连。
    var view = mk('div');
    view.id = 'coo-habit-page';
    view.setAttribute('data-coo-android', 'habit-page');
    view.style.cssText = 'display:none;flex-direction:column;width:100%;height:100%;min-height:0';

    var chrome = mk('div', 'providerchrome');
    var head = mk('header', 'featureintro providerintro');
    var title = mk('h1', null, '习惯');
    var sub = mk('p', null, '她能不能自己改设置、哪些互动马上回应、画多快、说话用什么声音');
    head.append(title, sub);
    chrome.appendChild(head);

    var slot = mk('div', 'panelslot');
    var sheet = mk('div', 'sheet tabbed');
    var host = mk('div', 'sheetbody');
    sheet.appendChild(host);
    slot.appendChild(sheet);
    view.append(chrome, slot);

    /* 0. 称呼：她怎么叫你。存在 desktop-pet 组的 user 键，跟 PC 版设置页同一个位置。 */
    var rUser = row('h-user', '称呼', 'Coo 会用这个名字称呼你');
    var userIn = text('', 24, '老大', function (v) { save({ [K + 'user']: v }); });
    rUser.acts.appendChild(userIn);

    /* 0b. 她的名字：displayName 是顶层键，归 core 组，不能走 desktop-pet 那组。 */
    var rBot = row('h-botname', 'Coo 的名字', '桌宠菜单、对话页和气泡里的提问用这个名字称呼 Coo');
    var botIn = text('', 24, 'Coo', function (v) { save({ displayName: v }, 'core'); });
    rBot.acts.appendChild(botIn);

    /* 1. 自主配置权限 */
    var rMode = row('h-mode', '自主配置权限', '禁止 / 默认（小事直接改）/ 任意 / 自定义（按下面勾的来）');
    var modeSel = select(
      [['off', '禁止（她不能自己改）'], ['default', '默认（小事直接改）'], ['any', '任意（都能直接改）'], ['custom', '自定义（按下面勾的来）']],
      'default',
      function (v) { save({ [K + 'selfAdjust']: v }); syncState(rMode, MODE_LABEL, v); }
    );
    rMode.acts.appendChild(modeSel);
    syncState(rMode, MODE_LABEL, 'default');

    /* 2. 逐项勾选 */
    var rKeys = row('h-keys', '她能自己改的项', '选「自定义」时，只有勾上的项她能自己动，其余会先问你');
    var keysWrap = mk('span');
    keysWrap.style.cssText = 'display:flex;flex-wrap:wrap;width:100%;margin-top:4px';
    var keyBoxes = [];
    SELF_KEYS.forEach(function (pair) {
      var cb = check(pair[1], false, function (on) {
        var v = {}; v[K + 'selfAdjustCustom.' + pair[0]] = on; save(v);
      });
      keyBoxes.push(cb.querySelector('input'));
      keysWrap.appendChild(cb);
    });
    rKeys.acts.appendChild(keysWrap);

    /* 3. 互动唤醒 */
    var rWake = row('h-wake', '马上回应哪些互动', '她正忙时，哪几种互动值得立刻打断她（其余等她空下来一起看）');
    var wakeSel = select(
      [['none', '都不（等下次一起）'], ['poke', '只有戳'], ['all', '所有互动'], ['custom', '按下面勾的']],
      'all',
      function (v) { save({ [K + 'touch.wakeOn']: v }); syncState(rWake, WAKE_LABEL, v); }
    );
    rWake.acts.appendChild(wakeSel);
    syncState(rWake, WAKE_LABEL, 'all');
    var wakeWrap = mk('span');
    wakeWrap.style.cssText = 'display:flex;flex-wrap:wrap;width:100%;margin-top:4px';
    var wakeBoxes = [];
    TOUCH_KINDS.forEach(function (pair, i) {
      var cb = check(pair[1], false, function () {
        var kinds = [];
        wakeBoxes.forEach(function (b, k) { if (b.checked) kinds.push(TOUCH_KINDS[k][0]); });
        var v = {};
        v[K + 'touch.wakeKinds'] = kinds.join(',');   // core 把数组当坐标对，必须给字符串
        if (wakeSel.value !== 'custom') { v[K + 'touch.wakeOn'] = 'custom'; wakeSel.value = 'custom'; }
        save(v);
      });
      wakeBoxes.push(cb.querySelector('input'));
      wakeWrap.appendChild(cb);
    });
    rWake.acts.appendChild(wakeWrap);

    /* 4. 帧率 */
    var rFps = row('h-fps', '帧率', '画得多快；「不限」= 跟着屏幕刷新率走');
    var fpsSel = select([['60', '60'], ['120', '120'], ['144', '144'], ['0', '不限（跟屏幕）']], '60',
      function (v) { save({ [K + 'window.frameRate']: parseInt(v, 10) }); syncState(rFps, FPS_LABEL, v); });
    rFps.acts.appendChild(fpsSel);
    syncState(rFps, FPS_LABEL, '60');

    /* 5~8. 系统语音 */
    var rTts = row('h-tts', '系统语音', '用手机自己的 TTS 念她说的话；关掉就只有气泡、没有声音');
    var ttsOn = check('开', true, function (on) {
      var st = ttsStatus() || {};
      A.ttsSet(on, st.rate || 1, st.pitch || 1);
      refreshTts();
    });
    rTts.acts.appendChild(ttsOn);

    var rRate = row('h-rate', '语音语速', '0.5× 最慢、2.5× 最快，1× 正常；直接填数字');
    var rateIn = num(1, 0.5, 2.5, 0.05, function (v) {
      var st = ttsStatus() || {};
      A.ttsSet(st.enabled !== false, v, st.pitch || 1);
      refreshTts();
    });
    rRate.acts.appendChild(rateIn);

    var rPitch = row('h-pitch', '语音音高', '调低更沉、调高更尖；直接填数字');
    var pitchIn = num(1, 0.5, 2.5, 0.05, function (v) {
      var st = ttsStatus() || {};
      A.ttsSet(st.enabled !== false, st.rate || 1, v);
      refreshTts();
    });
    rPitch.acts.appendChild(pitchIn);

    var rTest = row('h-test', '试听', '改完点一下，直接念一句，不用等她说话');
    rTest.acts.append(
      btn('念一句', true, function () { if (A.ttsSay) A.ttsSay('我是库，声音就是这样，你听着合适就留着。'); }),
      btn('停下', false, function () { if (A.ttsStop) A.ttsStop(); })
    );

    host.append(rUser.row, rBot.row, rMode.row, rKeys.row, rWake.row, rFps.row, rTts.row, rRate.row, rPitch.row, rTest.row);

    hc = {
      modeSel: modeSel, keyBoxes: keyBoxes, wakeSel: wakeSel, wakeBoxes: wakeBoxes, fpsSel: fpsSel,
      modeRow: rMode, wakeRow: rWake, fpsRow: rFps,
      userIn: userIn, botIn: botIn,
      ttsOn: ttsOn.querySelector('input'), rowState: rTts.state, rateIn: rateIn, pitchIn: pitchIn
    };
    return view;
  }

  /** 侧栏加一项「习惯」：放在「桌宠」后面，点它是整页，不参与面板自己的路由。 */
  function ensureHabitNav() {
    if (document.querySelector('a.navitem[data-coo-habit]')) {
      habitNav = document.querySelector('a.navitem[data-coo-habit]');
      return;
    }
    var any = document.querySelector('a.navitem');
    if (!any) return;
    var stack = any.parentElement;          // nav.stack 里的第一个 .navgroup
    var petNav = null;
    var all = document.querySelectorAll('a.navitem');
    for (var i = 0; i < all.length; i++) {
      var href = all[i].getAttribute('href') || '';
      if (href.indexOf('desktop-pet') >= 0 || all[i].textContent.trim() === '桌宠') { petNav = all[i]; break; }
    }
    var a = mk('a', 'navitem', '习惯');
    a.href = '#/habit';
    a.setAttribute('data-coo-habit', '1');
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      showHabit(true);
    });
    if (petNav && petNav.parentElement) petNav.after(a);
    else stack.appendChild(a);
    habitNav = a;
  }

  /* 面板靠切 display 换视图；我们这页就是并列的一个视图，进来时把别人藏起来 */
  var hidViews = [];

  function showHabit(on) {
    var root = document.querySelector('#kernel-root');
    if (!root) return;
    if (on) {
      // 已经在这页就别重跑：重跑会把 hidViews 清空（别人本来就是 none 了），
      // 之后再切走就没有能还原的东西了
      if (habitPage && habitPage.style.display === 'flex') {
        fillHabit();
        refreshTts();
        return;
      }
      if (!habitPage) habitPage = buildHabitPage();
      if (habitPage.parentElement !== root) root.appendChild(habitPage);
      // 记住其他视图原来的 display（面板自己会写成 flex/none），退出时照原样还回去
      hidViews = [];
      for (var i = 0; i < root.children.length; i++) {
        var el = root.children[i];
        if (el === habitPage) continue;
        // 只压当前真在显示的那个；本来就藏着的别记也别动，免得还原时跟面板打架
        if (getComputedStyle(el).display === 'none') continue;
        hidViews.push([el, el.style.display]);
        el.style.display = 'none';
      }
      habitPage.style.display = 'flex';
      var all = document.querySelectorAll('a.navitem');
      for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', all[j] === habitNav);
      fillHabit();
      refreshTts();
      if (location.hash !== '#/habit') history.replaceState(null, '', '#/habit');
    } else if (habitPage) {
      habitPage.style.display = 'none';
      // 这个 active 是我们自己加的，面板并不知道 —— 切走必须摘掉，
      // 否则点别的分类时「习惯」会一直亮着，看着像还停在那页
      if (habitNav) habitNav.classList.remove('active');
      for (var k = 0; k < hidViews.length; k++) {
        var v = hidViews[k][0], orig = hidViews[k][1];
        // 原来有 inline 值就还那个值；原来是空的就删掉 inline ——
        // 面板自己的显示/隐藏很可能是靠 class 的，写死 none 会把它压住（实测会白屏）
        if (orig) v.style.display = orig; else v.style.removeProperty('display');
      }
      hidViews = [];
    }
  }

  /* 点别的导航项就让开 —— 面板自己的路由会把视图换掉，我们这页必须跟着退场 */
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a.navitem') : null;
    if (!a) return;
    if (a.hasAttribute('data-coo-habit')) return;
    showHabit(false);
  }, true);

  /* 称呼和她的名字都不在 habitState（那是 Android 侧偏好），只能问 core 的 /api/config：
     一个在 desktop-pet 组，一个在 core 组。拿不到就留空，用户填了照样能存。 */
  function loadNames() {
    if (!hc || !hc.userIn || !hc.botIn) return;
    fetch('/api/config', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var gs = (d && d.groups) || [];
        for (var i = 0; i < gs.length; i++) {
          var g = gs[i], id = g.group && g.group.id, vals = g.values || {};
          if (id === GROUP && typeof vals[K + 'user'] === 'string') hc.userIn.value = vals[K + 'user'];
          if (id === 'core' && typeof vals.displayName === 'string') hc.botIn.value = vals.displayName;
        }
      })
      .catch(function () {});
  }

  /* 从 config.json 读回来的值填到控件上 */
  function fillHabit() {
    if (!hc) return;
    loadNames();
    var h = readHabits();
    if (!h) return;
    if (h.selfAdjust) hc.modeSel.value = h.selfAdjust;
    if (h.wakeOn) hc.wakeSel.value = h.wakeOn;
    SELF_KEYS.forEach(function (pair, i) {
      var cb = hc.keyBoxes[i];
      if (cb) cb.checked = !!(h.custom && h.custom[pair[0]] === true);
    });
    // wakeKinds 可能是字符串（"poke,pet"）也可能是数组（老配置），两种都认
    var kinds = h.wakeKinds;
    if (typeof kinds === 'string') kinds = kinds.split(',').map(function (s) { return s.trim(); });
    if (!Array.isArray(kinds)) kinds = [];
    TOUCH_KINDS.forEach(function (pair, i) {
      var cb = hc.wakeBoxes[i];
      if (cb) cb.checked = kinds.indexOf(pair[0]) >= 0;
    });
    if (h.frameRate !== undefined && hc.fpsSel) hc.fpsSel.value = String(h.frameRate);
    syncState(hc.modeRow, MODE_LABEL, hc.modeSel.value);
    syncState(hc.wakeRow, WAKE_LABEL, hc.wakeSel.value);
    if (hc.fpsSel) syncState(hc.fpsRow, FPS_LABEL, hc.fpsSel.value);
  }

  function refreshTts() {
    if (!hc) return;
    var st = ttsStatus();
    if (!st) return;
    hc.ttsOn.checked = st.enabled !== false;
    hc.rowState.textContent = (st.enabled === false ? '关着' : '开着') + ' · ' +
      (st.ready ? ('引擎：' + (st.engine || '系统自带')) : ('不可用：' + (st.error || '引擎未就绪')));
    if (document.activeElement !== hc.rateIn) hc.rateIn.value = Number(st.rate || 1).toFixed(2);
    if (document.activeElement !== hc.pitchIn) hc.pitchIn.value = Number(st.pitch || 1).toFixed(2);
  }

  /* ---------- 实时看屏幕（MediaProjection）---------- */

  var liveTimer = null;

  /**
   * 「实时看屏幕」那一行。
   *
   * 开着的时候显示真实帧率和已抓帧数，每 2 秒自己刷一次（只改数字，不重建按钮，免得闪）；
   * 没开就给个「开启」，点了弹系统授权框 —— 只有用户本人点同意，屏幕才会被投放。
   */
  function refreshLiveRow() {
    if (!rows || !rows.live) return;
    var st = {};
    try { st = JSON.parse(A.screenStatus() || '{}') || {}; } catch (e) { st = {}; }
    var running = !!st.running;
    rows.live.state.textContent = running
      ? '开着 · ' + Number(st.fps || 0).toFixed(1) + ' 帧/秒 · 已 ' + (st.frames || 0) + ' 帧'
      : '没开（她只能一张张慢慢截，约 2 张/秒）';
    if (rows.live._running !== running) {
      rows.live._running = running;
      rows.live.acts.innerHTML = '';
      if (running) {
        rows.live.acts.appendChild(btn('停', false, function () {
          try { A.screenStop(); } catch (e) { /* 旧版 APK 没这桥 */ }
          setTimeout(refreshLiveRow, 800);
        }));
      } else {
        rows.live.acts.appendChild(btn('开启', true, function () {
          try { A.screenStart(); } catch (e) { /* 旧版 APK 没这桥 */ }
          setTimeout(refreshLiveRow, 2500);
          setTimeout(refreshLiveRow, 7000);
        }));
      }
    }
    if (running && !liveTimer) {
      liveTimer = setInterval(function () {
        if (!rows.live || !document.body.contains(rows.live.row)) {
          clearInterval(liveTimer);
          liveTimer = null;
          return;
        }
        refreshLiveRow();
      }, 2000);
    }
  }

  /**
   * 「屏幕别灭」那一行。
   *
   * 屏幕一黑，Android 就把投屏会话收掉（屏幕不可见就不许投射），流必断 —— 这是系统行为，
   * 改不了。所以想连着看很久，只能让屏幕别灭。默认关：要不要为这个多耗电由用户决定。
   */
  function refreshKeepOnRow() {
    if (!rows || !rows.keepon) return;
    var on = false;
    try { on = !!A.keepOn(); } catch (e) { on = false; }
    rows.keepon.state.textContent = on ? '开着 · 屏幕不会自己灭' : '关着 · 跟系统设置一样会灭';
    rows.keepon.acts.innerHTML = '';
    rows.keepon.acts.appendChild(btn(on ? '关' : '开', !on, function () {
      try { A.setKeepOn(!on); } catch (e) { /* 旧版 APK 没这桥 */ }
      setTimeout(refreshKeepOnRow, 300);
    }));
  }

  function refreshAndroid() {
    if (!rows) return;
    var s = state();
    if (!s) return;

    rows.overlay.state.textContent = s.overlay ? '已开启 · 站在桌面底部' : '未开启';
    rows.overlay.acts.innerHTML = '';
    rows.overlay.acts.appendChild(btn(s.overlay ? '关闭悬浮桌宠' : '开启悬浮桌宠', true, function () {
      A.toggleOverlay(); setTimeout(refreshAndroid, 500);
    }));

    rows.scale.state.textContent = Number(s.scale).toFixed(2) + '×';
    rows.scale.acts.innerHTML = '';
    rows.scale.acts.appendChild(num(Number(s.scale).toFixed(2), 0.8, 8, 0.01, function (v) {
      A.setScale(v);
      // 同步写回 config.json：这样配置页里的「大小」跟这里永远是同一个数
      save({ [K + 'window.scale']: v });
      setTimeout(refreshAndroid, 150);
    }));

    rows.range.state.textContent = s.rangeLeft + '% – ' + s.rangeRight + '%';
    rows.range.acts.innerHTML = '';
    rows.range.acts.appendChild(btn('调整范围', true, function () { A.openRange(); setTimeout(refreshAndroid, 600); }));

    rows.cua.state.textContent = s.cua ? '已连接' : '未开启（重装 APK 后要重开）';
    rows.cua.acts.innerHTML = '';
    if (!s.cua) rows.cua.acts.appendChild(btn('去开启', true, function () { A.openCua(); setTimeout(refreshAndroid, 1200); }));

    refreshLiveRow();
    refreshKeepOnRow();

    rows.hold.state.textContent = '拖动 ' + s.dragCancelDp + ' dp · 收音 ' + s.holdDelayMs + ' ms';
    rows.hold.acts.innerHTML = '';
    var l1 = mk('span', null, '拖动超过');
    l1.style.cssText = 'opacity:.6;margin-right:4px';
    var l2 = mk('span', null, 'ms');
    l2.style.cssText = 'opacity:.6;margin-left:2px;margin-right:10px';
    var l3 = mk('span', null, '按住超过');
    l3.style.cssText = 'opacity:.6;margin-right:4px';
    var l4 = mk('span', null, 'dp');
    l4.style.cssText = 'opacity:.6;margin-left:2px';
    rows.hold.acts.append(
      l1, num(s.dragCancelDp, 8, 300, 1, function (v) { A.setDragCancel(Math.round(v)); setTimeout(refreshAndroid, 150); }), l4,
      l3, num(s.holdDelayMs, 0, 2000, 10, function (v) { A.setHoldDelay(Math.round(v)); setTimeout(refreshAndroid, 150); }), l2
    );
  }

  /* ---------- 幂等 patch ---------- */
  function patch() {
    ensureMobileNav();
    ensureHabitNav();
    var bodies = document.querySelectorAll('.sheetbody');
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      if (body.getAttribute('data-coo-android') === 'habit-page') continue;   // 我们自己那页
      // 只有"桌宠"tab 才有 .mountrow（桌宠窗口/窗口运行时）；其它 tab 一律不碰
      var isPet = !!body.querySelector('.mountrow') || !!body.querySelector('[data-coo-android]');
      if (!isPet) continue;

      var mounts = body.querySelectorAll('.mountrow');
      for (var j = 0; j < mounts.length; j++) {
        var r = mounts[j];
        if (r.hasAttribute('data-coo-android')) continue;
        var nm = r.querySelector('.mname');
        var t = nm ? nm.textContent.trim() : '';
        if (t === '桌宠窗口' || t === '窗口运行时') r.remove();
      }

      var link = body.querySelector('a.btn[href*="/pet"]');
      if (link && !link.hasAttribute('data-coo-android')) {
        var b = btn('回到桌宠（全屏）', true, function () { A.openPet(); });
        b.setAttribute('data-coo-android', 'link');
        link.replaceWith(b);
      }

      if (body.querySelectorAll('[data-coo-android]:not([data-coo-android="link"])').length < 5) {
        var old = body.querySelectorAll('[data-coo-android]');
        for (var k = 0; k < old.length; k++) old[k].remove();
        buildAndroid(body);
      }
      refreshAndroid();
      return;
    }
  }

  setInterval(patch, 900);
  setTimeout(patch, 400);
})();