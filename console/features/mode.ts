/**
 * 普通模式与高级模式。普通模式只有关于桌宠的几页(开始、桌宠、语音输入);高级模式再接上
 * Cortico 控制台的全部页面。选择存在设置窗口的 localStorage 里,下次打开还是它;读不到就是普通模式。
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
