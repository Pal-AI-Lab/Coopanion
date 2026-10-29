// 日本語: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: '起動しています…',

  trayOpenSettings: '設定を開く',
  trayShowPet: 'ペットを表示',
  trayLaunchAtLogin: 'ログイン時に起動',
  trayRestart: '再起動',
  trayQuit: '終了',

  coreFailed: (times, code, logFile) => `Core が 5 分以内に ${times} 回終了したため（終了コード ${code}）、再起動を停止しました。更新した直後の場合は、トレイメニューの「終了」を選んでから Coopanion をもう一度開いてください。ログ：${logFile}`,
  coreIncomplete: (url, logFile) => `Coopanion のプログラムファイルが欠けているため、Core を起動できません。${url} から完全なインストーラーをダウンロードし、元のフォルダーにインストールしてください。設定、API Key、プロンプト、記憶はそのまま残ります。ログ：${logFile}`,
  coreRestarting: (code) => `Core が予期せず終了しました（終了コード ${code}）。3 秒後に再起動します`,
  coreLocked: (pid, file) => `別のプロセス${pid ? `（PID ${pid}）` : ''}が Coopanion のデータを使用中のため、Core は起動しませんでした。そのプロセスが終わるのを待つか手動で終了してから、トレイメニューの「再起動」を選んでください。ロックファイル：${file}`,
  corePortsBusy: (from, to) => `コンソールのポート ${from}–${to} がすべて使用中のため、Core は起動しませんでした。Coopanion がすでに ${to - from + 1} つ動いているか、ほかのプログラムがこれらのポートを使っています。どれかを終了してから、トレイメニューの「再起動」を選んでください。`,

  strandedMessage: '更新前の設定が見つかりました',
  strandedDetail: (stranded, parent) => `以前の自動更新で、Coopanion が現在の場所にインストールされました。その更新より前の設定、API Key、プロンプト、記憶は次の場所に残っています：\n${stranded}\n\n`
    + `元に戻すと、現在のデータは data-replaced-<時刻> に名前が変わり、${parent} に残ります。削除されるものはありません。「今の設定を使い続ける」を選ぶと、今後は確認しません。`,
  strandedRestore: '更新前の設定に戻す',
  strandedKeep: '今の設定を使い続ける',

  dataNotWritable: (dir, suggested) => `Coopanion はデータフォルダーに書き込めないため、起動しませんでした：\n${dir}\n\nインストーラーをもう一度実行し、現在のユーザーが書き込めるフォルダーにインストールしてください。例：\n${suggested}`,

  dataFoundMessage: '以前の Coopanion のデータが見つかりました',
  dataFoundDetail: (data, when, program) => `Coopanion は現在 ${program} にインストールされていて、ここにはまだデータがありません。以前使っていたデータの場所：\n${data}\n最後の起動：${when}\n\n`
    + '引き継ぐと、設定、API Key、プロンプト、記憶をそのまま使えます。新しく始めると、今の場所で最初からになります。以前のデータは元の場所に残り、削除されません。',
  dataInherit: 'このデータを引き継ぐ',
  dataNew: '新しく始める',
  dataMissingMessage: '以前使っていたデータが見つかりません',
  dataMissingDetail: (data, when, beside) => `以前使っていたデータの場所：\n${data}\n最後の起動：${when}\n今はそこに Coopanion のデータがありません。\n\n`
    + `外付けドライブやネットワーク上にある場合は、接続してから「再試行」をクリックしてください。別の場所に移した場合は「フォルダーを選択」で指定してください。新しく始める場合は、ここで最初からになります：\n${beside}`,
  dataRetry: '再試行',
  dataChoose: 'フォルダーを選択',
  dataQuit: '終了',
  dataChooseTitle: 'Coopanion のデータフォルダーを選択',
  dataChooseInvalid: (dir) => `このフォルダーには Coopanion のデータがありません：\n${dir}\n\nインストールフォルダー、またはその中の data フォルダーを選んでください。`,
};
