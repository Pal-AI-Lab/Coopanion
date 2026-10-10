/**
 * The settings window's colours follow the pet's look. Coo wears Cortico's `mint`; each preset of a
 * figure pack that gives settings-window colours (`presets[].console` in its figure.json, the whale's
 * eight schemes among them) has a console scheme here, written into the deployment's `theme.json` as
 * custom schemes so 「配色方案」 on the 开始 page lists them too. The large surfaces stay neutral grey for every scheme; the brand colour goes to the
 * accent, the timeline's text colours and the charts.
 *
 * The window follows the pet while its scheme is `mint` or one of these. A scheme the person picked
 * under 「配色方案」, another built-in one or one of their own, stays until they pick one of
 * these again. The schemes are named in the app language when written; an app language change
 * writes them again.
 */
import { readDeploymentTheme, writeDeploymentTheme } from 'cortico/web/theme-store.ts';
import { defaultStoredTheme, normalizeStoredTheme, type ThemePalette, type ThemeScheme } from 'cortico/web/shared/theme.ts';
import { baseLanguage, type Language } from 'cortico/core/language.ts';
import type { FigurePack } from 'cortico-world-desktop-pet';
import { coreText } from './i18n/index.ts';

/** The scheme Coo wears: the app's default (`web.theme` in companion.ts). */
export const COO_SCHEME = 'mint';

interface Hues {
  /** accent: buttons, the active page, chart-1 */
  a: string;
  /** accent-2: the second accent and chart-2 */
  a2: string;
  /** on-accent: text on the accent, at least 4.5:1 against it */
  on: string;
  /** the brand colour as text on the sheet, at least 4.5:1: links, the timeline's tool results */
  t: string;
  /** chart-3 and chart-4 */
  c3: string;
  c4: string;
}

const NEUTRAL_LIGHT: ThemePalette = {
  paper: '#f5f5f6', 'paper-2': '#ececee', sheet: '#fbfbfc', 'sheet-2': '#f2f2f4', 'sheet-3': '#e8e8eb',
  ink: '#1b1b1f', 'ink-soft': '#5c5c62', 'ink-dim': '#8b8b91', line: '#e3e3e6', 'line-2': '#d0d0d4', 'line-strong': '#aeaeb3',
  ok: '#19815e', warn: '#96743b', danger: '#b45950',
  'agent-surface': '#f5f5f6', 'world-bg': '#f0f0f2', 'world-ink': '#4a4a50', 'bubble-bg': '#e7e7ea', 'bubble-ink': '#1f1f23',
  'chart-hit': '#19815e', 'chart-miss': '#96743b',
  'chart-5': '#b59564', 'chart-6': '#9b8071', 'chart-7': '#4a8f9a', 'chart-8': '#889460',
};

const NEUTRAL_DARK: ThemePalette = {
  paper: '#121214', 'paper-2': '#18181b', sheet: '#1e1e21', 'sheet-2': '#252528', 'sheet-3': '#2d2d31',
  ink: '#eaeaec', 'ink-soft': '#b1b1b6', 'ink-dim': '#838389', line: '#2a2a2e', 'line-2': '#39393e', 'line-strong': '#55555b',
  ok: '#76ca9f', warn: '#c4a372', danger: '#d18c83',
  'agent-surface': '#18181b', 'world-bg': '#1f1f22', 'world-ink': '#aeaeb3', 'bubble-bg': '#2d2d31', 'bubble-ink': '#e7e7ea',
  'chart-hit': '#76ca9f', 'chart-miss': '#c4a372',
  'chart-5': '#c4a372', 'chart-6': '#b69b8c', 'chart-7': '#76afb9', 'chart-8': '#a8b17e',
};

const palette = (neutral: ThemePalette, h: Hues): ThemePalette => ({
  ...neutral,
  accent: h.a, 'accent-2': h.a2, 'on-accent': h.on,
  'ink-blue': h.t, violet: h.t, 'tool-result': h.t,
  'chart-output': h.a, 'chart-1': h.a, 'chart-2': h.a2, 'chart-3': h.c3, 'chart-4': h.c4,
});

/** A pack's name in `language`, else in its fallback, else the first one given, else `fallback`. */
const nameIn = (n: Record<string, string> | undefined, fallback: string, language: Language) =>
  n?.[language] ?? n?.[baseLanguage(language)] ?? (n ? Object.values(n)[0] : undefined) ?? fallback;

/** The whale's ids from before packs (`coo-whale-<scheme>`) stay, so a theme.json written then still matches. */
const schemeId = (figure: string, preset: string) => (figure === 'whale' ? `coo-whale-${preset}` : `coo-fig-${figure}-${preset}`);
const isFigureScheme = (id: string) => id.startsWith('coo-whale-') || id.startsWith('coo-fig-');

/** A console scheme for each preset of each pack that gives settings-window colours (`presets[].console`). */
export function figureSchemes(packs: readonly FigurePack[], language: Language = 'zh'): ThemeScheme[] {
  const t = coreText(language).scheme;
  return packs.flatMap((pack) => {
    const figure = nameIn(pack.manifest.name, pack.id, language);
    return pack.manifest.presets.filter((p) => p.console).map((p) => {
      const preset = nameIn(p.name, p.id, language);
      return {
        id: schemeId(pack.id, p.id),
        name: t.name(figure, preset),
        note: t.note(figure, preset),
        palettes: { light: palette(NEUTRAL_LIGHT, p.console!.light), dark: palette(NEUTRAL_DARK, p.console!.dark) },
        custom: true,
      };
    });
  });
}

/** The console scheme for a pet look: Coo's, or the pack preset's (its first with colours for a pick that is not a preset). */
export function schemeForSkin(skin: { figure?: string; scheme?: string } | undefined, packs: readonly FigurePack[]): string {
  const pack = packs.find((p) => p.id === skin?.figure);
  const presets = pack?.manifest.presets.filter((p) => p.console) ?? [];
  if (!pack || !presets.length) return COO_SCHEME;
  return schemeId(pack.id, (presets.find((p) => p.id === skin?.scheme) ?? presets[0]!).id);
}

/**
 * Brings `<deployDir>/theme.json` in line with the pet's look: the packs' schemes as they are now,
 * and the selection per the rule at the top. Writes only when something changed.
 */
export function followPetLook(deployDir: string, skin: { figure?: string; scheme?: string } | undefined, packs: readonly FigurePack[], language: Language = 'zh'): void {
  const state = readDeploymentTheme(deployDir).state ?? { ...defaultStoredTheme(), selectedId: COO_SCHEME };
  const follows = state.selectedId === COO_SCHEME || isFigureScheme(state.selectedId);
  const next = normalizeStoredTheme({
    ...state,
    selectedId: follows ? schemeForSkin(skin, packs) : state.selectedId,
    custom: [...state.custom.filter((s) => !isFigureScheme(s.id)), ...figureSchemes(packs, language)],
  });
  if (JSON.stringify(next) !== JSON.stringify(state)) writeDeploymentTheme(deployDir, next);
}
