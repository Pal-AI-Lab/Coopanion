/**
 * The settings window's colours follow the pet's look. Coo wears Cortico's `mint`; each colour scheme
 * of the DeepSeek whale maid (packages/cortico-world-desktop-pet/web/whale/model.json) has a console
 * scheme here, written into the deployment's `theme.json` as custom schemes so the appearance page
 * lists them too. The large surfaces stay neutral grey for every scheme; the brand colour goes to the
 * accent, the timeline's text colours and the charts.
 *
 * The window follows the pet while its scheme is `mint` or one of these. A scheme the person picked
 * on the appearance page, another built-in one or one of their own, stays until they pick one of
 * these again.
 */
import { readDeploymentTheme, writeDeploymentTheme } from 'cortico/web/theme-store.ts';
import { defaultStoredTheme, normalizeStoredTheme, type ThemePalette, type ThemeScheme } from 'cortico/web/shared/theme.ts';

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

/**
 * Per whale scheme id, the light and the dark hues. The light accents of DeepSeek, Gemini, Qwen and
 * Kimi are a shade darker than the brand colour, which carries white text at only 3.6–4.3:1.
 */
const WHALE_HUES: ReadonlyArray<{ id: string; brand: string; label: string; light: Hues; dark: Hues }> = [
  {
    id: 'deepseek', brand: 'DeepSeek', label: '原版',
    light: { a: '#4562f5', a2: '#7b90fe', on: '#ffffff', t: '#3550d6', c3: '#8ea0c8', c4: '#8a8a90' },
    dark: { a: '#7b93ff', a2: '#a3b3ff', on: '#0d1640', t: '#9aabff', c3: '#8ea0c8', c4: '#9a9aa0' },
  },
  {
    id: 'harness', brand: 'DeepSeek Harness', label: '纯黑',
    light: { a: '#3f3f44', a2: '#4d6bfe', on: '#ffffff', t: '#2e2e33', c3: '#7b7b82', c4: '#a6a6ac' },
    dark: { a: '#d2d2d7', a2: '#7b93ff', on: '#151518', t: '#c8c8cd', c3: '#8c8c93', c4: '#64646a' },
  },
  {
    id: 'chatgpt', brand: 'ChatGPT', label: '银白',
    light: { a: '#2f2f2f', a2: '#8e8ea0', on: '#ffffff', t: '#202123', c3: '#10a37f', c4: '#b4b4c0' },
    dark: { a: '#ececf1', a2: '#a9a9b8', on: '#202123', t: '#d9d9e3', c3: '#19c37d', c4: '#6e6e80' },
  },
  {
    id: 'claude', brand: 'Claude', label: '赤陶',
    light: { a: '#d97757', a2: '#c2928a', on: '#1f0f08', t: '#a84e2f', c3: '#7b7974', c4: '#c6a58c' },
    dark: { a: '#e08a6c', a2: '#d9a497', on: '#1f0f08', t: '#eba287', c3: '#97958d', c4: '#c6a58c' },
  },
  {
    id: 'gemini', brand: 'Gemini', label: '四色',
    light: { a: '#1a73e8', a2: '#34a853', on: '#ffffff', t: '#1a5fd0', c3: '#ea4335', c4: '#f9ab00' },
    dark: { a: '#8ab4f8', a2: '#81c995', on: '#0b1a33', t: '#8ab4f8', c3: '#f28b82', c4: '#fdd663' },
  },
  {
    id: 'qwen', brand: '千问', label: '紫',
    light: { a: '#7560ea', a2: '#a294f5', on: '#ffffff', t: '#5b45d0', c3: '#b8a9e8', c4: '#8a8a90' },
    dark: { a: '#a596ff', a2: '#c2b8ff', on: '#1a1240', t: '#b3a6ff', c3: '#8f82c9', c4: '#9a9aa0' },
  },
  {
    id: 'kimi', brand: 'Kimi', label: '黑蓝',
    light: { a: '#0072ea', a2: '#1b1b1f', on: '#ffffff', t: '#0062cc', c3: '#6fa8e8', c4: '#8a8a90' },
    dark: { a: '#4da3ff', a2: '#9ccaff', on: '#001a38', t: '#6fb3ff', c3: '#d0d0d4', c4: '#6a8fb8' },
  },
  {
    id: 'minimax', brand: 'MiniMax', label: '玫红橙',
    light: { a: '#d92d7a', a2: '#f2762e', on: '#ffffff', t: '#b51f62', c3: '#e8a0c0', c4: '#8a8a90' },
    dark: { a: '#f0619e', a2: '#ff9a5c', on: '#2a0617', t: '#f58ab6', c3: '#c97aa0', c4: '#9a9aa0' },
  },
];

const schemeId = (whale: string) => `coo-whale-${whale}`;

export const WHALE_SCHEMES: readonly ThemeScheme[] = WHALE_HUES.map((w) => ({
  id: schemeId(w.id),
  name: `大肥鱼 · ${w.brand}`,
  note: `桌宠换成大肥鱼的「${w.label}」配色时自动换上`,
  palettes: { light: palette(NEUTRAL_LIGHT, w.light), dark: palette(NEUTRAL_DARK, w.dark) },
  custom: true,
}));

const WHALE_IDS = new Set(WHALE_SCHEMES.map((s) => s.id));

/** The console scheme for a pet look; a whale scheme this file does not know gets the original's. */
export function schemeForSkin(skin: { figure?: string; scheme?: string } | undefined): string {
  if (skin?.figure !== 'whale') return COO_SCHEME;
  const id = schemeId(skin.scheme ?? '');
  return WHALE_IDS.has(id) ? id : schemeId('deepseek');
}

/**
 * Brings `<deployDir>/theme.json` in line with the pet's look: the whale schemes as they are in this
 * version, and the selection per the rule at the top. Writes only when something changed.
 */
export function followPetLook(deployDir: string, skin: { figure?: string; scheme?: string } | undefined): void {
  const state = readDeploymentTheme(deployDir).state ?? { ...defaultStoredTheme(), selectedId: COO_SCHEME };
  const follows = state.selectedId === COO_SCHEME || WHALE_IDS.has(state.selectedId);
  const next = normalizeStoredTheme({
    ...state,
    selectedId: follows ? schemeForSkin(skin) : state.selectedId,
    custom: [...state.custom.filter((s) => !WHALE_IDS.has(s.id)), ...WHALE_SCHEMES],
  });
  if (JSON.stringify(next) !== JSON.stringify(state)) writeDeploymentTheme(deployDir, next);
}
