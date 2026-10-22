/**
 * 用量与成本页读取跨重启保留的调用流水，按时段与范围统计 token、成本和请求次数，按各角色实际模型计价。
 * 状态属于本次 mount；定时器使用 lifecycle.interval，监听绑定 signal，tooltip 挂在本页 root。领域图表由 chart.ts 提供。
 */

import type { WebUi, Disposable } from 'cortico/web/shared/client-panel.ts';
import { get, setConfig } from '../../base/api.ts';
import { consoleFormat } from '../../base/ui/format.ts';
import { pageIntro } from '../../base/ui/page.ts';
import { getThemeStudio } from '../../base/theme/studio.ts';
import type { Page, PageContext } from '../../base/page.ts';
import { bucketLabel, renderChart } from './chart.ts';
import { U_TYPES, themeColorResolver } from './labels.ts';
import { usageQuery } from './range.ts';
import { createUsageState } from './state.ts';
import { S } from './strings.ts';
import { createUsageTip } from './tooltip.ts';
import type { UsageAccum, UsageAggregate, UsageBucketOption, UsageGroupStat, UsageMetric } from './types.ts';

/** 自动刷新的周期。 */
const LIVE_MS = 15_000;
/** 图区尺寸变化后延迟重画图表，合并连续的尺寸变化。 */
const RESIZE_DEBOUNCE_MS = 80;

const BUCKETS: ReadonlyArray<{ value: UsageBucketOption; label: string }> = [
  { value: 'auto', label: S.bucketAuto },
  { value: 'minute', label: S.bucketMinute },
  { value: 'hour', label: S.bucketHour },
  { value: 'day', label: S.bucketDay },
  { value: 'week', label: S.bucketWeek },
  { value: 'month', label: S.bucketMonth },
];

const PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: S.presetToday },
  { value: '3', label: S.preset3 },
  { value: '7', label: S.preset7 },
  { value: '30', label: S.preset30 },
  { value: '90', label: S.preset90 },
  { value: '0', label: S.presetCustom },
];

const METRICS: ReadonlyArray<{ value: UsageMetric; label: string }> = [
  { value: 'cost', label: S.metricCost },
  { value: 'tokens', label: 'token' },
  { value: 'calls', label: S.cardCalls },
];

