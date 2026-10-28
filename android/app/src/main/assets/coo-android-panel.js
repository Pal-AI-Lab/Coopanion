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
    // 宽度原来写死 9em（实测 135px），311px 宽的窄屏内容区里只占 43%，右边空一大块。
    // 改成撑满 + 上限 22em：窄屏吃满一行，宽屏也不会拉成长条。
    i.style.cssText = 'width:100%;max-width:22em;box-sizing:border-box;min-height:38px;padding:6px 10px;margin:0;'
      + 'border:1px solid var(--border,#3c4048);border-radius:8px;background:var(--card,transparent);'
      + 'color:inherit;font-family:inherit;font-size:14px';
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
    // 原来 margin-right:10px + 宽度随文字，网格里一排排对不齐（"形象 配色 走动" 像狗牙）。
    // 交给父容器的 grid 定宽度，这里只留内边距和触屏最小高度。
    lab.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;padding:7px 2px;'
      + 'min-height:34px;font-size:14px;box-sizing:border-box';
    var cb = mk('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.addEventListener('change', function () { onChange(cb.checked); });
    lab.append(cb, mk('span', null, text));
    return lab;
  }
  function select(options, value, onChange) {
    var s = mk('select');
    // 不给宽度时 select 按最长选项撑开，同一页几个下拉宽度各不相同（239/201/163）。
    // 统一撑满 + 上限，和输入框对齐。
    s.style.cssText = 'width:100%;max-width:22em;box-sizing:border-box;min-height:38px;padding:6px 10px;margin:0;'
      + 'border:1px solid var(--border,#3c4048);border-radius:8px;background:var(--card,transparent);'
      + 'color:inherit;font-family:inherit;font-size:14px';
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

  /* ---------- 窄屏：侧栏收窄，但永远贴在当前方向的左边 ---------- */
  /**
   * 面板侧栏是 PC 那套：宽屏竖着站左边（262px）。上游窄屏的行为不对 ——
   * `@media (max-width:720px)` 把 #rail 改成 position:sticky + width:100% + flex-direction:row，
   * 也就是「压成贴顶的一条横栏、还挡着页头」，手机上就是侧栏跑到顶上那副样子。
   *
   * 这里一律留在左边：262 收成 82 的图标条（图标居中、文字隐去、左边高亮竖条保留），
   * 内容区只让出 82px，不会被整条横栏压掉一行。
   * 竖屏平板 777 宽本来就走上游的 clamp(210px, 28.3vw-54px, 262px) = 210，不需要动；
   * 所以这段只在 <=720 生效，宽屏一个字都不写。
   * 全都带 !important：dist/web/styles.css 和 companion.css 各写死过一次 #rail 的 position / width。
   */
  /**
   * 窄屏设置页的比例。PC 那套 mountrow 是「名称 ……… 状态 控件」一行摆开，
   * 到 311px 的内容区里就挤成：名称和值各占一头、中间一片黑，控件还被推到最右。
   * 窄屏改成：名称和值一行，说明一行，控件独占一行撑满。
   */
  var FORM_CSS = [
    '@media (max-width:720px) {',
    '  #kernel-root .mountrow { align-items: baseline !important; gap: 0 8px !important;',
    '    padding: 10px 0 !important; border-bottom: 1px solid var(--border, #3c4048) !important; }',
    '  #kernel-root .mountrow .mname { font-size: 15px !important; }',
    '  #kernel-root .mountrow .mstate { font-size: 13px !important; margin-left: auto !important; }',
    '  #kernel-root .mountrow .mdetail { flex: 1 1 100% !important; width: 100% !important;',
    '    font-size: 12px !important; line-height: 1.45 !important; opacity: .75 !important;',
    '    margin-top: 2px !important; }',
    '  #kernel-root .mountrow .macts { flex: 1 1 100% !important; width: 100% !important;',
    '    margin-top: 8px !important; display: flex !important; align-items: center !important; }',
    '  #kernel-root .mountrow .macts > * { flex: 1 1 auto !important; min-width: 0 !important; }',
    '  #kernel-root .providerintro h1 { font-size: 22px !important; }',
    '  #kernel-root .providerintro p { font-size: 13px !important; line-height: 1.5 !important; }',
    '  #kernel-root .sheetbody { padding: 4px 14px 20px !important; }',
    '}',
    ''
  ].join('\n');

  var NAV_CSS = [
    '@media (max-width: 720px) {',
    // 上游在窄屏把 body 变成 column，这里改回 row：侧栏在左、内容在右
    // body 默认是 block。只写 flex-direction 一点用都没有（对块级容器不生效），
    // 结果 #rail 和 #kernel-root 在块流里各占一行 —— 手机上就是「内容被挤到侧栏下面」。
    // body 真正参与布局的子元素只有 #rail 和 #kernel-root（其余是 0x0 的 script/noscript
    // 和一个 absolute 的隐藏 textarea），所以改成 flex row 是安全的。
    '  body, body.companion-sidebar { display: flex !important; flex-direction: row !important;',
    '    align-items: stretch !important; padding-left: 0 !important; padding-bottom: 0 !important; }',
    // 侧栏：撤掉上游的 sticky + width:100% + 横排，改回贴着左边的一条竖栏
    '  #rail { position: static !important; top: auto !important; left: auto !important;',
    '    right: auto !important; bottom: auto !important;',
    '    width: 82px !important; min-width: 82px !important; max-width: 82px !important;',
    '    flex: none !important; flex-direction: column !important; align-items: stretch !important;',
    '    height: auto !important; max-height: none !important; z-index: 100 !important;',
    '    overflow: hidden !important;',
    '    border: 0 !important; border-right: 1px solid var(--border, #e3e4e3) !important;',
    '    border-bottom: 0 !important; box-shadow: none !important; }',
    '  #rail.is-collapsed { width: 82px !important; }',
    // 图标条里只留导航：脚注 / 分组标题 / 汉堡键 / 遮罩都不要，品牌居中（多半只剩图标）
    '  #rail .railfoot, #rail .stacklabel, #rail .companion-sidebar-toggle,',
    '  .companion-sidebar-backdrop { display: none !important; }',
    '  #rail .brand { justify-content: center !important; padding: 10px 0 !important; overflow: hidden !important; }',
    '  #rail .brand .lbl, #rail .brand .name { display: none !important; }',
    // 导航组竖排；竖着排不下就自己滚，滚动条藏掉，上游那两道 mask 渐变也去掉
    '  #rail nav.stack { display: flex !important; flex-direction: column !important;',
    '    align-items: stretch !important; gap: 4px !important; padding: 4px 0 !important;',
    '    overflow-y: auto !important; overflow-x: hidden !important;',
    '    scrollbar-width: none; mask-image: none !important; -webkit-mask-image: none !important; }',
    '  #rail nav.stack::-webkit-scrollbar { display: none; }',
    '  #rail .navgroup { display: flex !important; flex-direction: column !important;',
    '    gap: 4px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; }',
    // 每个导航项：方形居中图标，46px 高（手指按得住的下限）；文字和右侧小灯都不显示
    // 图标在上、文字在下。窄栏放不下「图标 + 文字」并排，但竖着叠两层刚好；
    // 字按 10px 走，能装下四五个汉字，更长的用省略号收尾。
    '  #rail .navitem { flex-direction: column !important; justify-content: center !important;',
    '    align-items: center !important; min-height: 50px !important; padding: 4px 2px !important;',
    '    margin: 2px 6px !important; gap: 3px !important; border-radius: 12px !important; }',
    '  #rail .navitem .navlamps { display: none !important; }',
    '  #rail .navitem svg { width: 20px !important; height: 20px !important; flex: none !important; }',
    // 上游给 .lbl 写了 position:absolute + top:20.19px（宽屏「图标在左、文字在右」时用来摆位），
    // 竖排后它正好压在图标身上 —— 截图里就是「只有图标、没有文字」。必须拉回文档流。
    '  #rail .navitem .lbl { position: static !important; top: auto !important; left: auto !important;',
    '    display: block !important; width: 100% !important; min-width: 0 !important;',
    '    font-size: 10px !important;',
    '    line-height: 1.2 !important; max-width: 100% !important; text-align: center !important;',
    '    letter-spacing: 0 !important; white-space: nowrap !important;',
    '    overflow: hidden !important; text-overflow: ellipsis !important; }',
    '  #rail .navitem .tag { display: block !important; }',   // 左边那条高亮竖条留着，认得出当前在哪一栏
    // 「基础 / 高级」模式键：收成一个图标大小的方块，贴在导航下面
    '  #rail .companion-mode, #rail.is-collapsed .companion-mode { display: flex !important;',
    '    flex-direction: column !important; align-items: center !important; justify-content: center !important;',
    '    height: 46px !important; min-height: 46px !important; margin: 6px 8px !important;',
    '    padding: 0 !important; gap: 0 !important; border-radius: 12px !important; opacity: 1 !important; }',
    '  #rail .companion-mode .lbl { display: block !important; font-size: 10px !important;',
    '    line-height: 1.2 !important; white-space: nowrap !important; overflow: hidden !important; }',
    '  #kernel-root { flex: 1 1 auto !important; min-width: 0 !important; min-height: 0 !important; }',
    '  .scroll { padding-left: 16px !important; padding-right: 16px !important; }',
    '}',
  ].join('\n');

  /**
   * 窄屏下把导航项压成「图标在上、文字在下」。
   * 光靠 NAV_CSS 不够：core 给 .lbl 直接写了行内样式（量到 font-size:12.5px、高度被压成 1px），
   * 行内的优先级高于带 !important 的作者样式表，只能回写 element.style 并同样带 important。
   * 导航项是 core 动态渲染的，所以每次 patch() 都要再过一遍。
   */
  function applyNavLabels() {
    if (!window.matchMedia || !window.matchMedia('(max-width: 720px)').matches) return;
    var items = document.querySelectorAll('#rail .navitem');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.style.setProperty('flex-direction', 'column', 'important');
      it.style.setProperty('justify-content', 'center', 'important');
      it.style.setProperty('align-items', 'center', 'important');
      it.style.setProperty('min-height', '50px', 'important');
      it.style.setProperty('padding', '4px 2px', 'important');
      it.style.setProperty('gap', '3px', 'important');
      var lbl = it.querySelector('.lbl');
      if (!lbl) continue;
      lbl.style.setProperty('position', 'static', 'important');
      lbl.style.setProperty('top', 'auto', 'important');
      lbl.style.setProperty('left', 'auto', 'important');
      lbl.style.setProperty('inset', 'auto', 'important');
      lbl.style.setProperty('display', 'block', 'important');
      lbl.style.setProperty('width', '100%', 'important');
      lbl.style.setProperty('min-width', '0', 'important');
      lbl.style.setProperty('height', 'auto', 'important');
      lbl.style.setProperty('max-height', 'none', 'important');
      lbl.style.setProperty('font-size', '10px', 'important');
      lbl.style.setProperty('line-height', '1.25', 'important');
      lbl.style.setProperty('text-align', 'center', 'important');
      lbl.style.setProperty('white-space', 'nowrap', 'important');
      lbl.style.setProperty('overflow', 'hidden', 'important');
      lbl.style.setProperty('text-overflow', 'ellipsis', 'important');
      lbl.style.setProperty('letter-spacing', '0', 'important');
      lbl.style.setProperty('opacity', '1', 'important');
    }
  }

  /** 挂一次就够（按 id 幂等）；面板重渲染后 head 还在，不用重挂。 */
  function ensureMobileNav() {
    if (!document.getElementById('coo-mobile-nav')) {
      var st = mk('style');
      st.id = 'coo-mobile-nav';
      st.textContent = NAV_CSS + FORM_CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    applyNavLabels();
    // 导航是 core 异步渲染的：注入那一刻可能还没有 navitem，补两次兜住
    setTimeout(applyNavLabels, 300);
    setTimeout(applyNavLabels, 1200);
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
    var userIn = text('', 24, '', function (v) { save({ [K + 'user']: v }); });
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
    keysWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));'
      + 'gap:0 8px;width:100%;margin-top:6px';
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
    wakeWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));'
      + 'gap:0 8px;width:100%;margin-top:6px';
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
    var a = mk('a', 'navitem');
    // 跟 core 的导航项同构：一个 svg + 一个 .lbl。
    // 否则窄屏那条 82px 图标条里它没有图标可显示，只剩「习惯」两个字挤压在栏底。
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">'
      + '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>'
      + '<span class="lbl">习惯</span>';
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