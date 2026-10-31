/**
 * macOS: while App Store is the active application the pet window sits at normal level, behind every
 * other window, and floats again once another application is active. App Store's payment sheet refuses
 * Touch ID while another process's window lies over it, a transparent click-through window included.
 * The active application comes from NSWorkspace and needs no permission.
 */
const APP_STORE = 'com.apple.AppStore';

/** The active application's bundle identifier, and sending a window to the back of its level. */
function openAppKit(koffi) {
  koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const getClass = objc.func('void *objc_getClass(const char *name)');
  const selector = objc.func('void *sel_registerName(const char *name)');
  const send = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
  const sendVoid = objc.func('objc_msgSend', 'void', ['void *', 'void *']);
  const sendArg = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'void *']);
  const text = objc.func('objc_msgSend', 'const char *', ['void *', 'void *']);
  const sel = Object.fromEntries(['sharedWorkspace', 'frontmostApplication', 'bundleIdentifier', 'UTF8String',
    'window', 'orderBack:', 'new', 'drain'].map((name) => [name, selector(name)]));
  const workspace = send(getClass('NSWorkspace'), sel.sharedWorkspace), pools = getClass('NSAutoreleasePool');
  return {
    frontmost() {
      const pool = send(pools, sel.new);
      try {
        const app = send(workspace, sel.frontmostApplication);
        const id = app && send(app, sel.bundleIdentifier);
        return id ? text(id, sel.UTF8String) : null;
      } finally { sendVoid(pool, sel.drain); }
    },
    /** `handle` is Electron's native window handle: the NSView of the window's content. */
    orderBack(handle) {
      sendArg(send(koffi.decode(handle, 'void *'), sel.window), sel['orderBack:'], null);
    },
  };
}

/** Null off macOS or when AppKit does not load; the window then keeps floating. `level` is the window's floating level. */
function createAppStoreRule({ window, level, platform = process.platform,
  workspace = platform === 'darwin' ? require('electron').systemPreferences : null,
  loadAppKit = () => openAppKit(require('koffi')),
  onError = (error) => console.warn('[pet:app-store]', error.message),
}) {
  if (platform !== 'darwin') return null;
  let appKit;
  try { appKit = loadAppKit(); } catch (error) { onError(error); return null; }
  let lowered = false;
  const apply = () => {
    const store = appKit.frontmost() === APP_STORE;
    if (store !== lowered) {
      lowered = store;
      window.setAlwaysOnTop(!store, level);
    }
    // Showing a window puts it at the front of its level; ordering a hidden window back would show it.
    if (lowered && window.isVisible()) appKit.orderBack(window.getNativeWindowHandle());
  };
  const subscription = workspace.subscribeWorkspaceNotification('NSWorkspaceDidActivateApplicationNotification', apply);
  window.on('show', apply);
  apply();
  return {
    stop() {
      workspace.unsubscribeWorkspaceNotification(subscription);
      window.off('show', apply);
    },
  };
}

module.exports = { APP_STORE, createAppStoreRule };
