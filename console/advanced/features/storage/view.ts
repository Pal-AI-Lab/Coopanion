/**
 * 存储清单视图:列本页的项,落盘在内存前,每项可清除。清单由服务端声明,清除范围和结果由各项的实现决定;
 * `clearAll` 打开时多一颗一键清空,清的是服务端整张清单;确认框逐项列出受影响的存储项与归属。
 */

import { S as COMMON } from '../../../base/ui/strings.ts';
import { actionProblem, listProblem } from '../../../base/ui/problem.ts';

import type { WebUi } from 'cortico/web/shared/client-panel.ts';
import { get, post } from '../../../base/api.ts';
import { S } from './strings.ts';

/** 一条可清除的存储部分。与 `src/core/types.ts` 的 `OwnedStoragePart` 同形(去掉两个函数)。 */
export interface StoragePartView {
  key: string;
  label: string;
  kind: 'disk' | 'memory';
  /** 归属:core、persona、memory 或 world:<id>,装配层盖章。 */
  owner: string;
  location?: string;
  danger?: boolean;
  note?: string;
  /** 当前规模描述，服务端实时算。 */
  stat?: string;
}

export interface StorageViewDeps {
  ui: WebUi;
  signal: AbortSignal;
  /** 这一处画哪些项。省略 = 全部。 */
  filter?(part: StoragePartView): boolean;
  /** 画「一键清空全部」。 */
  clearAll?: boolean;
}

export interface StorageView {
  el: HTMLElement;
  /** 取一次 `/api/storage` 并重建。可反复调。 */
  load(): Promise<void>;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isAbort(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}

export function createStorageView(deps: StorageViewDeps): StorageView {
  const { ui, signal } = deps;
  const el = ui.h('div', 'storageview');
  const problem = actionProblem(ui, el.ownerDocument, signal);
  const body = ui.h('div', 'settings-sections');
  const readError = ui.h('div', 'read-feedback');
  let loaded = false;
  const bar = ui.actions();
  const result = ui.msgline();
  bar.append(result);
  bar.append(ui.h('span', 'grow'));
  const nukeBtn = deps.clearAll ? ui.button(S.nukeAll, { variant: 'danger', onClick: () => void nuke() }) : null;
  if (nukeBtn) bar.appendChild(nukeBtn);
  el.append(readError, body, bar);
  bar.classList.add('hidden');

  function row(p: StoragePartView): HTMLDivElement {
    const item = ui.h('div', 'strow');
    const info = ui.h('div', 'stinfo');
    info.appendChild(ui.h('div', 'stlabel', p.label));
    if (p.location) info.appendChild(ui.h('div', 'stloc', p.location));
    if (p.note) info.appendChild(ui.h('div', 'stnote', p.note));
    const stat = ui.h('div', 'ststat', p.stat || '');
    const btn = ui.button(S.clear, {
      size: 'sm',
      variant: p.danger ? 'danger' : 'plain',
      onClick: () => void clearOne(p, btn),
    });
    item.append(info, stat, btn);
    return item;
  }

  async function clearOne(p: StoragePartView, btn: HTMLButtonElement): Promise<void> {
    const ok = await ui.confirm(
      p.danger
        ? { title: S.dangerTitle(p.label), body: S.dangerBody(p.note || ''), danger: true }
        : { title: S.clearTitle(p.label), body: p.note || '' },
    );
    if (!ok || signal.aborted) return;
    result.textContent = '';
    const lock = ui.disable(btn);
    try {
      const out = await post<{ result?: string }>(
        `/api/storage/clear?owner=${encodeURIComponent(p.owner)}&key=${encodeURIComponent(p.key)}`,
        undefined,
        { signal },
      );
      if (signal.aborted) return;
      result.textContent = out.result || S.cleared;
      await load();
    } catch (err) {
      if (isAbort(err) || signal.aborted) return;
      problem(btn, S.clearFailed(errText(err)));
    } finally {
      lock.dispose();
    }
  }

  /** 最近一次取回的整张清单,确认框按它列出一键清空的范围。 */
  let everything: StoragePartView[] = [];

  async function nuke(): Promise<void> {
    if (!nukeBtn) return;
    const list = everything.map((p) => `· ${p.label} (${p.owner})`).join('\n');
    const ok = await ui.confirm({ title: S.nukeTitle, body: `${S.nukeBody}\n\n${list}`, danger: true });
    if (!ok || signal.aborted) return;
    result.textContent = '';
    const lock = ui.disable(nukeBtn);
    try {
      const out = await post<{ results?: Array<{ owner: string; key: string; ok: boolean }> }>(
        '/api/storage/clear-all',
        undefined,
        { signal },
      );
      if (signal.aborted) return;
      const results = out.results || [];
      const bad = results.filter((x) => !x.ok);
      if (bad.length) problem(nukeBtn, S.partialFailed(bad.map((x) => `${x.owner} ${x.key}`).join(',')));
      else result.textContent = S.nukedAll(results.length);
      await load();
    } catch (err) {
      if (isAbort(err) || signal.aborted) return;
      problem(nukeBtn, S.nukeFailed(errText(err)));
    } finally {
      lock.dispose();
    }
  }

  async function load(): Promise<void> {
    try {
      const data = await get<{ parts?: StoragePartView[] }>('/api/storage', { signal });
      if (signal.aborted) return;
      loaded = true;
      readError.replaceChildren();
      const all = data.parts || [];
      everything = all;
      bar.classList.toggle('hidden', (!nukeBtn || !all.length) && !result.textContent);
      const parts = deps.filter ? all.filter((p) => deps.filter!(p)) : all;
      body.replaceChildren();
      if (!parts.length) {
        body.appendChild(ui.placeholder(all.length ? S.empty : S.noList));
        return;
      }
      for (const [kind, title] of [['disk', S.sectionDisk], ['memory', S.sectionMemory]] as const) {
        const items = parts.filter((p) => p.kind === kind);
        if (!items.length) continue;
        const card = ui.sheet({ title });
        for (const p of items) card.body.appendChild(row(p));
        body.appendChild(card.el);
      }
    } catch (err) {
      if (isAbort(err) || signal.aborted) return;
      const text = S.loadFailed(errText(err));
      if (!loaded) body.replaceChildren();
      readError.replaceChildren(listProblem(el.ownerDocument, text, COMMON.retry, load));
    }
  }

  body.appendChild(ui.placeholder(S.loading));
  return { el, load };
}
