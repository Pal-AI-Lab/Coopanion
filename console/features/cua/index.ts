/**
 * 「电脑操作」, a section of the 「习惯」 page (features/pet): the desktop-pet World's computer use in the
 * normal mode, in the page's rows (its label column, then the setting). Each row writes its key of the
 * computer-use config group through `/api/config` (only the keys shown here are sent). Yielding to the
 * person and screenshot sizes stay on the desktop-pet World's page in the advanced mode.
 *
 * Before computer use is first turned on here, a dialog says what it risks; once confirmed, this
 * settings window does not ask again. Opened at `#/pet?cua=enable` (Coo's way to the switch, while it
 * is off), the section shows the dialog at once, confirmed before or not.
 */
import { get, setConfig } from '../../base/api.ts';
import { createMemo } from '../../base/memo.ts';
import type { PageContext } from '../../base/page.ts';
import { buildHash, parseHash } from '../../base/router.ts';
import { confirm } from '../../base/ui/overlay.ts';
import { S } from './strings.ts';

export const CUA_GROUP = 'world:desktop-pet:cua';
const K = 'worlds.desktop-pet.cua';
const KEYS = {
  enabled: `${K}.enabled`,
  control: `${K}.control`,
  permission: `${K}.permission`,
  grantMinutes: `${K}.grantMinutes`,
} as const;
/** The World's PERMISSION_LEVELS, strictest first. */
const LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
type Level = (typeof LEVELS)[number];
/** Remembers that the risks were confirmed once. */
const memo = createMemo('coopanion.cua.');
const RISKS_SEEN = 'risksSeen';
/** The `cua` query value that opens the dialog. */
const ENABLE = 'enable';

/** The dialog's text: the lead with its bold warning, the risks in red, the note under them. */
function riskBody(doc: Document): HTMLElement {
  const box = doc.createElement('div');
  const lead = doc.createElement('p');
  lead.className = 'cua-risk-lead';
  const danger = doc.createElement('strong');
  danger.textContent = S.riskDanger;
  lead.append(S.riskLead, danger, S.riskAfter);
  const list = doc.createElement('ul');
  list.className = 'cua-risks';
  for (const risk of S.risks) {
    const item = doc.createElement('li');
    item.textContent = risk;
    list.append(item);
  }
  const note = doc.createElement('p');
  note.className = 'cua-risk-note';
  note.textContent = S.riskNote;
  box.append(lead, list, note);
  return box;
}

/** The bounds of `grantMinutes` in the World's config group. */
const GRANT_MIN = 1;
const GRANT_MAX = 1440;

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** One row of the 「习惯」 page: the label column, the setting, an optional note under it. */
type Row = (label: string, control: HTMLElement, hint?: HTMLElement | string) => HTMLElement;
/** The section follows saved values from the page's config polling; `row` is the page's. */
export function cuaSection(ctx: PageContext, row: Row): { el: HTMLElement; sync(values: Record<string, unknown>): void } {
  const { ui, signal } = ctx;
  const opts = { signal };

  // where the rest of its settings are: the section's note, under its title
  const sheet = ui.sheet({ title: S.title, desc: S.more });
  const msg = ui.msgline('');
  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.classList.toggle('bad', bad);
  };

  const doc = sheet.el.ownerDocument;
  const saved: Record<string, unknown> = {};
  let confirming = false;
  /** Asks with the dialog; a yes turns computer use on and is remembered. */
  const turnOn = async () => {
    if (confirming) return;
    confirming = true;
    let allowed: boolean;
    try { allowed = await confirm({ doc, host: doc.body, signal }, { title: S.riskTitle, body: riskBody(doc), ok: S.riskOk }); }
    finally { confirming = false; }
    if (!allowed) {
      enabled.setChecked(saved[KEYS.enabled] === true);
      return;
    }
    memo.set(RISKS_SEEN, true);
    enabled.setChecked(true);
    await save(KEYS.enabled, true);
  };
  const enabled = ui.checkbox(S.enabled, {
    onChange: (on) => void (!on ? save(KEYS.enabled, false) : memo.get(RISKS_SEEN, false) ? save(KEYS.enabled, true) : turnOn()),
  });
  const control = ui.checkbox(S.control, { onChange: (on) => void save(KEYS.control, on) });
  const levelHint = ui.h('p', 'home-note');
  const level = ui.segmented(LEVELS.map((value) => ({ value, label: S.levels[value] })), {
    size: 'sm',
    onSelect: (v) => { showLevel(v as Level); void save(KEYS.permission, v); },
  });
  const grant = ui.input({ type: 'number' });
  grant.min = String(GRANT_MIN);
  grant.max = String(GRANT_MAX);
  grant.step = '1';
  const grantBox = ui.h('div', 'companion-rangebox');
  grantBox.append(grant, ui.h('span', 'companion-rangeval', S.grantSuffix));

  const grantRow = row(S.grant, grantBox);
  sheet.body.append(
    row(S.enabledLabel, enabled.el),
    row(S.controlLabel, control.el, S.controlHint),
    row(S.permission, level.el, levelHint),
    grantRow,
    msg,
  );

  const showLevel = (v: Level) => {
    levelHint.textContent = S.levelHints[v];
    grantRow.hidden = v !== 'ask-once';
  };

  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(CUA_GROUP, { [key]: value }, opts);
      saved[key] = value;
      say('');
    } catch (err) {
      if (!signal.aborted) { sync(saved); say(S.saveFailed(errText(err)), true); }
    }
  };
  grant.addEventListener('change', () => {
    const n = Number(grant.value);
    if (!Number.isInteger(n) || n < GRANT_MIN || n > GRANT_MAX) { say(S.grantBad(GRANT_MIN, GRANT_MAX), true); return; }
    void save(KEYS.grantMinutes, n);
  }, { signal });

  const sync = (values: Record<string, unknown>): void => {
    if (signal.aborted) return;
    Object.assign(saved, values);
    if (!confirming && typeof values[KEYS.enabled] === 'boolean') enabled.setChecked(values[KEYS.enabled] as boolean);
    if (typeof values[KEYS.control] === 'boolean') control.setChecked(values[KEYS.control] as boolean);
    const current = LEVELS.find((l) => l === values[KEYS.permission]);
    if (current) { level.setValue(current); showLevel(current); }
    if (typeof values[KEYS.grantMinutes] === 'number' && doc.activeElement !== grant) grant.value = String(values[KEYS.grantMinutes]);
  };

  void get<{ groups?: ConfigEntry[] }>('/api/config', opts).catch(() => null).then((config) => {
    if (signal.aborted) return;
    const values = config?.groups?.find((g) => g.group.id === CUA_GROUP)?.values ?? {};
    sync(values);
    const view = doc.defaultView;
    const route = view ? parseHash(view.location.hash) : null;
    if (view && route?.query.cua === ENABLE) {
      // a reload of this page does not ask again
      view.history.replaceState(null, '', buildHash(route.segments));
      sheet.el.scrollIntoView({ block: 'start' });
      if (values[KEYS.enabled] !== true) void turnOn();
    }
  });
  return { el: sheet.el, sync };
}
