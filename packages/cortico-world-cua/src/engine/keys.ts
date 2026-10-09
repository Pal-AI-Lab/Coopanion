/**
 * Key names for `cua_key`: a sequence of chords separated by spaces, each chord keys joined
 * by `+` ("ctrl+s", "alt+f4", "ctrl+a delete"). Names are case-insensitive; letters, digits
 * and the US-layout punctuation keys stand for themselves. Virtual-key codes are Windows'.
 */
import { MODEL_TEXT, type ModelLanguage } from '../model-text.ts';

export interface KeyCode { vk: number; extended: boolean }

const NAMED: Record<string, KeyCode> = {};
const add = (names: string[], vk: number, extended = false) => { for (const n of names) NAMED[n] = { vk, extended }; };
add(['ctrl', 'control'], 0x11);
add(['shift'], 0x10);
add(['alt', 'option'], 0x12);
add(['win', 'windows', 'meta', 'super', 'cmd', 'command'], 0x5B, true);
add(['enter', 'return'], 0x0D);
add(['esc', 'escape'], 0x1B);
add(['tab'], 0x09);
add(['space'], 0x20);
add(['backspace'], 0x08);
add(['delete', 'del'], 0x2E, true);
add(['insert', 'ins'], 0x2D, true);
add(['home'], 0x24, true);
add(['end'], 0x23, true);
add(['pageup', 'pgup'], 0x21, true);
add(['pagedown', 'pgdn'], 0x22, true);
add(['left'], 0x25, true);
add(['up'], 0x26, true);
add(['right'], 0x27, true);
add(['down'], 0x28, true);
add(['capslock'], 0x14);
add(['printscreen', 'prtsc'], 0x2C, true);
add(['menu', 'apps', 'contextmenu'], 0x5D, true);
add(['volumeup'], 0xAF, true);
add(['volumedown'], 0xAE, true);
add(['volumemute', 'mute'], 0xAD, true);
add(['playpause'], 0xB3, true);
for (let i = 1; i <= 24; i++) add([`f${i}`], 0x6F + i);
const PUNCT: Record<string, number> = { ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE, '/': 0xBF, '`': 0xC0, '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE };
for (const [ch, vk] of Object.entries(PUNCT)) add([ch], vk);
add(['plus'], 0xBB);
add(['minus'], 0xBD);

export function keyCode(name: string): KeyCode | null {
  const n = name.trim().toLowerCase();
  if (NAMED[n]) return NAMED[n];
  if (/^[a-z]$/.test(n)) return { vk: n.toUpperCase().charCodeAt(0), extended: false };
  if (/^[0-9]$/.test(n)) return { vk: n.charCodeAt(0), extended: false };
  return null;
}

/** Parses "ctrl+a delete" into chords; the error, in the model-text language, names the first unknown key. */
export function parseKeys(spec: string, language: ModelLanguage = 'zh'): { chords: KeyCode[][] } | { error: string } {
  const t = MODEL_TEXT[language];
  const chords: KeyCode[][] = [];
  for (const part of spec.trim().split(/\s+/)) {
    if (!part) continue;
    // a lone "+" is the key itself; "ctrl++" is ctrl and plus
    const names = part === '+' ? ['plus'] : part.endsWith('++') ? [...part.slice(0, -2).split('+'), 'plus'] : part.split('+');
    const chord: KeyCode[] = [];
    for (const name of names) {
      const code = keyCode(name);
      if (!code) return { error: t.keyUnknown(name) };
      chord.push(code);
    }
    if (chord.length) chords.push(chord);
  }
  if (!chords.length) return { error: t.keyNone };
  return { chords };
}
