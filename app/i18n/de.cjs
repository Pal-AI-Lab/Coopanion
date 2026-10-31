// Deutsch: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Wird gestartet…',

  trayOpenSettings: 'Einstellungen öffnen',
  trayShowPet: 'Haustier anzeigen',
  trayClickThrough: 'Klicks durch Coo durchlassen',
  trayClickThroughTip: 'Coopanion (Klicks gehen durch Coo hindurch)',
  trayLaunchAtLogin: 'Bei Anmeldung starten',
  trayRestart: 'Neu starten',
  trayQuit: 'Beenden',

  coreFailed: (times, code, logFile) => `Der Core hat sich innerhalb von 5 Minuten ${times}-mal beendet (Exit-Code ${code}) und wird nicht mehr neu gestartet. Wenn die App gerade aktualisiert wurde, wähle „Beenden“ im Tray-Menü und öffne Coopanion erneut. Protokoll: ${logFile}`,
  coreIncomplete: (url, logFile) => `Dateien von Coopanion fehlen, deshalb kann der Core nicht starten. Lade das vollständige Installationsprogramm von ${url} herunter und installiere es in denselben Ordner; Einstellungen, API Keys, Prompts und Gedächtnis bleiben erhalten. Protokoll: ${logFile}`,
  coreRestarting: (code) => `Der Core hat sich unerwartet beendet (Exit-Code ${code}); Neustart in 3 Sekunden`,
  coreLocked: (pid, file) => `Ein anderer Prozess${pid ? ` (PID ${pid})` : ''} verwendet die Daten von Coopanion, daher wurde der Core nicht gestartet. Warte, bis er endet, oder beende ihn, und wähle dann „Neu starten“ im Tray-Menü. Sperrdatei: ${file}`,
  corePortsBusy: (from, to) => `Die Konsolen-Ports ${from}–${to} sind alle belegt, daher wurde der Core nicht gestartet. Vielleicht laufen schon ${to - from + 1} Kopien von Coopanion, oder andere Programme nutzen diese Ports. Beende eines davon und wähle dann „Neu starten“ im Tray-Menü.`,

  strandedMessage: 'Einstellungen von vor dem Update gefunden',
  strandedDetail: (stranded, parent) => `Ein früheres automatisches Update hat Coopanion an seinem jetzigen Ort installiert. Die Einstellungen, API Keys, Prompts und das Gedächtnis von vor diesem Update liegen noch in:\n${stranded}\n\n`
    + `Beim Zurückwechseln werden die aktuellen Daten in data-replaced-<Zeit> umbenannt und in ${parent} aufbewahrt; nichts wird gelöscht. Nach „Aktuelle behalten“ wirst du nicht mehr gefragt.`,
  strandedRestore: 'Einstellungen von vorher verwenden',
  strandedKeep: 'Aktuelle behalten',

  dataNotWritable: (dir, suggested) => `Coopanion kann nicht in seinen Datenordner schreiben und wurde nicht gestartet:\n${dir}\n\nFühre das Installationsprogramm erneut aus und installiere in einen Ordner, in den dein Benutzerkonto schreiben darf, zum Beispiel:\n${suggested}`,

  dataFoundMessage: 'Frühere Coopanion-Daten gefunden',
  dataFoundDetail: (data, when, program) => `Coopanion ist jetzt in ${program} installiert, dort gibt es noch keine Daten. Die bisher verwendeten Daten liegen in:\n${data}\nZuletzt gestartet: ${when}\n\n`
    + 'Wenn du sie übernimmst, bleiben Einstellungen, API Keys, Prompts und Gedächtnis erhalten. Neu anfangen startet hier von vorn; die bisherigen Daten bleiben, wo sie sind, und werden nicht gelöscht.',
  dataInherit: 'Diese Daten übernehmen',
  dataNew: 'Neu anfangen',
  dataMissingMessage: 'Die bisher verwendeten Daten wurden nicht gefunden',
  dataMissingDetail: (data, when, beside) => `Die bisher verwendeten Daten lagen in:\n${data}\nZuletzt gestartet: ${when}\nDort sind jetzt keine Coopanion-Daten.\n\n`
    + `Liegen sie auf einem externen Laufwerk oder im Netzwerk, verbinde es und klicke auf „Erneut versuchen“. Wurden sie verschoben, klicke auf „Ordner auswählen“, um sie zu finden. Neu anfangen startet hier von vorn:\n${beside}`,
  dataRetry: 'Erneut versuchen',
  dataChoose: 'Ordner auswählen',
  dataQuit: 'Beenden',
  dataChooseTitle: 'Coopanion-Datenordner auswählen',
  dataChooseInvalid: (dir) => `Dieser Ordner enthält keine Coopanion-Daten:\n${dir}\n\nWähle den Installationsordner oder den Ordner data darin.`,
};
