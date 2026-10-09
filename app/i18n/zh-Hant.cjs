// 繁體中文: text of the main process. Keys as in en.cjs; a key left out reads zh.cjs.
module.exports = {
  starting: '正在啟動…',

  trayOpenSettings: '開啟設定',
  trayShowPet: '顯示桌寵',
  trayLaunchAtLogin: '開機時自動啟動',
  trayRestart: '重新啟動',
  trayQuit: '結束',

  coreFailed: (times, code, logFile) => `Core 在 5 分鐘內結束了 ${times} 次（結束代碼 ${code}），已停止重試。記錄檔：${logFile}`,
  coreRestarting: (code) => `Core 意外結束（結束代碼 ${code}），3 秒後重新啟動`,

  strandedMessage: '找到更新前的設定',
  strandedDetail: (stranded, parent) => `之前的一次自動更新把 Coopanion 裝到了現在的位置，更新前的設定、API Key、提示詞和記憶還留在：\n${stranded}\n\n`
    + `換回後，現在這份會改名為 data-replaced-<時間>，留在 ${parent} 裡，不會刪除。選「繼續用現在的」之後不再詢問。`,
  strandedRestore: '換回更新前的設定',
  strandedKeep: '繼續用現在的',
};
