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

/**
 * Lights the wall `wall` under the pointer: `--mx`, `--my` (where, in the wall's own pixels) and `--lit`
 * (0 to 1) on the element, which pet.css turns into the light and the grown dots. `area` takes the
 * pointer (the stage, which lies over the wall); `fixed` when the wall is the whole page.
 */
export function lightWall(wall, area = wall) {
  let shown = false;
  const at = (e) => {
    const r = wall.getBoundingClientRect();
    wall.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
    wall.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
  };
  area.addEventListener('pointermove', (e) => {
    // coming in, the light starts where the pointer is instead of sliding over from where it left
    if (!shown) { wall.classList.add('wall-jump'); at(e); void wall.offsetWidth; wall.classList.remove('wall-jump'); shown = true; }
    else at(e);
    wall.style.setProperty('--lit', '1');
  });
  area.addEventListener('pointerleave', () => { shown = false; wall.style.setProperty('--lit', '0'); });
  wall.classList.add('wall');
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
 * The night/day button, top left of `parent`. `getTheme` gives the pet's theme now; `onSwitch` hears the
 * new one at once. The switch is saved through the pet's server (or by `save`, when given), whose answer
 * comes back as prefs: `show(theme)` redraws the button then.
 */
export function modeButton(parent, getTheme, onSwitch, save = (theme) => fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme }) }).catch(() => {})) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stage-mode';
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const theme = getTheme() === 'dark' ? 'light' : 'dark';
    show(theme);
    onSwitch?.(theme);
    save(theme);
  });
  const show = (theme) => applyTheme(theme, b);
  show(getTheme());
  parent.append(b);
  return { el: b, show };
}
