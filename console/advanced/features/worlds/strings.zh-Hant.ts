import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "我的 World",
  marketTab: "擴充市集",
  extensionList: "擴展清單",
  filterByName: "依名稱篩選",
  allStates: "全部狀態",
  noMatches: "沒有符合篩選的擴充。",
  newGroup: "新增分組",
  groupDefaultName: "新分組",
  renameGroup: "重新命名分組",
  deleteGroup: "刪除分組（保留擴充）",
  pendingNote: "以上擴充需重新啟動處理程序後生效。",
  packageInfo: "擴充資訊",
  updateAvailable: (from: string, to: string) => `有更新：${from} → ${to}`,
  hideFromSidebar: "側欄隱藏",
  showInSidebar: "側欄顯示",
  builtinAlwaysOn: "內建擴充始終開啟。",
  modeOff: "已停用",
  modeRunning: "僅執行",
  modeAttached: "已接入",

  navLabel: 'World 擴充',
  introTitle: 'World 擴充',
  prefixReloadFailed: (msg: string) => `前綴重新載入失敗: ${msg}`,
  toggleFailed: (msg: string) => `切換失敗: ${msg}`,
  reloadNowTitle: '現在重新載入 system 前綴?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `「${name}」已對 agent 重新可見。` : `「${name}」已對 agent 隱藏。`)
    + '\n\n事件投遞已依新狀態生效。重新載入會更新環境提示詞與工具宣告，保留既有對話。'
    + '取消後將在下次上下文交接或重開時更新。',
  deactivateTitle: (name: string) => `停用「${name}」?`,
  deactivateBody: (id: string) =>
    'World 會立即停止(它託管的外部處理程序與連線一併收尾),並寫回 config.json 的 '
    + `worlds.${id}.enabled=false。agent 的環境提示詞與工具隨即撤下;再次啟用依目前設定重建。`,
  restartTitle: (name: string) => `重新啟動「${name}」?`,
  restartBody: '停止並重建 World，套用標有「重新啟動 World 生效」的設定。託管處理程序與連線會停止後重新啟動。',
  missingReasonDefault: '無法載入這個 World。',
  activateWorld: '啟用 World',
  inactiveNoteManual: (id: string) => `本機有實作但沒裝配。要啟用,把 config.json 裡 worlds.${id}.enabled 修改為 true 後重新啟動。`,
  hideFromAgent: '對 agent 隱藏',
  showToAgent: '對 agent 顯示',
  restartWorld: '重新啟動 World',
  deactivateWorld: '停用 World',
  prefixPending: '前綴待重新載入',
  noWorlds: '沒有任何 World',
  listLoadFailed: (msg: string) => `World 清單載入失敗: ${msg}`,
  loading: '載入中…',
};
