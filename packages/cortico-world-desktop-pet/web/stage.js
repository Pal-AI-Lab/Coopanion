/**
 * The stage the pet stands on outside the desktop: the pet page in a browser tab (the settings window's
 * preview) and the dressing page's preview. The dotted wall answers the pointer (a soft light follows it,
 * the dots under it grow and take the pet's eye color; pet.css `.wall`), the floor carries a row of
 * taskbar-like icons, and a round button at the top left switches the pet between night and day
 * (`POST /api/prefs`, as the dressing page saves it).
 */
import { applyTheme } from './ui.js';

const line = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
/** Decoration only: what a taskbar usually holds. */
const DOCK = [
  '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5s1.1-6.2 3.5-8.5z"/>',
  '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  '<path d="M9 17.5V6.5l10-2v11"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  '<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
];

/** Radii of the light and of the lens that shows the grown dots, in pixels (pet.css sizes them the same). */
const GLOW = 280, LENS = 150;
/** How much of the way to the pointer the light moves each frame. */
const EASE = .18;

/**
 * Lights the wall `wall` under the pointer: a soft light and a round lens of bigger dots in the body's color (setGlow) follow it
 * (pet.css `.wall-glow`, `.wall-lens`). Both are layers of their own moved by `transform` only, eased frame by
 * frame, so the browser composites them instead of repainting the wall (and the pet on it) as the pointer moves.
 * The lens holds a dot grid moved the other way, so its dots stay on the wall's own dots. `area` takes the pointer
 * (the stage, which lies over the wall).
 */
export function lightWall(wall, area = wall) {
  wall.classList.add('wall');
  const layer = (cls) => { const e = document.createElement('div'); e.className = cls; e.setAttribute('aria-hidden', 'true'); return e; };
  const glow = layer('wall-glow'), lens = layer('wall-lens'), grid = layer('wall-lens-grid');
  lens.append(grid);
  wall.prepend(glow, lens);
  let x = 0, y = 0, tx = 0, ty = 0, lit = false, frame = 0;
  const place = () => {
    glow.style.transform = `translate3d(${x - GLOW}px, ${y - GLOW}px, 0)`;
    lens.style.transform = `translate3d(${x - LENS}px, ${y - LENS}px, 0)`;
    grid.style.transform = `translate3d(${LENS - x}px, ${LENS - y}px, 0)`;
  };
  const step = () => {
    x += (tx - x) * EASE; y += (ty - y) * EASE;
    if (Math.abs(tx - x) + Math.abs(ty - y) < .3) { x = tx; y = ty; frame = 0; } else frame = requestAnimationFrame(step);
    place();
  };
  area.addEventListener('pointermove', (e) => {
    const r = wall.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top;
    // coming in, the light starts where the pointer is instead of sliding over from where it left
    if (!lit) { x = tx; y = ty; place(); lit = true; wall.classList.add('wall-lit'); }
    if (!frame) frame = requestAnimationFrame(step);
  });
  area.addEventListener('pointerleave', () => { lit = false; wall.classList.remove('wall-lit'); });
}

/**
 * The light's color for the body on the stage (`pack` as /api/figures lists it, `skin` the pet's skin): Coo's eye
 * color; another pack's accent for the picked colors (its preset's, else the first picked option's that names one);
 * null when the pack names none, and the light takes the settings window's theme color (pet.css `--glow`).
 */
export function glowColor(pack, skin) {
  if (!pack || pack.id === 'coo') return 'var(--skin-eye)';
  const scheme = skin?.scheme || pack.presets?.[0]?.id || '';
  const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null);
  const preset = (pack.presets ?? []).find((p) => p.id === scheme);
  if (hex(preset?.accent)) return preset.accent;
  const parts = scheme.split('-');
  for (const axis of pack.axes ?? []) {
    const option = (axis.options ?? []).find((o) => parts.includes(o.id));
    if (hex(option?.accent)) return option.accent;
  }
  return null;
}

/** Colors the light on `wall` (glowColor's answer). */
export function setGlow(wall, color) {
  if (color) wall.style.setProperty('--glow', color);
  else wall.style.removeProperty('--glow');
}

/** Fills `floor` with the row of icons, centred. */
export function dressFloor(floor) {
  const row = document.createElement('div');
  row.className = 'floor-icons';
  row.setAttribute('aria-hidden', 'true');
  row.innerHTML = DOCK.map(line).join('');
  floor.append(row);
}

/**
 * The night/day button, top left of `parent`. `getTheme` gives the pet's theme now; the switch is saved
 * through the pet's server, whose answer comes back as prefs: `show(theme)` redraws the button then.
 */
export function modeButton(parent, getTheme, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stage-mode';
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const theme = getTheme() === 'dark' ? 'light' : 'dark';
    show(theme);
    onClick?.(theme);
    fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme }) }).catch(() => {});
  });
  const show = (theme) => applyTheme(theme, b);
  show(getTheme());
  parent.append(b);
  return { el: b, show };
}
