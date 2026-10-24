/**
 * The voice panel's rows for the transcription service (engine `api`): address, model and API Key,
 * each saved through the panel method `setApi` on the field's change event (Enter, or leaving it
 * changed). The key is never sent back; its row shows whether one is saved.
 */
import type { WebUiInputOptions, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import type { PetText } from '../i18n/index.ts';
import './api-rows.css';

export interface ApiState { baseUrl: string; model: string; keySaved: boolean }
export interface ApiPatch { baseUrl?: string; model?: string; key?: string }
interface Row { row: HTMLElement; acts: HTMLElement; set(text: string, tone: 'on' | 'off' | 'busy' | 'bad', more?: string): void }

export function apiRows(ctx: WebUiPanelContext, t: PetText['panel'], statusRow: (name: string) => Row, save: (patch: ApiPatch) => void) {
  const { ui } = ctx;
  const field = (row: Row, opts: Pick<WebUiInputOptions, 'type' | 'placeholder'>, change: (value: string) => void) => {
    const input = ui.input({ ...opts, cls: 'pet-apifield', onChange: change });
    row.acts.append(input);
    return input;
  };
  const url = statusRow(t.apiUrl);
  const urlInput = field(url, { placeholder: 'https://…/v1' }, (baseUrl) => save({ baseUrl }));
  const model = statusRow(t.apiModel);
  const modelInput = field(model, {}, (value) => save({ model: value }));
  const key = statusRow(t.apiKey);
  const keyInput = field(key, { type: 'password' }, (value) => {
    if (!value.trim()) return;
    keyInput.value = '';
    save({ key: value });
  });
  keyInput.autocomplete = 'off';
  const rows = [url.row, model.row, key.row];
  return {
    rows,
    render(state: ApiState, shown: boolean) {
      for (const row of rows) row.style.display = shown ? '' : 'none';
      if (document.activeElement !== urlInput) urlInput.value = state.baseUrl;
      if (document.activeElement !== modelInput) modelInput.value = state.model;
      url.set('', state.baseUrl ? 'on' : 'off');
      model.set('', state.model ? 'on' : 'off');
      key.set(state.keySaved ? t.keySaved : t.keyMissing, state.keySaved ? 'on' : 'off');
    },
  };
}
