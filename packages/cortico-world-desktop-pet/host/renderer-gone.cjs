/** Logs each end of a window's renderer with its reason and exit code. */

/** An exit code as Windows writes it (0x80000003), elsewhere the number. */
function exitCodeText(code) {
  return process.platform === 'win32' ? `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : String(code);
}

/**
 * Gives `log` one line per end of a renderer of `contents`, saying when its page had not finished loading.
 * Each new renderer counts as not loaded until its page finishes loading.
 * @param {Pick<Electron.WebContents, 'on'>} contents
 * @param {{ name: string, log: (line: string) => void }} opts
 */
function watchRenderer(contents, { name, log }) {
  let loaded = false;
  contents.on('did-finish-load', () => { loaded = true; });
  contents.on('render-process-gone', (_e, { reason, exitCode }) => {
    const before = loaded ? '' : '，页面还没加载完';
    log(`${name}的渲染进程退出：${reason}（退出码 ${exitCodeText(exitCode)}）${before}`);
    loaded = false;
  });
}

module.exports = { watchRenderer };
