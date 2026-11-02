/**
 * 「表情决策」, a section of the 「习惯」 page (features/pet): the desktop-pet World's decider mode, off by default.
 * The switch writes the World's decider config group through `/api/config` (only this key is sent); the decision
 * model and its timeout are on the World's page in the advanced mode. The API Key is saved through the pet panel's
 * `setDeciderKey` and never read back. The status line follows the pet panel's `state.decider`, which the page
 * reads with its polling.
 */
import { invokePanel, setConfig } from '../../base/api.ts';
import type { PageContext } from '../../base/page.ts';
import { S } from './strings.ts';

export const DECIDER_GROUP = 'world:desktop-pet:decider';
const PET_PAGE = 'world:desktop-pet';
const ENABLED = 'worlds.desktop-pet.decider.enabled';

/** The pet panel's `state.decider`: `failing` says why decisions fail (the breaker open, else the last failure until one is answered). */
export interface DeciderState { mode: 'classic' | 'decider'; enabled: boolean; failing: string | null }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Row = (label: string, control: HTMLElement, hint?: HTMLElement | string | readonly string[]) => HTMLElement;

/** The section follows saved values and the pet panel's state from the page's polling; `row` is the page's. */
export function deciderSection(ctx: PageContext, row: Row): { el: HTMLElement; sync(values: Record<string, unknown>, state: DeciderState | undefined): void } {
  const { ui, signal } = ctx;
  const opts = { signal };
  const sheet = ui.sheet({ title: S.title });
  const msg = ui.msgline('');
  const say = (text: string, bad = false) => { msg.textContent = text; msg.classList.toggle('bad', bad); };
  const status = ui.h('p', 'home-note');
  const failing = ui.h('p', 'home-note');
  const show = (d: DeciderState | undefined) => {
    if (!d) return;
    status.textContent = d.mode === 'decider' ? S.on : d.enabled ? S.needKey : S.off;
    failing.textContent = d.mode === 'decider' && d.failing ? S.lastFailed(d.failing) : '';
    failing.hidden = !failing.textContent;
  };

  // a switch that was not saved is put back by the next poll
  const enabled = ui.checkbox(S.enabled, {
    onChange: (on) => void setConfig(DECIDER_GROUP, { [ENABLED]: on }, opts).then(() => say(''), (err: unknown) => {
      if (!signal.aborted) say(S.saveFailed(errText(err)), true);
    }),
  });

  const key = ui.input();
  key.type = 'password';
  key.autocomplete = 'off';
  const saveKey = async () => {
    const value = key.value.trim();
    if (!value) return;
    try {
      const state = await invokePanel<{ decider?: DeciderState }>(PET_PAGE, 'pet', 'setDeciderKey', [value], opts);
      key.value = '';
      say(S.keySaved);
      show(state.decider);
    } catch (err) {
      if (!signal.aborted) say(S.saveFailed(errText(err)), true);
    }
  };
  key.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) void saveKey(); }, { signal });
  const keyBox = ui.h('div', 'companion-rangebox');
  keyBox.append(key, ui.button(S.keySave, { size: 'sm', onClick: () => void saveKey() }));

  sheet.body.append(
    row(S.title, enabled.el, [S.enabledHint, S.privacy]),
    row(S.key, keyBox, S.keyHint),
    row(S.status, status, failing),
    msg,
  );
  return {
    el: sheet.el,
    sync: (values, state) => {
      if (typeof values[ENABLED] === 'boolean') enabled.setChecked(values[ENABLED]);
      show(state);
    },
  };
}
