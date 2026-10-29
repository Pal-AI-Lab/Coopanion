/**
 * 普通模式与高级模式，各自列出哪些页面见 console/index.ts 的文件头。选择存在设置窗口的 localStorage 里,下次打开还是它;读不到就是普通模式。
 */

export type ConsoleMode = 'normal' | 'advanced';

const KEY = 'companion.mode';

export function readMode(): ConsoleMode {
  try {
    return localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'normal';
  } catch {
    return 'normal';
  }
}

export function writeMode(mode: ConsoleMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch { /* 无痕/配额满:这次会话里仍按新模式显示 */ }
}

const REQUEST = 'companion-mode-request';

/** 页面请求换模式(比如「开始」页的「没找到？手动设置其他模型」):console/index.ts 收到后显示或隐藏左栏条目。 */
export function requestMode(mode: ConsoleMode): void {
  window.dispatchEvent(new CustomEvent<ConsoleMode>(REQUEST, { detail: mode }));
}

export function onModeRequest(cb: (mode: ConsoleMode) => void, signal: AbortSignal): void {
  window.addEventListener(REQUEST, (e) => cb((e as CustomEvent<ConsoleMode>).detail), { signal });
}
