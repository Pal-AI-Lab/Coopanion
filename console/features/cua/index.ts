/**
 * 「电脑操作」, a section of the 「习惯」 page (features/pet): the desktop-pet World's computer use in the
 * normal mode, in the page's rows (its label column, then the setting). Each row writes its key of the
 * computer-use config group through `/api/config` (only the keys shown here are sent). Yielding to the
 * person and screenshot sizes stay on the desktop-pet World's page in the advanced mode.
 *
 * Before computer use is first turned on here, or added to the pet's hover buttons (`confirmHoverButton`), a dialog
 * says what it risks; the yes is kept in the config (`risksConfirmed`), so neither asks again and the pet's computer
 * use button turns it on and off at once. Opened at `#/pet?cua=enable` (Coo's and the pet's button's way to the switch
 * before that), on this page already or not, the section shows the dialog at once, confirmed before or not.
 */

import { actionProblem } from '../../base/ui/problem.ts';
import { get, setConfig } from '../../base/api.ts';
import type { PageContext } from '../../base/page.ts';
import { buildHash, parseHash } from '../../base/router.ts';
import { confirm } from '../../base/ui/overlay.ts';
import { S } from './strings.ts';

export const CUA_GROUP = 'world:desktop-pet:cua';
const K = 'worlds.desktop-pet.cua';
const KEYS = {
  enabled: `${K}.enabled`,
  risksConfirmed: `${K}.risksConfirmed`,
  control: `${K}.control`,
  permission: `${K}.permission`,
  grantMinutes: `${K}.grantMinutes`,
} as const;
/** The World's PERMISSION_LEVELS, strictest first. */
const LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
type Level = (typeof LEVELS)[number];
/** The World's default `permission`, shown until Core gives one. */
const DEFAULT_LEVEL: Level = 'ask-once';
/** The `cua` query value that opens the dialog. */
const ENABLE = 'enable';

/** The dialog's text: `leadText` and the bold warning, the risks in red, the note under them. */
function riskBody(doc: Document, leadText: string): HTMLElement {
  const box = doc.createElement('div');
  const lead = doc.createElement('p');
  lead.className = 'cua-risk-lead';
  const danger = doc.createElement('strong');
  danger.textContent = S.riskDanger;
  lead.append(leadText, danger, S.riskAfter);
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
/**
 * The section follows saved values from the page's config polling; `row` is the page's. `confirmHoverButton` is for the
 * hover button picker: true at once once the risks were confirmed, else after a yes to the dialog, which it keeps.
 */
export function cuaSection(ctx: PageContext, row: Row): { el: HTMLElement; sync(values: Record<string, unknown>): void; confirmHoverButton(): Promise<boolean> } {
  const { ui, signal } = ctx;
  const opts = { signal };

  // where the rest of its settings are: the section's note, under its title
  const sheet = ui.sheet({ title: S.title, desc: S.more });
  const problem = actionProblem(ui, sheet.el.ownerDocument, signal);

  const doc = sheet.el.ownerDocument;
  const saved: Record<string, unknown> = {};
  let confirming = false;
  const confirmed = () => saved[KEYS.risksConfirmed] === true;
  /** The dialog, one at a time; a yes is kept. */
  const askRisks = async (title: string, lead: string, ok: string): Promise<boolean> => {
    if (confirming) return false;
    confirming = true;
    let allowed: boolean;
    try { allowed = await confirm({ doc, host: doc.body, signal }, { title, body: riskBody(doc, lead), ok }); }
    finally { confirming = false; }
    if (allowed) await save(KEYS.risksConfirmed, true);
    // a yes that could not be kept counts as none: the save's problem shows by the switch
    return allowed && confirmed();
  };
  /** Asks with the dialog; a yes turns computer use on. */
  const turnOn = async () => {
    if (!await askRisks(S.riskTitle, S.riskLead, S.riskOk)) {
      enabled.setChecked(saved[KEYS.enabled] === true);
      return;
    }
    enabled.setChecked(true);
    await save(KEYS.enabled, true);
  };
  const confirmHoverButton = async () => confirmed() || askRisks(S.hoverRiskTitle, S.hoverRiskLead, S.hoverRiskOk);
  const enabled = ui.checkbox(S.enabled, {
    onChange: (on) => void (!on ? save(KEYS.enabled, false) : confirmed() ? save(KEYS.enabled, true) : turnOn()),
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
  );

  const showLevel = (v: Level) => {
    levelHint.textContent = S.levelHints[v];
    grantRow.hidden = v !== 'ask-once';
  };

  const anchors: Record<string, HTMLElement> = { [KEYS.enabled]: enabled.el, [KEYS.risksConfirmed]: enabled.el, [KEYS.control]: control.el, [KEYS.permission]: level.el, [KEYS.grantMinutes]: grant };
  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(CUA_GROUP, { [key]: value }, opts);
      saved[key] = value;
    } catch (err) {
      if (!signal.aborted) { sync(saved); problem(anchors[key], S.saveFailed(errText(err))); }
    }
  };
  grant.addEventListener('change', () => {
    const n = Number(grant.value);
    if (!Number.isInteger(n) || n < GRANT_MIN || n > GRANT_MAX) { problem(grant, S.grantBad(GRANT_MIN, GRANT_MAX)); return; }
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
    if (!LEVELS.some((l) => l === saved[KEYS.permission])) { level.setValue(DEFAULT_LEVEL); showLevel(DEFAULT_LEVEL); }
    const view = doc.defaultView;
    if (!view) return;
    /** At `?cua=enable`: the dialog, unless computer use is on. */
    const takeEnable = () => {
      const route = parseHash(view.location.hash);
      if (route.query.cua !== ENABLE) return;
      // a reload of this page does not ask again
      view.history.replaceState(null, '', buildHash(route.segments));
      sheet.el.scrollIntoView({ block: 'start' });
      if (saved[KEYS.enabled] !== true) void turnOn();
    };
    takeEnable();
    // the settings window already on this page keeps it mounted when it is sent to `?cua=enable`
    view.addEventListener('hashchange', takeEnable, { signal });
  });
  return { el: sheet.el, sync, confirmHoverButton };
}
