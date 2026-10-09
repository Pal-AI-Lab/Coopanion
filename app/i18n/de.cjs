// Deutsch: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Wird gestartet…',

  trayOpenSettings: 'Einstellungen öffnen',
  trayShowPet: 'Haustier anzeigen',
  trayLaunchAtLogin: 'Bei Anmeldung starten',
  trayRestart: 'Neu starten',
  trayQuit: 'Beenden',

  coreFailed: (times, code, logFile) => `Der Core hat sich innerhalb von 5 Minuten ${times}-mal beendet (Exit-Code ${code}) und wird nicht mehr neu gestartet. Protokoll: ${logFile}`,
  coreRestarting: (code) => `Der Core hat sich unerwartet beendet (Exit-Code ${code}); Neustart in 3 Sekunden`,

  strandedMessage: 'Einstellungen von vor dem Update gefunden',
  strandedDetail: (stranded, parent) => `Ein früheres automatisches Update hat Coopanion an seinem jetzigen Ort installiert. Die Einstellungen, API Keys, Prompts und das Gedächtnis von vor diesem Update liegen noch in:\n${stranded}\n\n`
    + `Beim Zurückwechseln werden die aktuellen Daten in data-replaced-<Zeit> umbenannt und in ${parent} aufbewahrt; nichts wird gelöscht. Nach „Aktuelle behalten“ wirst du nicht mehr gefragt.`,
  strandedRestore: 'Einstellungen von vorher verwenden',
  strandedKeep: 'Aktuelle behalten',
};
