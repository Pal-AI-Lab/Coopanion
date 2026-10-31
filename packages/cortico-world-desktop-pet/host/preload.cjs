// The only surface the pet page gets from the window process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petHost', {
  /**
   * true: the window takes the mouse; false: clicks pass through to what is underneath.
   * The wish is a lease the window process keeps for itself (`host/mouse-lease.cjs`).
   */
  setInteractive: (on) => ipcRenderer.send('pet:interactive', !!on),
  focus: () => ipcRenderer.send('pet:focus'),
  /** Takes the keyboard from whatever window has it (a question's number keys), and gives it back. */
  grabFocus: () => ipcRenderer.send('pet:grabFocus'),
  releaseFocus: () => ipcRenderer.send('pet:releaseFocus'),
  hide: () => ipcRenderer.send('pet:hide'),
  /** Whether the window is shown, each time it is shown or hidden (by the menu, the tray or a fullscreen window). */
  onShown: (cb) => ipcRenderer.on('pet:shown', (_e, shown) => cb(!!shown)),
  /** Whether the window hides itself while a fullscreen window covers its display. */
  hideWhenFullscreen: (on) => ipcRenderer.send('pet:hideWhenFullscreen', !!on),
  /** Whether every click passes through the window (the tray's "click through"); the window process enforces it. */
  clickThrough: (on) => ipcRenderer.send('pet:clickThrough', !!on),
  openDress: () => ipcRenderer.send('pet:openDress'),
  /** The app language the page shows, for the window process's own words (the tray menu). */
  setLanguage: (code) => ipcRenderer.send('pet:language', String(code)),
  /** How far the window reaches below the floor (over a taskbar), in page pixels, each time it is placed. */
  onFloor: (cb) => ipcRenderer.on('pet:floor', (_e, below) => cb(Number(below) || 0)),
  /** Whether the window reads the other windows on its display: on only while the body on screen's pack asks for them. */
  watchWindows: (on) => ipcRenderer.send('pet:watchWindows', !!on),
  /** Those windows while they are read, each time they change: `{ ledges, windows }` in page pixels as web/figure-frame.js describes them, or null when they cannot be read. */
  onWindows: (cb) => ipcRenderer.on('pet:windows', (_e, desk) => cb(Array.isArray(desk?.ledges) && Array.isArray(desk?.windows) ? desk : null)),
  /** Where the cursor is, in page pixels, or null off the window: called every 15 ms on Windows, 10 times a second elsewhere. */
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, p) => cb(p)),
  /** Screen pixels behind `rect`, minus `skip` rects (page coordinates), as a flat [r, g, b, …]; null where the screen cannot be read. */
  sampleBackdrop: (rect, skip) => ipcRenderer.invoke('pet:sampleBackdrop', { rect, skip }),
  /** Moves the window to the display under the cursor: { x, y } the cursor and { w, h } the new size in page pixels, or null when it stays. */
  followCursor: () => ipcRenderer.invoke('pet:followCursor'),
  /** Whether the window streams to the World's OBS overlay; while it does, the page reports each frame with `overlayFrame`. */
  onOverlay: (cb) => ipcRenderer.on('pet:overlay', (_e, on) => cb(!!on)),
  /** A frame drawn: the part of the page the overlay shows (the pet and its bubbles) in page pixels or null, and when it was drawn (ms since the epoch). */
  overlayFrame: (rect, at) => ipcRenderer.send('pet:overlayFrame', rect, at),
});
