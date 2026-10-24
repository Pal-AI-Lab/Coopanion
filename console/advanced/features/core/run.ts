/**
 * 运行态概览:一条与控制台顶栏同样的读数栏。只读——暂停/继续在左下角,这里不重复一份。
 * 左边是控制台那一组(运行状态、下次提交、累计输入、缓存、条数、批次、在线);
 * 右边是控制台没有的投递水位与本批轮数,以及当前模型供应商(点开去「模型供应商」)。
 */

import type { WebUi } from 'cortico/web/shared/client-panel.ts';
import { loopOf, type SessionStat, type StatusSnapshot } from '../live/protocol.ts';
import { chipOf, createStatusBand } from '../live/status.ts';
import { S as LIVE_S } from '../live/strings.ts';
import { S } from './strings.ts';

export interface RunViewDeps {
  ui: WebUi;
  /** 点了模型供应商:去它的设置页;没有选中的供应商时是 null。 */
  openProvider(name: string | null): void;
}

export interface RunView {
  el: HTMLElement;
  render(st: StatusSnapshot | null, sessions: readonly SessionStat[]): void;
}

export function createRunView(deps: RunViewDeps): RunView {
  const { ui } = deps;
  const el = ui.h('div', 'live-summary core-summary');
  const band = createStatusBand(ui);
  const right = ui.h('div', 'live-summary-right');
  el.append(band.el, right);

  let current: string | null = null;
  const connection = ui.button('', { onClick: () => deps.openProvider(current) });
  connection.className = 'live-connection';
  const connectionValue = ui.h('span', 'live-connection-value');
  connection.append(ui.h('span', 'live-connection-label', LIVE_S.currentProvider), connectionValue);

  return {
    el,
    render(st, sessions) {
      band.render(st, sessions.find((s) => s.id === 'main') ?? null);
      right.replaceChildren();
      if (!st) return;
      const loop = loopOf(st);
      const chips = ui.h('div', 'chips');
      chips.appendChild(chipOf(ui, [S.chipDelivered, { b: loop.lastDeliveredCursor ?? '-' }, ` / ${st.latestEventCursor ?? '-'}`]));
      if (loop.roundsLastBatch != null) chips.appendChild(chipOf(ui, [S.chipRoundsPre, { b: loop.roundsLastBatch }, S.chipRoundsPost]));
      const conn = st.modelConnection;
      current = conn?.name ?? null;
      connectionValue.textContent = conn ? `${conn.name} · ${conn.model ?? '-'}` : LIVE_S.noProvider;
      connection.title = conn ? `${conn.moduleTitle} (${conn.module})\n${conn.baseUrl}` : LIVE_S.noProvider;
      right.append(chips, connection);
    },
  };
}
