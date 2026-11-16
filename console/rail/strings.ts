import { pick } from '../base/language.ts';
import { S as zhHant } from './strings.zh-Hant.ts';
import { S as ja } from './strings.ja.ts';
import { S as ko } from './strings.ko.ts';
import { S as fr } from './strings.fr.ts';
import { S as de } from './strings.de.ts';
import { S as es419 } from './strings.es-419.ts';
import { S as ptBR } from './strings.pt-BR.ts';
import { S as it } from './strings.it.ts';
import { S as ru } from './strings.ru.ts';

const zh = {
  // index.ts
  navAria: '设置导航',
  groupWorlds: 'World',
  moduleInstancesAria: 'World 实例',

  runResume: '继续运行',
  runPause: '暂停运行',
  shutdownAria: '关机',
  finishing: '正在关闭…',
  shutdownTitle: '关机',
  shutdownBody: '进程将退出，连接将断开。',
  confirmShutdownTitle: '⚠ 关机',
  confirmShutdownAgainTitle: '⚠⚠ 确认关机？',
  confirmShutdownAgainBody: '停止运行并退出进程？',
  stepIncomplete: '未完成',
  doneShutdown: '已关机',
  resultLocalIncomplete: '本地关闭步骤未全部完成',
  resultExternalUnverified: '本地已关机，外部状态未确认',
  resultUnverified: '关闭步骤已执行，状态未确认',
  resultDefault: '关闭步骤已执行。',
  noReceipt: (msg: string) =>
    `未收到关闭结果（${msg}）；进程可能已退出。`,
  docTitle: (name: string) => `设置 · ${name}`,
  renameTitle: '点击重新命名',
  renameFailed: (msg: string) => `展示名没保存成：${msg}`,
  // avatar.ts
  changeAvatar: '更换 Coo 的头像',
  uploadAvatar: '上传并裁剪 Coo 的头像',
  unreadable: '无法读取这张图片',
  cropPreview: '头像裁剪预览',
  zoomAria: '头像缩放',
  zoom: '缩放',
  note: "拖动调整位置，滚轮或滑杆缩放。",
  cancel: '取消',
  save: '保存头像',
  cropTitle: '裁剪头像',
  noCanvas: '浏览器无法创建图片画布',
};

export const en: typeof zh = {
  // index.ts
  navAria: 'Settings navigation',
  groupWorlds: 'World',
  moduleInstancesAria: 'World instances',

  runResume: 'Resume',
  runPause: 'Pause',
  shutdownAria: 'Shut down',
  finishing: 'Shutting down…',
  shutdownTitle: 'Shut down',
  shutdownBody: 'The process will exit and the connection will close.',
  confirmShutdownTitle: '⚠ Shut down',
  confirmShutdownAgainTitle: '⚠⚠ Confirm shutdown?',
  confirmShutdownAgainBody: 'Stop running and exit the process?',
  stepIncomplete: 'incomplete',
  doneShutdown: 'Shut down',
  resultLocalIncomplete: 'Local shutdown steps incomplete',
  resultExternalUnverified: 'Shut down locally; external state unverified',
  resultUnverified: 'Shutdown steps executed; state unverified',
  resultDefault: 'Shutdown steps executed.',
  noReceipt: (msg: string) =>
    `No shutdown result received (${msg}); the process may have exited.`,
  docTitle: (name: string) => `Settings · ${name}`,
  renameTitle: 'Click to rename',
  renameFailed: (msg: string) => `Display name not saved: ${msg}`,
  // avatar.ts
  changeAvatar: "Change Coo's avatar",
  uploadAvatar: "Upload and crop Coo's avatar",
  unreadable: 'Could not read this image',
  cropPreview: 'Avatar crop preview',
  zoomAria: 'Avatar zoom',
  zoom: 'Zoom',
  note: "Drag to reposition; scroll or use the slider to zoom.",
  cancel: 'Cancel',
  save: 'Save avatar',
  cropTitle: 'Crop avatar',
  noCanvas: 'The browser could not create an image canvas',
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
