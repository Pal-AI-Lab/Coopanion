/**
 * Console panel of the coopanion World: `alarms`, the alarms Coo has set for itself, soonest first,
 * each with a button that deletes it (the World tells Coo). Times are shown in the deployment's
 * time zone, as Coo set them. Built by scripts/stage.ts into build/panels/coopanion/.
 */
import type { WebUiClientBundle, WebUiPanel } from 'cortico/web/shared/client-panel.ts';
import type { Alarm } from '../alarms.ts';
import type { AlarmsState } from '../notice.ts';
import { panelText } from './strings.ts';
import './style.css';

/** `MM-DD HH:MM` in `timezone`, as Coo reads its alarms (`localLabel` in alarms.ts). */
function clock(timezone: string): { format(ms: number): string } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return {
    format: (ms) => {
      const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
      return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
    },
  };
}

const PAGE_SIZES = [15, 30, 60, 100];

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The unit `Intl.RelativeTimeFormat` says a span of `ms` in, rounded. */
function relative(format: Intl.RelativeTimeFormat, ms: number): string {
  const min = Math.round(ms / 60_000);
  if (Math.abs(min) < 60) return format.format(min, 'minute');
  const hours = Math.round(min / 60);
  if (Math.abs(hours) < 48) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}

const alarmsPanel: WebUiPanel = {
  mount(ctx) {
    const { ui, root } = ctx;
    const t = panelText(ctx.language);
    const card = ui.sheet({ title: t.title, desc: t.desc });
    root.appendChild(card.el);
    const msg = ui.msgline('');
    let query = '';
    let page = 0;
    let size = ctx.memo.get<number>('alarms.pageSize', 30);
    if (!PAGE_SIZES.includes(size)) size = 30;
    const search = ui.input({
      type: 'search',
      placeholder: t.search,
      onInput: (v) => { query = v.trim().toLowerCase(); page = 0; paint(); },
    });
    search.classList.add('coo-alarm-search');
    const sizeLabel = ui.h('label', 'coo-alarm-pagesize');
    sizeLabel.append(ui.h('span', null, t.perPage), ui.select({
      value: String(size),
      options: PAGE_SIZES.map(String),
      onChange: (v) => { size = Number(v); ctx.memo.set('alarms.pageSize', size); page = 0; paint(); },
    }));
    const bar = ui.rowbar();
    bar.classList.add('coo-alarm-bar');
    bar.append(search, ui.h('span', 'grow'), sizeLabel);
    const list = ui.h('div', 'coo-alarms');
    const pager = ui.rowbar();
    pager.classList.add('coo-alarm-pager');
    card.body.append(bar, list, pager, msg);

    const rel = new Intl.RelativeTimeFormat(ctx.language, { numeric: 'auto' });
    let state: AlarmsState | null = null;
    let shown = '';
    const render = (st: AlarmsState) => {
      // the relative time moves by the minute: redraw only when the list or that changes
      const key = JSON.stringify([st, Math.floor(Date.now() / 60_000)]);
      if (key === shown) return;
      shown = key;
      state = st;
      paint();
    };
    const paint = () => {
      pager.replaceChildren();
      if (!state) return;
      const at = clock(state.timezone);
      if (!state.alarms.length) { list.replaceChildren(ui.placeholder(t.empty)); return; }
      const matches = state.alarms.filter((alarm) => !query
        || alarm.note.toLowerCase().includes(query) || at.format(alarm.at).includes(query));
      if (!matches.length) { list.replaceChildren(ui.placeholder(t.noMatch)); return; }
      const pages = Math.max(1, Math.ceil(matches.length / size));
      page = Math.min(page, pages - 1);
      const from = page * size;
      const slice = matches.slice(from, from + size);
      list.replaceChildren(...slice.map((alarm) => row(alarm, at)));
      pager.append(ui.h('span', 'coo-alarm-dim', t.shown(from + 1, from + slice.length, matches.length)), ui.h('span', 'grow'));
      if (pages > 1) {
        const prev = ui.button(t.prevPage, { size: 'sm', onClick: () => { page -= 1; paint(); } });
        const next = ui.button(t.nextPage, { size: 'sm', onClick: () => { page += 1; paint(); } });
        prev.disabled = page === 0;
        next.disabled = page === pages - 1;
        pager.append(prev, ui.h('span', 'coo-alarm-pageof', t.pageOf(page + 1, pages)), next);
      }
    };
    const row = (alarm: Alarm, at: ReturnType<typeof clock>) => {
      const item = ui.h('div', 'coo-alarm');
      const head = ui.h('div', 'coo-alarm-head');
      head.append(ui.h('span', 'coo-alarm-time', at.format(alarm.at)));
      if (alarm.daily) head.append(ui.h('span', 'coo-alarm-daily', t.daily));
      head.append(ui.h('span', 'coo-alarm-rel', relative(rel, alarm.at - Date.now())));
      head.append(ui.h('span', 'coo-alarm-setat', `${t.setAt} ${at.format(alarm.setAt)}`));
      const remove = ui.h('button', 'coo-alarm-remove', t.remove);
      remove.type = 'button';
      remove.addEventListener('click', () => void cancel(alarm, at.format(alarm.at), remove));
      head.append(remove);
      item.append(head, ui.h('div', 'coo-alarm-note', alarm.note));
      return item;
    };
    const cancel = async (alarm: Alarm, when: string, btn: HTMLButtonElement) => {
      if (!await ui.confirm({ title: t.confirmTitle(when), body: alarm.note })) return;
      const lock = ui.disable(btn);
      try {
        render(await ctx.invoke<AlarmsState>('cancel', [alarm.id]));
        msg.textContent = '';
        ui.toast(t.removed);
      } catch (err) {
        lock.dispose();
        ui.toast(t.failed(errText(err)), 'bad');
      }
    };
    const refresh = async () => {
      try { render(await ctx.invoke<AlarmsState>('list')); msg.textContent = ''; } catch (err) { msg.textContent = t.loadFailed(errText(err)); }
    };
    void refresh();
    ctx.interval(() => void refresh(), 5000);
  },
};

const bundle: WebUiClientBundle = { panels: { alarms: alarmsPanel } };
export default bundle;
