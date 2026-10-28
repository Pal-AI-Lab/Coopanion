/** The saved automatic-update preference, forwarded to the Electron main process at load and on change. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { Language } from 'cortico/core/language.ts';
import { coreText } from './i18n/index.ts';

export const AUTO_UPDATE_KEY = 'companion.autoUpdate';
export const AUTO_UPDATE_DEFAULT = true;
export interface UpdateConfig { companion: { autoUpdate?: boolean } }

/** The app declares whether its build can install updates; other builds have no switch. */
export function autoUpdateProperties(language: Language): ConfigGroup['schema']['properties'] {
  if (process.env.COOPANION_SELF_UPDATE !== '1') return {};
  const s = coreText(language).settings.autoUpdate;
  return { [AUTO_UPDATE_KEY]: { type: 'boolean', title: s.title, description: s.description, 'x-hot': true } };
}

/** Config writes replace the leaf while keeping its parent object (`setByPath` in Cortico). */
export function watchAutoUpdate(config: UpdateConfig, onChange: (enabled: boolean) => void): void {
  let enabled = config.companion.autoUpdate ?? AUTO_UPDATE_DEFAULT;
  Object.defineProperty(config.companion, 'autoUpdate', {
    enumerable: true,
    configurable: true,
    get: () => enabled,
    set: (next: boolean) => {
      if (next === enabled) return;
      enabled = next;
      onChange(enabled);
    },
  });
  onChange(enabled);
}
