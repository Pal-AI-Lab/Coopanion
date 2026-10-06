/** The pages' round buttons: icons (24 units, currentColor) and the theme switch. */
export const f = n => Math.round(n * 10) / 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// eight flat teeth around a hub
const gear = icon(`<path d="${Array.from({ length: 32 }, (_, i) => {
  const a = (i - .5) * Math.PI / 16, r = i % 4 < 2 ? 9.6 : 7.2;
  return `${i ? 'L' : 'M'}${f(12 + r * Math.cos(a))} ${f(12 + r * Math.sin(a))}`;
}).join('')}Z"/><circle cx="12" cy="12" r="3"/>`);
export const ICONS = {
  chat: icon('<path d="M6 4.5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-4.5 3.5v-3.5H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z"/>'),
  moon: icon('<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v1.6M12 19.6v1.6M2.8 12h1.6M19.6 12h1.6M5.5 5.5l1.1 1.1M17.4 17.4l1.1 1.1M5.5 18.5l1.1-1.1M17.4 6.6l1.1-1.1"/>'),
  play: icon('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: icon('<path d="M9 5.5v13M15 5.5v13"/>'),
  settings: gear,
  power: icon('<path d="M12 3.5v8M7.2 6.3a8 8 0 1 0 9.6 0"/>'),
  mic: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>'),
  // the same microphone struck through
  micOff: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M4 4l16 16"/>'),
  sound: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  // a T-shirt: the dressing page
  shirt: icon('<path d="M8.5 3.5 4 6l-1.5 4.5L6 12v8.5h12V12l3.5-1.5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>'),
  eye: icon('<path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="3"/>'),
  // a page that opens in the browser
  external: icon('<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
  eyeOff: icon('<path d="M3 12s3.2-6 9-6c1.6 0 3 .4 4.2 1M21 12s-3.2 6-9 6c-1.6 0-3-.4-4.2-1"/><path d="M9.9 14.1a3 3 0 0 1 4.2-4.2M4 4l16 16"/>'),
  // how much the pet walks on its own, as a gauge: low, middle, high
  roam_off: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16 7 13.2"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),
  roam_calm: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16V10"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),
  roam_free: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l5-2.8"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/><path d="M19.5 6.5l1.5-1.5M21 10h1.5"/>'),
  // activity above the pet; separate parts let each small icon move in its own way
  status_think: icon('<circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>'),
  status_read: icon('<path d="M6 3h9l4 4v14H6zM14 3v5h5"/><path class="scan" d="M9 11h7"/>'),
  status_browse: icon('<path d="M3 19V5h7l2 3h9v11"/><path class="flap" d="M3 19 5 10h17l-3 9z"/>'),
  status_search: icon('<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'),
  status_write: icon('<path d="m5 15 11-11 4 4L9 19l-5 1zM13 7l4 4M5 15l4 4"/>'),
  status_delete: icon('<path d="m6 8 1 13h10l1-13M10 11v6M14 11v6"/><path class="lid" d="M4 6h16M9 6V3h6v3"/>'),
  status_save: icon('<path d="M4 15v6h16v-6"/><path class="arrow" d="M12 3v12m-4-4 4 4 4-4"/>'),
  status_look: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle class="pupil" cx="12" cy="12" r="2.5"/>'),
  status_click: icon('<path d="m5 3 3 17 4-6 7-2z"/><path class="ripple" d="M3 7H1M8 2V1M2 2l1 1"/>'),
  status_scroll: icon('<rect x="5" y="2" width="14" height="20" rx="7"/><path class="wheel" d="M12 6v5m-2-3 2-2 2 2"/>'),
  status_type: icon('<path d="M3 20h18"/><g class="keycap"><rect x="5" y="4" width="14" height="12" rx="3"/><path d="M9 8h6m-3 0v5"/></g>'),
  status_wait: icon('<path d="M5 3h14M5 21h14M7 3v4l10 10v4M17 3v4L7 17v4M9 6h6M9 19h6"/>'),
  status_alarm: icon('<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M3 5l3-3M18 2l3 3M7 20l-2 2M17 20l2 2"/>'),
  status_work: gear,
};
/** Sets `theme` ('dark' | 'light') on the page; `button`, when given, shows the mode a click switches to. */
export function applyTheme(theme, button) {
  document.documentElement.dataset.theme = theme;
  if (!button) return;
  const toLight = theme === 'dark';
  button.innerHTML = toLight ? ICONS.sun : ICONS.moon;
  button.title = toLight ? '切到白天模式' : '切到夜间模式';
  button.setAttribute('aria-label', button.title);
}
