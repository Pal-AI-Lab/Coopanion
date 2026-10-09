// 主进程的文字:托盘菜单、设置窗口的启动页、Core 退出的通知,以及找回更新前数据的对话框。
module.exports = {
  /** 设置窗口在 Core 起来之前显示的一行字 */
  starting: '正在启动…',

  trayOpenSettings: '打开设置',
  trayShowPet: '显示桌宠',
  trayLaunchAtLogin: '开机自动启动',
  trayRestart: '重新启动',
  trayQuit: '退出',

  /** Core 在 5 分钟内退出太多次,不再重启;系统通知和错误框里显示 */
  coreFailed: (times, code, logFile) => `Core 在 5 分钟内退出了 ${times} 次(退出码 ${code}),已停止重试。日志:${logFile}`,
  coreRestarting: (code) => `Core 意外退出(退出码 ${code}),3 秒后重启`,

  /** 一次自动更新把程序挪了位置,旧的数据目录还留在原处时问一次 */
  strandedMessage: '找到更新前的设置',
  strandedDetail: (stranded, parent) => `之前的一次自动更新把 Coopanion 装到了现在的位置,更新前的设置、API Key、提示词和记忆还留在:\n${stranded}\n\n`
    + `换回后,现在这份改名为 data-replaced-<时间>,留在 ${parent} 里,不会删除。选「继续用现在的」以后不再询问。`,
  strandedRestore: '换回更新前的设置',
  strandedKeep: '继续用现在的',
};
