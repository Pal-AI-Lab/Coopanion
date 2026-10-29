import { pick } from '../../../base/language.ts';
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
  myWorlds: "我的 World",
  marketTab: "扩展市场",
  extensionList: "扩展列表",
  filterByName: "按名字筛选",
  allStates: "全部状态",
  noMatches: "没有符合筛选的扩展。",
  newGroup: "新建分组",
  groupDefaultName: "新分组",
  renameGroup: "重命名分组",
  deleteGroup: "删除分组（扩展保留）",
  pendingNote: "以上扩展需重启进程后生效。",
  packageInfo: "扩展信息",
  updateAvailable: (from: string, to: string) => `有更新：${from} → ${to}`,
  hideFromSidebar: "左栏隐藏",
  showInSidebar: "左栏显示",
  builtinAlwaysOn: "内置扩展始终开启。",
  modeOff: "已停用",
  modeRunning: "仅运行",
  modeAttached: "已接入",

  navLabel: 'World 扩展',
  introTitle: 'World 扩展',
  prefixReloadFailed: (msg: string) => `前缀重载失败: ${msg}`,
  toggleFailed: (msg: string) => `切换失败: ${msg}`,
  reloadNowTitle: '现在重载 system 前缀?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `「${name}」已对 agent 重新可见。` : `「${name}」已对 agent 隐藏。`)
    + '\n\n事件投递已按新状态生效。重载会更新环境提示词与工具声明，保留已有对话。'
    + '取消后将在下次上下文交接或重开时更新。',
  deactivateTitle: (name: string) => `停用「${name}」?`,
  deactivateBody: (id: string) =>
    'World 会立即停止(它托管的外部进程与连接一并收尾),并写回 config.json 的 '
    + `worlds.${id}.enabled=false。agent 的环境提示词与工具随即撤下;再次激活按当前配置重建。`,
  restartTitle: (name: string) => `重启「${name}」?`,
  restartBody: "停止并重建 World，应用标有「重启 World 生效」的配置。托管进程与连接会停止后重新启动。",
  missingReasonDefault: "无法加载这个 World。",
  activateWorld: '激活 World',
  inactiveNoteManual: (id: string) => `本地有实现但没装配。要启用,把 config.json 里 worlds.${id}.enabled 修改为 true 后重启。`,
  hideFromAgent: '对 agent 隐藏',
  showToAgent: '对 agent 显示',
  restartWorld: '重启 World',
  deactivateWorld: '停用 World',
  prefixPending: '前缀待重载',
  noWorlds: '没有任何 World',
  listLoadFailed: (msg: string) => `World 清单加载失败: ${msg}`,
  loading: '加载中…',
};

export const en: typeof zh = {
  myWorlds: "My Worlds",
  marketTab: "Extension market",
  extensionList: "Extensions",
  filterByName: "Filter by name",
  allStates: "All states",
  noMatches: "No extensions match the filter.",
  newGroup: "New group",
  groupDefaultName: "New group",
  renameGroup: "Rename group",
  deleteGroup: "Delete group (keeps extensions)",
  pendingNote: "The extensions above take effect after the process restarts.",
  packageInfo: "Extension info",
  updateAvailable: (from: string, to: string) => `Update available: ${from} → ${to}`,
  hideFromSidebar: "Hide from sidebar",
  showInSidebar: "Show in sidebar",
  builtinAlwaysOn: "Built-in Worlds are always on.",
  modeOff: "Stopped",
  modeRunning: "Running only",
  modeAttached: "Connected",

  navLabel: 'World extensions',
  introTitle: 'World extensions',
  prefixReloadFailed: (msg: string) => `Prefix reload failed: ${msg}`,
  toggleFailed: (msg: string) => `Toggle failed: ${msg}`,
  reloadNowTitle: 'Reload the system prefix now?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `"${name}" is visible to the agent again.` : `"${name}" is now hidden from the agent.`)
    + '\n\nEvent delivery already follows the new state. Reloading updates the environment prompt and tool declarations and keeps existing conversation messages. '
    + 'If cancelled, they update at the next context handoff or restart.',
  deactivateTitle: (name: string) => `Deactivate "${name}"?`,
  deactivateBody: (id: string) =>
    'The World stops immediately (its managed external processes and connections are wound down), and '
    + `worlds.${id}.enabled=false is written back to config.json. The agent's environment prompt and tools are withdrawn right away; activating again rebuilds it from the current config.`,
  restartTitle: (name: string) => `Restart "${name}"?`,
  restartBody: "Stops and rebuilds the World to apply settings marked for World restart. Managed processes and connections stop and restart.",
  missingReasonDefault: "Could not load this World.",
  activateWorld: 'Activate World',
  inactiveNoteManual: (id: string) => `Implemented locally but not assembled. To enable it, set worlds.${id}.enabled to true in config.json and restart.`,
  hideFromAgent: 'Hide from agent',
  showToAgent: 'Show to agent',
  restartWorld: 'Restart World',
  deactivateWorld: 'Deactivate World',
  prefixPending: 'Prefix reload pending',
  noWorlds: 'No worlds',
  listLoadFailed: (msg: string) => `Failed to load World list: ${msg}`,
  loading: 'Loading…',
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
