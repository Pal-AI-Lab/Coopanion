// 日本語: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: '起動しています…',

  trayOpenSettings: '設定を開く',
  trayShowPet: 'ペットを表示',
  trayLaunchAtLogin: 'ログイン時に起動',
  trayRestart: '再起動',
  trayQuit: '終了',

  coreFailed: (times, code, logFile) => `Core が 5 分以内に ${times} 回終了したため（終了コード ${code}）、再起動を停止しました。ログ：${logFile}`,
  coreRestarting: (code) => `Core が予期せず終了しました（終了コード ${code}）。3 秒後に再起動します`,

  strandedMessage: '更新前の設定が見つかりました',
  strandedDetail: (stranded, parent) => `以前の自動更新で、Coopanion が現在の場所にインストールされました。その更新より前の設定、API Key、プロンプト、記憶は次の場所に残っています：\n${stranded}\n\n`
    + `元に戻すと、現在のデータは data-replaced-<時刻> に名前が変わり、${parent} に残ります。削除されるものはありません。「今の設定を使い続ける」を選ぶと、今後は確認しません。`,
  strandedRestore: '更新前の設定に戻す',
  strandedKeep: '今の設定を使い続ける',
};
