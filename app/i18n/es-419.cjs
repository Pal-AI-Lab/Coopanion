// Español (Latinoamérica): text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Iniciando…',

  trayOpenSettings: 'Abrir configuración',
  trayShowPet: 'Mostrar mascota',
  trayLaunchAtLogin: 'Abrir al iniciar sesión',
  trayRestart: 'Reiniciar',
  trayQuit: 'Salir',

  coreFailed: (times, code, logFile) => `El Core se cerró ${times} veces en 5 minutos (código de salida ${code}) y ya no se reinicia. Registro: ${logFile}`,
  coreRestarting: (code) => `El Core se cerró de forma inesperada (código de salida ${code}); se reinicia en 3 segundos`,

  strandedMessage: 'Se encontró la configuración de antes de la actualización',
  strandedDetail: (stranded, parent) => `Una actualización automática anterior instaló Coopanion donde está ahora. La configuración, las API Keys, los prompts y la memoria de antes de esa actualización siguen en:\n${stranded}\n\n`
    + `Al volver a ellos, los datos actuales se renombran como data-replaced-<hora> y se quedan en ${parent}; no se borra nada. Si eliges “Conservar la actual”, no se volverá a preguntar.`,
  strandedRestore: 'Usar la configuración de antes',
  strandedKeep: 'Conservar la actual',
};
