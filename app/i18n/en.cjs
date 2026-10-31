// Text of the main process: the tray menu, the settings window's starting page, the notices when the
// Core exits, the dialog that takes back the data an update left behind, the dialogs that ask which data to use
// when none is beside the program, and the error box when the data directory cannot be written. Keys as in zh.cjs.
module.exports = {
  /** The line the settings window shows until the Core is up. */
  starting: 'Starting…',

  trayOpenSettings: 'Open settings',
  trayShowPet: 'Show pet',
  trayClickThrough: 'Let clicks pass through Coo',
  /** The tray icon's tooltip while clicks pass through Coo */
  trayClickThroughTip: 'Coopanion (clicks pass through Coo)',
  trayLaunchAtLogin: 'Start at login',
  trayRestart: 'Restart',
  trayQuit: 'Quit',

  /** The Core exited too often within 5 minutes and is not restarted; shown as a notification and in an error box. */
  coreFailed: (times, code, logFile) => `The Core exited ${times} times within 5 minutes (exit code ${code}) and is no longer restarted. If the app was just updated, choose Quit in the tray menu and open Coopanion again. Log: ${logFile}`,
  /** The Core's entry or tsx is still missing after every wait (the install did not finish), so the Core is not restarted; shown as a notification and in an error box. */
  coreIncomplete: (url, logFile) => `Coopanion's program files are incomplete, so the Core cannot start. Download the full installer from ${url} and install it into the same folder; your settings, API keys, prompts and memory are kept. Log: ${logFile}`,
  coreRestarting: (code) => `The Core exited unexpectedly (exit code ${code}); restarting in 3 seconds`,
  /** Another process holds the data directory's instance lock, so the Core did not start; shown as a notification and in an error box. */
  coreLocked: (pid, file) => `Another process${pid ? ` (PID ${pid})` : ''} is using Coopanion's data, so the Core did not start. Wait for it to exit or end it, then choose Restart in the tray menu. Lock file: ${file}`,
  /** None of the console ports could be listened on, so the Core did not start; shown as a notification and in an error box. */
  corePortsBusy: (from, to) => `The console ports ${from}–${to} are all taken, so the Core did not start. ${to - from + 1} copies of Coopanion may already be running, or other programs are using these ports. Quit one of them, then choose Restart in the tray menu.`,

  /** Asked once when an update moved the program and left the old data directory behind. */
  strandedMessage: 'Settings from before the update were found',
  strandedDetail: (stranded, parent) => `An earlier automatic update installed Coopanion where it is now. The settings, API keys, prompts and memory from before that update are still in:\n${stranded}\n\n`
    + `Switching back renames the current data to data-replaced-<time> and keeps it in ${parent}; nothing is deleted. After "Keep the current ones" you will not be asked again.`,
  strandedRestore: 'Use the settings from before',
  strandedKeep: 'Keep the current ones',

  /** The data directory cannot be written (an install in a directory that needs administrator rights), so the app does not start; shown in an error box. */
  dataNotWritable: (dir, suggested) => `Coopanion cannot write to its data directory and did not start:\n${dir}\n\nRun the installer again and install into a directory your user account can write to, for example:\n${suggested}`,

  /** Asked when no data is beside the program and the record names data another program directory used (app/data-dir.cjs). */
  dataFoundMessage: 'Coopanion data from before was found',
  dataFoundDetail: (data, when, program) => `Coopanion is now installed in ${program}, which has no data yet. The data used before is in:\n${data}\nLast started: ${when}\n\n`
    + 'Inherit it to keep the settings, API keys, prompts and memory. Start a new one to begin again here; the data from before stays where it is and is not deleted.',
  dataInherit: 'Inherit this data',
  dataNew: 'Start a new one',
  /** The data the record names is gone: Retry, Choose folder, Start a new one, Quit. */
  dataMissingMessage: 'The data used before cannot be found',
  dataMissingDetail: (data, when, beside) => `The data used before was in:\n${data}\nLast started: ${when}\nThere is no Coopanion data there now.\n\n`
    + `If it is on a removable drive or a network location, connect it and click Retry. If it was moved, click Choose folder to find it. Start a new one to begin again here:\n${beside}`,
  dataRetry: 'Retry',
  dataChoose: 'Choose folder',
  dataQuit: 'Quit',
  dataChooseTitle: 'Choose the Coopanion data folder',
  dataChooseInvalid: (dir) => `This folder has no Coopanion data:\n${dir}\n\nChoose the install folder, or the data folder inside it.`,
};
