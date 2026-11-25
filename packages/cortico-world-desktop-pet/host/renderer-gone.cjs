/**
 * Watches a window's renderer: each end of it is logged with its reason and exit code, and an end that looks
 * like the sandbox failing to start the renderer is reported to the caller.
 *
 * On some Windows builds a sandboxed renderer exits while it starts, before its first page has loaded
 * (a system DLL it loads on first use fails to load inside the sandbox), and the window stays blank. Starting
 * the app with `--no-sandbox` avoids it.
 */

/** The reasons a renderer that ended on its own reports; `clean-exit` and `killed` are not failures to start. */
const FAILED = new Set(['crashed', 'abnormal-exit', 'launch-failed', 'oom', 'integrity-failure']);

/** An exit code as Windows writes it (0x80000003), elsewhere the number. */
function exitCodeText(code, platform = process.platform) {
  return platform === 'win32' ? `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : String(code);
}

/** Whether a renderer that ended before its first page loaded, with the sandbox on, is the Windows sandbox failing to start it. */
function sandboxStartFailed({ platform, sandboxed, loaded, reason }) {
  return platform === 'win32' && sandboxed && !loaded && FAILED.has(reason);
}

/**
 * Watches the renderers of `contents`. `log` gets one line per renderer end; `onSandboxFailure` is called for
 * each end sandboxStartFailed accepts. Each new renderer counts as not loaded until its page finishes loading.
 * `sandboxed`: the app runs without `--no-sandbox`.
 * @param {Pick<Electron.WebContents, 'on'>} contents
 * @param {{ name: string, log: (line: string) => void, sandboxed: boolean, onSandboxFailure?: () => void, platform?: NodeJS.Platform }} opts
 */
function watchRenderer(contents, { name, log, sandboxed, onSandboxFailure, platform = process.platform }) {
  let loaded = false;
  contents.on('did-finish-load', () => { loaded = true; });
  contents.on('render-process-gone', (_e, { reason, exitCode }) => {
    const before = loaded ? '' : '，页面还没加载完';
    log(`${name}的渲染进程退出：${reason}（退出码 ${exitCodeText(exitCode, platform)}）${before}`);
    if (sandboxStartFailed({ platform, sandboxed, loaded, reason })) onSandboxFailure?.();
    loaded = false;
  });
}

module.exports = { exitCodeText, sandboxStartFailed, watchRenderer };