/** 已知金额。全部未计价为「未知」;部分未计价时金额是下限,后缀标出。 */
function costText(amount: number, a: Partial<UsageAccum>, cur: string): string {
  const unpriced = a.unpricedCalls || 0;
  if (unpriced > 0 && !(a.pricedCalls || 0) && !amount) return S.unknown;
  return consoleFormat.money(amount, cur) + (unpriced > 0 ? S.partialMark : '');
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** abort 不是失败，是"这一页已经不在了"。 */
function isAbort(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}

export function mountUsage(ctx: PageContext): void {
  const { ui, root, lifecycle } = ctx;
  const doc = root.ownerDocument;
  const state = createUsageState();
  const color = themeColorResolver(doc);
  const tip = lifecycle.own(createUsageTip(doc, root));
  const intro = pageIntro(ui, S.pageTitle);

  // ---- 工具条：时段、账本口径、刷新 ------------------------------------------
  const toolbar = ui.h('div', 'ubar');
  const presets = ui.segmented(PRESETS, {
    size: 'sm',
    value: String(state.days),
    onSelect: (v) => {
      state.days = Number(v);
      customRange.hidden = state.days !== 0;
      if (state.days === 0) {
        // 自定义档从上一次结果的范围起步;那是按部署时区算出的日期。
        if (!state.from) state.from = state.data?.from ?? '';
        if (!state.to) state.to = state.data?.to ?? '';
        fromInput.value = state.from;
        toInput.value = state.to;
      }
      void load();
    },
  });
  const fromInput = ui.input({
    type: 'date',
    onChange: (v) => { state.from = v; if (state.days === 0) void load(); },
  });
  const toInput = ui.input({
    type: 'date',
    onChange: (v) => { state.to = v; if (state.days === 0) void load(); },
  });
  const customRange = ui.h('span', 'urange');
  customRange.append(fromInput, ui.h('span', null, '—'), toInput);
  customRange.hidden = true;
  let basis = 'marginal';
  let currency = '';
  const currencySelect = ui.select({ options: [{value:'',label:S.autoCurrency}], onChange: value => { currency = value; void load(); } });
  const basisSelect = ui.select({ options: [{value:'marginal',label:S.basisMarginal},{value:'equivalent',label:S.basisEquivalent}], onChange: value => { basis = value; void load(); } });
  basisSelect.setAttribute('aria-label', S.ledger);
  // 换算币种的汇率：写回 Core 配置
  const rateInput = ui.input({ type: 'number' });
  rateInput.min = '0';
  rateInput.step = 'any';
  rateInput.title = S.rateHint;
  rateInput.setAttribute('aria-label', S.rateHint);
  const rateCode = ui.h('span', 'ulabel');
  const rateBox = ui.h('span', 'urate');
  rateBox.append(ui.h('span', 'ulabel', '1 USD ='), rateInput, rateCode);
  rateBox.hidden = true;
  rateInput.addEventListener('change', () => {
    const code = rateCode.textContent ?? '';
    const value = Number(rateInput.value);
    if (!code || !(value > 0)) { rateInput.value = rateInput.dataset.saved ?? ''; return; }
    void setConfig('core', { [`usage.rates.${code}`]: value }, { signal: ctx.signal }).then(() => {
      rateInput.dataset.saved = String(value);
      rateNote = '';
      return load();
    }, (err) => {
      if (isAbort(err) || ctx.signal.aborted) return;
      rateInput.value = rateInput.dataset.saved ?? '';
      rateNote = S.rateSaveFailed(errText(err));
      renderNotes();
    });
  }, { signal: ctx.signal });
  const ledger = ui.h('span', 'uledger');
  ledger.append(ui.h('span', 'ulabel', S.ledger), basisSelect, currencySelect, rateBox);
  const liveBox = ui.checkbox(S.liveRefresh, {
    title: S.liveRefreshTitle(LIVE_MS / 1000),
    onChange: (on) => setLive(on),
  });
  const refreshBtn = ui.button(S.refresh, { size: 'sm', onClick: () => void load() });
  toolbar.append(presets.el, customRange, ledger, ui.h('span', 'grow'), liveBox.el, refreshBtn);

  /** 取数失败、账目存储异常与汇率保存失败；没有时整行不占位。 */
  const notice = ui.msgline('', true);
  notice.classList.add('unotice');
  let rateNote = '';

  // ---- 概览读数与成本构成 ----------------------------------------------------
  const cards = ui.h('div', 'ukpis');
  const compBox = ui.h('div', 'ucomp');

  // ---- 时间序列：成本 / token / 调用次数共用一张图 ----------------------------
  const chartPanel = ui.h('section', 'upanel uchartpanel');
  const chartHead = ui.h('div', 'upanel-head');
  const rangeHint = ui.h('span', 'uhint');
  const metricSeg = ui.segmented(METRICS, {
    size: 'sm',
    value: state.metric,
    onSelect: (v) => { state.metric = v as UsageMetric; renderMain(); },
  });
  chartHead.append(ui.h('h3', null, S.mainTitle), rangeHint, ui.h('span', 'grow'), metricSeg.el);
  const chartCtrls = ui.h('div', 'upanel-ctrls');
  const bucketSeg = ui.segmented(BUCKETS, {
    size: 'sm',
    value: state.bucket,
    onSelect: (v) => { state.bucket = v as UsageBucketOption; void load(); },
  });
  const bkHint = ui.h('span', 'uhint');
  const splitBoxes = (['type', 'role', 'model'] as const).map((dim) => [dim, ui.checkbox(
    dim === 'type' ? S.dimType : dim === 'role' ? S.dimRole : S.dimModel,
    { onChange: (on) => { state.splitDims[dim] = on; renderMain(); } },
  )] as const);
  const splitGroup = ui.h('span', 'usplit');
  splitGroup.append(ui.h('span', 'ulabel', S.split), ...splitBoxes.map(([, box]) => box.el));
  chartCtrls.append(
    ui.h('span', 'ulabel', S.granularity), bucketSeg.el, bkHint, splitGroup, ui.h('span', 'grow'),
    ui.checkbox(S.sortByShare, {
      title: S.sortByShareTitle,
      onChange: (on) => { state.sortByShare = on; renderMain(); },
    }).el,
  );
  const mainLegend = ui.h('div', 'chart-legend');
  const mainBox = ui.h('div', 'uchart');
  mainBox.id = 'usagechart';
  const mainNote = ui.h('p', 'muted unote');
  chartPanel.append(chartHead, chartCtrls, mainLegend, mainBox, mainNote);

  // ---- 分组明细：同一时刻显示一张 -------------------------------------------
  const GROUP_HEAD = [S.headCalls, S.headInput, S.headOutput, S.headCache, S.headCost, S.headAvg];
  const groupTables = {
    role: ui.table({ head: [S.dimRole, ...GROUP_HEAD] }),
    model: ui.table({ head: [S.dimModel, ...GROUP_HEAD] }),
    instance: ui.table({ head: [S.dimInstance, ...GROUP_HEAD] }),
  };
  type GroupKey = keyof typeof groupTables;
  const showGroup = (key: GroupKey): void => {
    for (const k of Object.keys(groupTables) as GroupKey[]) groupTables[k].el.hidden = k !== key;
  };
  const groupSeg = ui.segmented([
    { value: 'role', label: S.byRole },
    { value: 'model', label: S.byModel },
    { value: 'instance', label: S.byInstance },
  ], { size: 'sm', value: 'role', onSelect: (v) => showGroup(v as GroupKey) });
  showGroup('role');
  const groupPanel = ui.h('section', 'upanel ugroups');
  const groupHead = ui.h('div', 'upanel-head');
  groupHead.append(groupSeg.el);
  groupPanel.append(groupHead, ...Object.values(groupTables).map((t) => t.el));

  const footnote = ui.h('p', 'muted ufoot');
  const results = ui.h('div', 'uresults');
  results.append(cards, compBox, chartPanel, groupPanel, footnote);
  const board = ui.h('div', 'uboard');
  board.append(toolbar, notice, results);
  root.append(intro, board);

  // ---- 渲染 -----------------------------------------------------------------

  function renderMain(): void {
    const calls = state.metric === 'calls';
    for (const [dim, box] of splitBoxes) if (dim === 'type') box.input.disabled = calls;
    if (!state.data) return;
    const unpriced = state.data.totals?.unpricedCalls || 0;
    mainNote.textContent = state.metric === 'cost' && unpriced > 0 ? S.compUnpriced(unpriced) : '';
    renderChart(
      { doc, ui, box: mainBox, legend: mainLegend, tip, color },
      state.data,
      { metric: state.metric, dims: state.splitDims, allowType: !calls, sort: state.sortByShare },
    );
  }

  function renderCards(d: UsageAggregate): void {
    const cur = d.currency || 'USD';
    const t: Partial<UsageGroupStat> = d.totals || {};
    const series = d.series || [];
    const calls = t.calls || 0;
    // 空范围整排清零的读数读起来像坏了;一句话说清"没数据"和"数据坏了"的分别。
    if (calls === 0) {
      cards.replaceChildren(ui.placeholder(S.noCalls));
      return;
    }
    // 均价与平均 token 同取成功调用。
    const successful = d.successful ?? t;
    const okCalls = successful.calls || 0;
    const avgCost = okCalls ? (successful.cost || 0) / okCalls : 0;
    const avgTok = okCalls ? ((successful.promptTokens || 0) + (successful.completionTokens || 0)) / okCalls : 0;
    const rShare = (t.completionTokens || 0) > 0
      ? (t.reasoningTokens || 0) / (t.completionTokens || 1)
      : null;
    let peak: (typeof series)[number] | null = null;
    for (const p of series) if ((p.cost || 0) > 0 && (!peak || (p.cost || 0) > (peak.cost || 0))) peak = p;
    // 失败消耗是总消耗的子集。
    const f: Partial<UsageAccum> = d.failed || {};
    const failed = f.calls || 0;
    const unpriced = t.unpricedCalls || 0;

    const items: Parameters<typeof ui.stat>[0][] = [
      {
        k: S.cardKnownCost, v: costText(t.cost || 0, t, cur), accent: true,
        unit: unpriced > 0 ? S.unpriced(unpriced) : `${S.cardCoverage} ${t.pricedCalls || 0} / ${calls}`,
      },
      {
        k: S.cardCalls, v: calls.toLocaleString(),
        unit: failed > 0
          ? `${S.cardFailed} ${S.failedCalls(failed.toLocaleString())} · ${S.burned(consoleFormat.count((f.promptTokens || 0) + (f.completionTokens || 0)))}`
          : '',
      },
      { k: S.cardInput, v: consoleFormat.count(t.promptTokens || 0), unit: S.hitRate(consoleFormat.percent(t.cacheHitRate)) },
      { k: S.cardOutput, v: consoleFormat.count(t.completionTokens || 0), unit: S.reasoningShare(consoleFormat.percent(rShare)) },
      { k: S.cardAvgCost, v: okCalls ? costText(avgCost, successful, cur) : '—', unit: okCalls ? S.approxTok(consoleFormat.count(Math.round(avgTok))) : '' },
      { k: S.cardPeak, v: peak ? costText(peak.cost || 0, peak, cur) : '—', unit: peak ? bucketLabel(peak.bucket, d.bucket || 'day') : '' },
    ];
    cards.replaceChildren(...items.map((item) => {
      const el = ui.stat(item);
      // 窄窗口里副行会截断，悬停可看全文。
      if (item.unit) el.title = item.unit;
      return el;
    }));
  }

  /** 一条横条加图例；没有已知成本时整行收起，原因写在图下。 */
  function renderComposition(d: UsageAggregate): void {
    compBox.replaceChildren();
    const cur = d.currency || 'USD';
    const t: Partial<UsageGroupStat> = d.totals || {};
    const total = t.cost || 0;
    compBox.hidden = !(total > 0);
    if (compBox.hidden) return;
    const parts = [
      { label: S.partCacheHit, val: t.costCacheHit || 0, color: color(U_TYPES[0]!.color) },
      { label: S.partCacheMiss, val: t.costCacheMiss || 0, color: color(U_TYPES[1]!.color) },
      { label: S.partOutput, val: t.costOutput || 0, color: color(U_TYPES[2]!.color) },
    ];
    if (t.costOther) parts.push({ label: S.partOther, val: t.costOther, color: color('chart-4') });
    const bar = ui.h('div', 'compbar');
    const leg = ui.h('div', 'compleg');
    for (const p of parts) {
      const seg = ui.h('div', 'compseg');
      seg.style.width = (p.val / total) * 100 + '%';
      seg.style.background = p.color;
      seg.title = `${p.label} ${consoleFormat.money(p.val, cur)}`;
      bar.appendChild(seg);
      const it = ui.h('span', 'compitem');
      const sw = ui.h('span', 'compsw');
      sw.style.background = p.color;
      it.append(
        sw,
        ui.h('span', null, p.label),
        ui.h('span', 'compamt', consoleFormat.money(p.val, cur)),
        ui.h('span', 'comppct', consoleFormat.percent(p.val / total)),
      );
      leg.appendChild(it);
    }
    compBox.append(ui.h('span', 'ulabel', S.compTitle), bar, leg);
  }

  /**
   * 首列印的是**声明方给的名字**，后面跟 id 原文；给不出名字就只印 id。角色 id 由Persona定义、
   * 模型名由供应商定义，控制台两边都不认识，也就不为任何一边备一张翻译表。
   */
  function renderGroup(
    table: ReturnType<WebUi['table']>,
    groups: readonly UsageGroupStat[],
    cur: string,
  ): void {
    table.clear(groups.length ? undefined : S.noData);
    if (!groups.length) return;
    for (const g of groups) {
      const avg = g.calls ? (g.cost || 0) / g.calls : 0;
      const name = ui.h('span', null, g.label || g.key);
      if (g.label && g.label !== g.key) name.appendChild(ui.h('span', 'data-extra', ` ${g.key}`));
      table.addRow([
        name,
        { text: g.calls || 0, cls: 'mono' },
        { text: consoleFormat.count(g.promptTokens), cls: 'mono' },
        { text: consoleFormat.count(g.completionTokens), cls: 'mono' },
        { text: consoleFormat.percent(g.cacheHitRate), cls: 'mono' },
        { text: costText(g.cost || 0, g, cur), cls: 'mono' },
        { text: costText(avg, g, cur), cls: 'mono' },
      ]);
    }
  }

  function renderHints(d: UsageAggregate): void {
    const unit = d.bucket || 'day';
    bkHint.textContent = state.bucket === 'auto'
      ? S.autoBucket(BUCKETS.find((b) => b.value === unit)?.label ?? unit)
      : '';
    rangeHint.textContent = S.rangeHint(d.from || '—', d.to || '—', (d.series || []).length, d.timezone ?? null);
  }

  /** 顶部提示行只放需要处理的问题；统计口径写在页脚。 */
  let staleNote = '';
  function renderNotes(): void {
    const d = state.data;
    const ledgerError = d?.ledger?.error ? S.ledgerError(d.ledger.pending, d.ledger.error).trim() : '';
    notice.textContent = [staleNote, ledgerError, rateNote].filter(Boolean).join(' ');
    notice.hidden = !notice.textContent;
  }

  function renderAll(d: UsageAggregate): void {
    const currencies = d.currencies ?? [];
    currencySelect.replaceChildren(...['', ...currencies].map(value => {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = value || S.autoCurrency;
      return option;
    }));
    currencySelect.value = currency;
    const shown = d.currency || 'USD';
    const rate = shown === 'USD' ? undefined : d.rates?.[shown];
    rateBox.hidden = rate === undefined;
    rateCode.textContent = shown;
    if (rate !== undefined && doc.activeElement !== rateInput) {
      rateInput.value = String(rate);
      rateInput.dataset.saved = rateInput.value;
    }
    footnote.textContent = S.billingHint +
      (d.totals?.unknownUsageCalls ? S.unknownUsage(d.totals.unknownUsageCalls) : '');
    renderNotes();
    renderCards(d);
    renderComposition(d);
    renderHints(d);
    const cur = d.currency || 'USD';
    renderGroup(groupTables.role, d.byRole || [], cur);
    renderGroup(groupTables.model, d.byModel || [], cur);
    renderGroup(groupTables.instance, d.byInstance || [], cur);
    renderMain();
  }

  // ---- 取数 -----------------------------------------------------------------

  /** 每次取数自增;只有最新一次的结果或失败能落到页面上。 */
  let generation = 0;
  let loadedAt = '';

  async function load(): Promise<void> {
    const mine = ++generation;
    try {
      const d = await get<UsageAggregate>(
        `/api/usage?${usageQuery(state.bucket, state.days, { from: state.from, to: state.to })}&basis=${basis}&currency=${encodeURIComponent(currency)}`,
        { signal: ctx.signal },
      );
      if (ctx.signal.aborted || mine !== generation) return;
      state.data = d;
      loadedAt = ui.fmt.clock(new Date().toISOString());
      staleNote = '';
      results.classList.remove('u-stale');
      renderAll(d);
    } catch (err) {
      if (isAbort(err) || ctx.signal.aborted || mine !== generation) return;
      if (!state.data) {
        cards.replaceChildren(ui.placeholder(S.loadFailed(errText(err))));
        return;
      }
      // 保留上一次的结果,整块标为过期,并写明取回时刻。
      staleNote = S.stale(errText(err), loadedAt);
      renderNotes();
      results.classList.add('u-stale');
    }
  }

  // ---- 自动刷新 -------------------------------------------------------------

  let liveTimer: Disposable | null = null;
  function setLive(on: boolean): void {
    liveTimer?.dispose();
    liveTimer = on ? lifecycle.interval(() => void load(), LIVE_MS) : null;
  }

  // ---- 重画触发：主题换色 / 图区尺寸变化 -------------------------------------
  // 两者都只重画，不重取：数据没变，变的是画布与配色。

  /** 配色变了。图上的颜色是从 CSS 变量现读的，所以只能整张重画。 */
  function repaint(): void {
    tip.hide();
    if (!state.data) return;
    renderMain();
    renderComposition(state.data);
  }

  lifecycle.own(getThemeStudio({ doc }).onChange(() => repaint()));

  // 图区尺寸随窗口与明细表行数变化；SVG 绝对定位，不反过来撑大图区。
  const view = doc.defaultView;
  if (view) {
    let pending: Disposable | null = null;
    let last = '';
    const observer = new view.ResizeObserver(() => {
      const size = `${mainBox.clientWidth}x${mainBox.clientHeight}`;
      if (!state.data || size === last) return;
      last = size;
      pending?.dispose();
      pending = lifecycle.timeout(() => renderMain(), RESIZE_DEBOUNCE_MS);
    });
    observer.observe(mainBox);
    ctx.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }

  renderNotes();
  compBox.hidden = true;
  cards.appendChild(ui.placeholder(S.loading));
  void load();
}

export const usagePage: Page = {
  route: 'usage',
  label: S.navLabel,
  icon: 'chart',
  mount: mountUsage,
};
