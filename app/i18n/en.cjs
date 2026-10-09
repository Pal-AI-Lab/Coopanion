// Text of the main process: the tray menu, the settings window's starting page, the notices when the
// Core exits, and the dialog that takes back the data an update left behind. Keys as in zh.cjs.
module.exports = {
  /** The line the settings window shows until the Core is up. */
  starting: 'Starting…',

  trayOpenSettings: 'Open settings',
  trayShowPet: 'Show pet',
  trayLaunchAtLogin: 'Start at login',
  trayRestart: 'Restart',
  trayQuit: 'Quit',

  /** The Core exited too often within 5 minutes and is not restarted; shown as a notification and in an error box. */
  coreFailed: (times, code, logFile) => `The Core exited ${times} times within 5 minutes (exit code ${code}) and is no longer restarted. Log: ${logFile}`,
  coreRestarting: (code) => `The Core exited unexpectedly (exit code ${code}); restarting in 3 seconds`,

  /** Asked once when an update moved the program and left the old data directory behind. */
  strandedMessage: 'Settings from before the update were found',
  strandedDetail: (stranded, parent) => `An earlier automatic update installed Coopanion where it is now. The settings, API keys, prompts and memory from before that update are still in:\n${stranded}\n\n`
    + `Switching back renames the current data to data-replaced-<time> and keeps it in ${parent}; nothing is deleted. After "Keep the current ones" you will not be asked again.`,
  strandedRestore: 'Use the settings from before',
  strandedKeep: 'Keep the current ones',
};
