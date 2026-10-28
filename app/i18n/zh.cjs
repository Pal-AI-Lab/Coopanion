// 主进程的文字:托盘菜单、设置窗口的启动页、Core 退出的通知,找回更新前数据的对话框,程序旁边没有数据时询问用哪份数据的对话框,以及数据目录写不进去时的错误框。
module.exports = {
  /** 设置窗口在 Core 起来之前显示的一行字 */
  starting: '正在启动…',

  trayOpenSettings: '打开设置',
  trayShowPet: '显示桌宠',
  trayLaunchAtLogin: '开机自动启动',
  trayRestart: '重新启动',
  trayQuit: '退出',

  /** Core 在 5 分钟内退出太多次,不再重启;系统通知和错误框里显示 */
  coreFailed: (times, code, logFile) => `Core 在 5 分钟内退出了 ${times} 次（退出码 ${code}），已停止重试。如果刚刚更新过，请从托盘菜单选择「退出」，再重新打开 Coopanion。日志：${logFile}`,
  /** 等过所有重试后 Core 的入口或 tsx 仍不在磁盘上(安装没有完成),不再重启;系统通知和错误框里显示 */
  coreIncomplete: (url, logFile) => `Coopanion 的程序文件不完整，Core 无法启动。请从 ${url} 下载完整的安装包，安装到原来的文件夹；设置、API Key、提示词和记忆都会保留。日志：${logFile}`,
  coreRestarting: (code) => `Core 意外退出（退出码 ${code}），3 秒后重启`,
  /** 另一个进程占着数据目录的实例锁,Core 没有启动;系统通知和错误框里显示 */
  coreLocked: (pid, file) => `另一个进程${pid ? `（PID ${pid}）` : ''}正在使用 Coopanion 的数据，Core 没有启动。等它退出或手动结束它，再从托盘菜单选「重新启动」。锁文件：${file}`,
  /** 控制台试过的端口都监听不了,Core 没有启动;系统通知和错误框里显示 */
  corePortsBusy: (from, to) => `控制台端口 ${from}–${to} 都被占用，Core 没有启动。可能已经有 ${to - from + 1} 只 Coopanion 在运行，或者别的程序占用了这些端口。关掉其中一只或那个程序，再从托盘菜单选择「重新启动」。`,

  /** 一次自动更新把程序挪了位置,旧的数据目录还留在原处时问一次 */
  strandedMessage: '找到更新前的设置',
  strandedDetail: (stranded, parent) => `之前的一次自动更新把 Coopanion 装到了现在的位置，更新前的设置、API Key、提示词和记忆还留在：\n${stranded}\n\n`
    + `换回后，现在这份改名为 data-replaced-<时间>，留在 ${parent} 里，不会删除。选「继续使用当前设置」以后不再询问。`,
  strandedRestore: '换回更新前的设置',
  strandedKeep: '继续使用当前设置',

  /** 数据目录写不进去(装在了需要管理员权限的目录),应用不启动;错误框里显示 */
  dataNotWritable: (dir, suggested) => `Coopanion 无法写入数据目录，没有启动：\n${dir}\n\n请重新运行安装器，安装到当前用户有权写入的目录，例如：\n${suggested}`,

  /** 程序旁边没有数据、记录里有另一个程序目录用过的数据时问一次(app/data-dir.cjs) */
  dataFoundMessage: '找到之前的 Coopanion 数据',
  dataFoundDetail: (data, when, program) => `Coopanion 现在装在 ${program}，这里还没有数据。之前使用的数据在：\n${data}\n最后一次启动：${when}\n\n`
    + '继承后，设置、API Key、提示词和记忆都接着用。新建一只会在现在的位置重新开始，之前的数据留在原处，不会删除。',
  dataInherit: '继承这份数据',
  dataNew: '新建一只',
  /** 记录里的数据不在了;「重试」「选择文件夹」「新建一只」「退出」 */
  dataMissingMessage: '找不到之前使用的数据',
  dataMissingDetail: (data, when, beside) => `之前使用的数据在：\n${data}\n最后一次启动：${when}\n现在那里没有 Coopanion 的数据。\n\n`
    + `数据在移动硬盘或网络位置上的话，连接后点击「重试」；挪到了别处的话，点击「选择文件夹」找到它。新建一只会在这里重新开始：\n${beside}`,
  dataRetry: '重试',
  dataChoose: '选择文件夹',
  dataQuit: '退出',
  dataChooseTitle: '选择 Coopanion 的数据文件夹',
  dataChooseInvalid: (dir) => `这个文件夹里没有 Coopanion 的数据：\n${dir}\n\n请选择安装目录，或安装目录下的 data 文件夹。`,
};
