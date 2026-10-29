import type { PageContext } from '../../base/page.ts';
import type { ChatItem } from './index.ts';
import { H } from './history-strings.ts';

/** A calendar day in the browser's time zone, including daylight-saving transitions. */
export function dayRange(day: string): { fromTs?: string; toTs?: string } {
  if (!day) return {};
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { fromTs: start.toISOString(), toTs: end.toISOString() };
}

function excerpt(item: ChatItem): string {
  switch (item.kind) {
    case 'user': return item.text;
    case 'say': return item.beats.map((beat) => beat.text).join('\n');
    case 'ask': return [item.question, ...item.options].join('\n');
    case 'answer': return item.text ?? item.choice ?? (item.index === undefined ? '—' : `#${item.index + 1}`);
    default: return '';
  }
}

export function chatHistoryControls(ctx: PageContext, actions: {
  send(frame: Record<string, unknown>): void;
  locate(items: ChatItem[], cursor: number): void;
  latest(): void;
}) {
  const { ui, signal, lifecycle } = ctx;
  const doc = ctx.root.ownerDocument;
  const el = doc.createElement('details');
  el.className = 'chat-history';
  const summary = doc.createElement('summary');
  summary.textContent = H.history;
  const form = doc.createElement('form');
  form.className = 'chat-history-form';
  const query = doc.createElement('input');
  query.type = 'search';
  query.maxLength = 200;
  query.placeholder = H.keyword;
  query.setAttribute('aria-label', H.keyword);
  const date = doc.createElement('input');
  date.type = 'date';
  date.setAttribute('aria-label', H.date);
  const search = ui.button(H.search, { size: 'sm' });
  search.type = 'submit';
  form.append(query, date, search);
  const tools = ui.h('div', 'chat-history-tools');
  const status = ui.h('span', 'chat-history-status');
  status.setAttribute('role', 'status');
  const results = ui.h('div', 'chat-history-results');
  const previous = ui.button(H.previous, { size: 'sm', onClick: () => select(selected - 1) });
  const next = ui.button(H.next, { size: 'sm', onClick: () => select(selected + 1) });
  const latest = ui.button(H.latest, { size: 'sm', onClick: () => {
    cancel(findId); cancel(locateId);
    findId = locateId = null;
    search.disabled = more.disabled = false;
    actions.latest();
  } });
  const more = ui.button(H.more, { size: 'sm', onClick: () => find(true) });
  const save = ui.button(H.export, { size: 'sm', onClick: () => {
    exportName = `coopanion-chat-${date.value || 'all'}.md`;
    exportId = request({ t: 'export', ...dayRange(date.value) }, () => { exportId = null; save.disabled = false; ui.toast(H.saveFailed, 'bad'); });
    save.disabled = true;
  } });
  const reveal = ui.button(H.reveal, { size: 'sm', onClick: () => {
    void doc.defaultView?.coopanionWindow?.revealChatExport().catch(() => ui.toast(H.saveFailed, 'bad'));
  } });
  reveal.hidden = true;
  tools.append(previous, next, more, latest, save, reveal, status);
  el.append(summary, form, tools, results);

  let serial = 0;
  let findId: string | null = null;
  let locateId: string | null = null;
  let exportId: string | null = null;
  let exportName = '';
  let matches: ChatItem[] = [];
  let selected = -1;
  let before: number | undefined;
  let snapshot: number | undefined;
  let filters: Record<string, unknown> = {};
  const timers = new Map<string, { dispose(): void }>();
  const cancel = (id: string | null): void => {
    if (id === null) return;
    timers.get(id)?.dispose(); timers.delete(id);
  };
  const request = (frame: Record<string, unknown>, expired: () => void): string => {
    const id = `history-${++serial}`;
    timers.set(id, lifecycle.timeout(() => { timers.delete(id); expired(); }, 30000));
    actions.send({ ...frame, id });
    return id;
  };
  const navigation = (): void => {
    previous.disabled = selected <= 0;
    next.disabled = selected >= matches.length - 1;
  };
  const select = (index: number): void => {
    const item = matches[index];
    if (!item) return;
    selected = index;
    navigation();
    for (const [i, node] of [...results.children].entries()) node.setAttribute('aria-pressed', String(i === index));
    status.textContent = `${index + 1} / ${matches.length}`;
    cancel(locateId);
    locateId = request({ t: 'locate', cursor: item.cursor }, () => { locateId = null; status.textContent = H.failed; });
  };
  const find = (append = false): void => {
    cancel(findId);
    if (!append) {
      cancel(locateId);
      locateId = null;
      filters = { query: query.value.trim(), ...dayRange(date.value) };
      matches = []; selected = -1; before = snapshot = undefined;
      results.replaceChildren(); navigation();
    }
    search.disabled = more.disabled = true;
    status.textContent = H.loading;
    findId = request({ t: 'history', ...filters, ...(append ? { before, snapshot } : {}) }, () => {
      findId = null; search.disabled = more.disabled = false; status.textContent = H.failed;
    });
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); find(); }, { signal });
  date.addEventListener('change', () => { save.textContent = date.value ? H.exportDay : H.export; }, { signal });
  navigation(); more.hidden = true;

  const reset = (): void => {
    for (const timer of timers.values()) timer.dispose();
    timers.clear();
    if (findId || locateId) status.textContent = H.failed;
    if (exportId) ui.toast(H.saveFailed, 'bad');
    findId = locateId = exportId = null;
    search.disabled = more.disabled = save.disabled = false;
  };
  const download = async (text: string): Promise<void> => {
    try {
      const native = doc.defaultView?.coopanionWindow;
      if (native) {
        if (!await native.exportChat({ text, name: exportName })) return;
        reveal.hidden = false;
      } else {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
        const link = doc.createElement('a');
        link.href = url; link.download = exportName;
        doc.body.append(link); link.click(); link.remove();
        const revoke = () => URL.revokeObjectURL(url);
        lifecycle.timeout(revoke, 1000); lifecycle.add(revoke);
      }
      ui.toast(H.saved);
    } catch { ui.toast(H.saveFailed, 'bad'); }
    finally { save.disabled = false; }
  };

  return {
    el, reset,
    handle(frame: Record<string, unknown>): boolean {
      if (!['history', 'located', 'exported', 'historyError'].includes(String(frame.t))) return false;
      const id = String(frame.id);
      timers.get(id)?.dispose(); timers.delete(id);
      if (frame.t === 'historyError') {
        if (id === findId) { status.textContent = H.failed; findId = null; search.disabled = more.disabled = false; }
        if (id === locateId) { status.textContent = H.failed; locateId = null; }
        if (id === exportId) { exportId = null; save.disabled = false; ui.toast(H.saveFailed, 'bad'); }
      } else if (frame.t === 'history' && id === findId) {
        findId = null; search.disabled = more.disabled = false;
        const page = frame.matches as ChatItem[];
        if (matches.length && selected >= 0) selected += page.length;
        matches = [...page, ...matches];
        before = typeof frame.before === 'number' ? frame.before : undefined;
        snapshot = typeof frame.snapshot === 'number' ? frame.snapshot : undefined;
        more.hidden = frame.more !== true;
        results.replaceChildren();
        matches.forEach((item, index) => {
          const button = ui.button('', { onClick: () => select(index) });
          button.classList.add('chat-history-result');
          button.setAttribute('aria-pressed', String(index === selected));
          button.append(ui.h('time', null, new Date(item.ts).toLocaleString()), ui.h('span', null, excerpt(item)));
          results.append(button);
        });
        status.textContent = matches.length ? (selected >= 0 ? `${selected + 1} / ${matches.length}` : `${matches.length}`) : H.empty;
        navigation();
        if (selected < 0 && matches.length) select(0);
      } else if (frame.t === 'located' && id === locateId) {
        locateId = null;
        actions.locate(frame.items as ChatItem[], frame.cursor as number);
      } else if (frame.t === 'exported' && id === exportId) {
        exportId = null;
        void download(frame.text as string);
      }
      return true;
    },
  };
}
