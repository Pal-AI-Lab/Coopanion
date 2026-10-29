// 繁體中文: text of the main process. Keys as in en.cjs; a key left out reads zh.cjs.
module.exports = {
  starting: '正在啟動…',

  trayOpenSettings: '開啟設定',
  trayShowPet: '顯示桌寵',
  trayLaunchAtLogin: '開機時自動啟動',
  trayRestart: '重新啟動',
  trayQuit: '結束',

  coreFailed: (times, code, logFile) => `Core 在 5 分鐘內結束了 ${times} 次（結束代碼 ${code}），已停止重試。如果剛剛更新過，請從系統匣選單選擇「結束」，再重新開啟 Coopanion。記錄檔：${logFile}`,
  coreIncomplete: (url, logFile) => `Coopanion 的程式檔案不完整，Core 無法啟動。請從 ${url} 下載完整的安裝程式，安裝到原來的資料夾；設定、API Key、提示詞和記憶都會保留。記錄檔：${logFile}`,
  coreRestarting: (code) => `Core 意外結束（結束代碼 ${code}），3 秒後重新啟動`,
  coreLocked: (pid, file) => `另一個程序${pid ? `（PID ${pid}）` : ''}正在使用 Coopanion 的資料，Core 沒有啟動。等它結束或手動結束它，再從系統匣選單選擇「重新啟動」。鎖定檔：${file}`,
  corePortsBusy: (from, to) => `控制台連接埠 ${from}–${to} 都被佔用，Core 沒有啟動。可能已經有 ${to - from + 1} 隻 Coopanion 在執行，或其他程式佔用了這些連接埠。關掉其中一隻或那個程式，再從系統匣選單選擇「重新啟動」。`,

  strandedMessage: '找到更新前的設定',
  strandedDetail: (stranded, parent) => `之前的一次自動更新把 Coopanion 裝到了現在的位置，更新前的設定、API Key、提示詞和記憶還留在：\n${stranded}\n\n`
    + `換回後，現在這份會改名為 data-replaced-<時間>，留在 ${parent} 裡，不會刪除。選擇「繼續使用目前設定」之後不再詢問。`,
  strandedRestore: '換回更新前的設定',
  strandedKeep: '繼續使用目前設定',

  dataNotWritable: (dir, suggested) => `Coopanion 無法寫入資料目錄，沒有啟動：\n${dir}\n\n請重新執行安裝程式，安裝到目前使用者有權寫入的目錄，例如：\n${suggested}`,

  dataFoundMessage: '找到之前的 Coopanion 資料',
  dataFoundDetail: (data, when, program) => `Coopanion 現在安裝在 ${program}，這裡還沒有資料。之前使用的資料在：\n${data}\n最後一次啟動：${when}\n\n`
    + '繼承後，設定、API Key、提示詞和記憶都會接著使用。新建一隻會在目前的位置重新開始，之前的資料留在原處，不會刪除。',
  dataInherit: '繼承這份資料',
  dataNew: '新建一隻',
  dataMissingMessage: '找不到之前使用的資料',
  dataMissingDetail: (data, when, beside) => `之前使用的資料在：\n${data}\n最後一次啟動：${when}\n現在那裡沒有 Coopanion 的資料。\n\n`
    + `資料在外接硬碟或網路位置上的話，連接後點擊「重試」；移到了別處的話，點擊「選擇資料夾」找到它。新建一隻會在這裡重新開始：\n${beside}`,
  dataRetry: '重試',
  dataChoose: '選擇資料夾',
  dataQuit: '結束',
  dataChooseTitle: '選擇存放 Coopanion 資料的資料夾',
  dataChooseInvalid: (dir) => `這個資料夾裡沒有 Coopanion 的資料：\n${dir}\n\n請選擇安裝目錄，或安裝目錄下的 data 資料夾。`,
};
