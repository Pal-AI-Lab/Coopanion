/**
 * Inputs that can start a program or run a command. Each one is put to the person on its own before
 * it is sent, whatever the turn's permission already allows (cua.ts): a chord with the Windows or
 * Super key (on macOS, where that key is Command and in every shortcut, only Command+Space), a
 * launcher shortcut, and typing or Enter while a terminal window is in front.
 */
import type { KeyCode } from './engine/keys.ts';

const WIN = 0x5B;
const ENTER = 0x0D;
/** Ctrl+Alt+T (a Linux terminal), Alt+F2 (a Linux run box), Ctrl+Shift+Esc (Task Manager). */
const LAUNCHERS = [[0x11, 0x12, 0x54], [0x12, 0x71], [0x11, 0x10, 0x1B]];
const COMMAND_SPACE = [WIN, 0x20];

/**
 * Terminals and shells by program name, lowercase and without `.exe`: what Windows and Linux report
 * for the process, the app name on macOS. Linux cuts a name at 15 characters (gnome-terminal-server).
 */
const TERMINALS = new Set([
  'cmd', 'powershell', 'powershell_ise', 'pwsh', 'windowsterminal', 'wt', 'conhost', 'openconsole', 'wsl', 'bash', 'mintty', 'putty',
  'terminal', 'iterm', 'iterm2', 'warp', 'ghostty', 'hyper', 'tabby', 'alacritty', 'kitty', 'wezterm', 'wezterm-gui',
  'gnome-terminal-', 'kgx', 'ptyxis', 'konsole', 'xterm', 'uxterm', 'urxvt', 'rxvt', 'st', 'foot', 'tilix', 'terminator',
  'xfce4-terminal', 'mate-terminal', 'lxterminal', 'qterminal', 'terminology', 'deepin-terminal', 'yakuake', 'guake',
]);

const same = (chord: KeyCode[], keys: number[]) => chord.length === keys.length && keys.every((vk) => chord.some((k) => k.vk === vk));

/** A chord in `chords` that can open a system menu or start a program on `platform`. */
export function launches(chords: KeyCode[][], platform: NodeJS.Platform): boolean {
  return chords.some((c) => LAUNCHERS.some((l) => same(c, l))
    || (platform === 'darwin' ? same(c, COMMAND_SPACE) : c.some((k) => k.vk === WIN)));
}

export function pressesEnter(chords: KeyCode[][]): boolean {
  return chords.some((c) => c.some((k) => k.vk === ENTER));
}

/** Whether the program `app` (ScreenInfo.foregroundApp) is a terminal or a shell. */
export function isTerminal(app: string | null | undefined): boolean {
  if (!app) return false;
  const name = app.toLowerCase().replace(/\.exe$/, '');
  return TERMINALS.has(name) || TERMINALS.has(name.slice(0, 15));
}
