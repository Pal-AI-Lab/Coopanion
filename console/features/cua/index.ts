/**
 * 「电脑操作」, a section of the 「习惯」 page (features/pet): the cua World in the normal mode, in the
 * page's rows (its label column, then the setting). The first checkbox turns the World on and off through
 * `/api/worlds/activation`, as the advanced mode's World list does; the other rows write the cua
 * World's config group through `/api/config` (only the keys shown here are sent). Yielding to the
 * person and screenshot sizes stay on the World's own page in the advanced mode.
 */
import { get, post, setConfig } from '../../core/api.ts';
import type { FeatureContext } from '../feature.ts';
import { S } from './strings.ts';

const WORLD = 'cua';
const GROUP = 'world:cua';
const K = 'worlds.cua';
const KEYS = {
  control: `${K}.control`,
  permission: `${K}.permission`,
  grantMinutes: `${K}.grantMinutes`,
} as const;
/** The World's PERMISSION_LEVELS, strictest first. */
const LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
type Level = (typeof LEVELS)[number];
/** The bounds of `grantMinutes` in the World's config group. */
const GRANT_MIN = 1;
const GRANT_MAX = 1440;

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }
interface WorldEntry { id: string; status: 'active' | 'inactive' | 'missing' }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** One row of the 「习惯」 page: the label column, the setting, an optional note under it. */
export type Row = (label: string, control: HTMLElement, hint?: HTMLElement | string) => HTMLElement;
/** The section, its values read in the background; `row` is the page's. */
export function cuaSection(ctx: FeatureContext, row: Row): HTMLElement {
  const { ui, signal } = ctx;
  const opts = { signal };

  const sheet = ui.sheet({ title: S.title });
  const msg = ui.msgline('');
  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.classList.toggle('bad', bad);
  };

  const enabled = ui.checkbox(S.enabled, { onChange: (on) => void activate(on) });
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
    row(S.enabledLabel, enabled.el, S.enabledHint),
    row(S.controlLabel, control.el, S.controlHint),
    row(S.permission, level.el, levelHint),
    grantRow,
    ui.h('p', 'home-note', S.more),
    msg,
  );

  const showLevel = (v: Level) => {
    levelHint.textContent = S.levelHints[v];
    grantRow.hidden = v !== 'ask-once';
  };

  const save = async (key: string, value: string | number | boolean) => {
    try {
      await setConfig(GROUP, { [key]: value }, opts);
      say('');
    } catch (err) {
      if (!signal.aborted) say(S.saveFailed(errText(err)), true);
    }
  };
  const activate = async (on: boolean) => {
    const lock = ui.disable(enabled.input);
    try {
      await post('/api/worlds/activation', { id: WORLD, enabled: on }, opts);
      say('');
    } catch (err) {
      if (signal.aborted) return;
      enabled.setChecked(!on);
      say(S.saveFailed(errText(err)), true);
    } finally {
      lock.dispose();
    }
  };
  grant.addEventListener('change', () => {
    const n = Number(grant.value);
    if (!Number.isInteger(n) || n < GRANT_MIN || n > GRANT_MAX) { say(S.grantBad(GRANT_MIN, GRANT_MAX), true); return; }
    void save(KEYS.grantMinutes, n);
  }, { signal });

  void Promise.all([
    get<{ worlds?: WorldEntry[] }>('/api/worlds', opts).catch(() => null),
    get<{ groups?: ConfigEntry[] }>('/api/config', opts).catch(() => null),
  ]).then(([worlds, config]) => {
    if (signal.aborted) return;
    enabled.setChecked(worlds?.worlds?.find((w) => w.id === WORLD)?.status === 'active');
    const values = config?.groups?.find((g) => g.group.id === GROUP)?.values ?? {};
    if (typeof values[KEYS.control] === 'boolean') control.setChecked(values[KEYS.control] as boolean);
    const current = LEVELS.find((l) => l === values[KEYS.permission]) ?? 'ask-once';
    level.setValue(current);
    showLevel(current);
    if (typeof values[KEYS.grantMinutes] === 'number') grant.value = String(values[KEYS.grantMinutes]);
  });
  return sheet.el;
}
