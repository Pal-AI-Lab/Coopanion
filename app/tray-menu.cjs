/**
 * The tray menu on Windows, drawn in a frameless window: the native menu keeps a column for check marks
 * and icons left of every label, and this menu has neither. It opens at the cursor inside the work area,
 * and closes on a pick, on Escape, or when it loses focus.
 *
 * `items` are `{ label, enabled?, click }` or `{ type: 'separator' }`. A pick comes back as the page's
 * title (the item's index), so the page needs no preload.
 */
const { BrowserWindow, nativeTheme, screen } = require('electron');

const ITEM_H = 30, SEP_H = 9, PAD = 4;
let open = null;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function page(items, dark) {
  const rows = items.map((it, i) => (it.type === 'separator' ? '<hr>'
    : `<a data-i="${i}" tabindex="${it.enabled === false ? '-1" class="off' : '0'}">${esc(it.label)}</a>`)).join('');
  const [bg, fg, off, hover, line, border] = dark
    ? ['#2b2b2b', '#f2f2f2', '#7a7a7a', '#3d3d3d', '#444', '#454545']
    : ['#f9f9f9', '#1a1a1a', '#a0a0a0', '#e9e9e9', '#e3e3e3', '#d6d6d6'];
  return `<!doctype html><meta charset="utf-8"><title>-</title><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;user-select:none}
body{box-sizing:border-box;padding:${PAD}px;background:${bg};border:1px solid ${border};border-radius:8px;
  font:13px "Segoe UI","Microsoft YaHei UI","Microsoft YaHei","Yu Gothic UI","Malgun Gothic",system-ui,sans-serif;color:${fg}}
a{display:block;height:${ITEM_H}px;line-height:${ITEM_H}px;padding:0 14px;border-radius:4px;color:inherit;text-decoration:none;white-space:nowrap;outline:none;cursor:default}
a:hover,a:focus{background:${hover}}
a.off{color:${off};pointer-events:none}
hr{height:1px;margin:${(SEP_H - 1) / 2}px 4px;border:0;background:${line}}
#w{display:inline-block}
</style><div id="w">${rows}</div><script>
const pick=(a)=>{if(a&&a.dataset.i)document.title=a.dataset.i;};
addEventListener('click',(e)=>pick(e.target.closest('a:not(.off)')));
addEventListener('keydown',(e)=>{if(e.key==='Escape')document.title='close';if(e.key==='Enter')pick(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){const a=[...document.querySelectorAll('a:not(.off)')];const i=a.indexOf(document.activeElement);
    a[(i+(e.key==='ArrowDown'?1:-1)+a.length)%a.length]?.focus();e.preventDefault();}});
</script>`;
}

/** Opens the menu at the cursor; an open one closes first. */
async function popupTrayMenu(items, icon) {
  open?.destroy();
  const height = items.reduce((h, it) => h + (it.type === 'separator' ? SEP_H : ITEM_H), 2 * PAD + 2);
  const win = new BrowserWindow({
    width: 200, height, show: false, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, transparent: true, backgroundColor: '#00000000', icon,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });
  open = win;
  win.on('closed', () => { if (open === win) open = null; });
  win.on('blur', () => { if (!win.isDestroyed()) win.destroy(); });
  win.webContents.on('page-title-updated', (e, title) => {
    e.preventDefault();
    // the page's own title on load is not a pick
    if (title !== 'close' && !/^\d+$/.test(title)) return;
    const item = items[Number(title)];
    if (!win.isDestroyed()) win.destroy();
    if (item && item.enabled !== false) item.click();
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page(items, nativeTheme.shouldUseDarkColors))}`);
  if (win.isDestroyed()) return;
  const width = Math.ceil(await win.webContents.executeJavaScript('document.getElementById("w").getBoundingClientRect().width')) + 2 * PAD + 2;
  if (win.isDestroyed()) return;
  // above and left of the cursor when the taskbar is at the bottom right, kept inside the work area
  const at = screen.getCursorScreenPoint(), area = screen.getDisplayNearestPoint(at).workArea;
  const x = at.x + width > area.x + area.width ? at.x - width : at.x;
  const y = at.y + height > area.y + area.height ? at.y - height : at.y;
  win.setBounds({
    x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height)),
    width, height,
  });
  win.show();
  win.focus();
}

module.exports = { popupTrayMenu };
