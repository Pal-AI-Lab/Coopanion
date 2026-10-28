// Español (Latinoamérica): text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Iniciando…',

  trayOpenSettings: 'Abrir configuración',
  trayShowPet: 'Mostrar mascota',
  trayLaunchAtLogin: 'Abrir al iniciar sesión',
  trayRestart: 'Reiniciar',
  trayQuit: 'Salir',

  coreFailed: (times, code, logFile) => `El Core se cerró ${times} veces en 5 minutos (código de salida ${code}) y ya no se reinicia. Si la app se acaba de actualizar, elige «Salir» en el menú de la bandeja y vuelve a abrir Coopanion. Registro: ${logFile}`,
  coreIncomplete: (url, logFile) => `Faltan archivos de Coopanion, así que el Core no puede iniciarse. Descarga el instalador completo desde ${url} e instálalo en la misma carpeta; la configuración, las API Keys, los prompts y la memoria se conservan. Registro: ${logFile}`,
  coreRestarting: (code) => `El Core se cerró de forma inesperada (código de salida ${code}); se reinicia en 3 segundos`,
  coreLocked: (pid, file) => `Otro proceso${pid ? ` (PID ${pid})` : ''} está usando los datos de Coopanion, así que el Core no se inició. Espera a que termine o ciérralo, y luego elige «Reiniciar» en el menú de la bandeja. Archivo de bloqueo: ${file}`,
  corePortsBusy: (from, to) => `Los puertos de la consola ${from}–${to} están todos ocupados, así que el Core no se inició. Puede que ya haya ${to - from + 1} copias de Coopanion abiertas, u otros programas usan esos puertos. Cierra uno de ellos y luego elige «Reiniciar» en el menú de la bandeja.`,

  strandedMessage: 'Se encontró la configuración de antes de la actualización',
  strandedDetail: (stranded, parent) => `Una actualización automática anterior instaló Coopanion donde está ahora. La configuración, las API Keys, los prompts y la memoria de antes de esa actualización siguen en:\n${stranded}\n\n`
    + `Al volver a ellos, los datos actuales se renombran como data-replaced-<hora> y se quedan en ${parent}; no se borra nada. Si eliges “Conservar la actual”, no se volverá a preguntar.`,
  strandedRestore: 'Usar la configuración de antes',
  strandedKeep: 'Conservar la actual',

  dataNotWritable: (dir, suggested) => `Coopanion no puede escribir en su carpeta de datos y no se inició:\n${dir}\n\nVuelve a ejecutar el instalador e instala en una carpeta en la que tu cuenta pueda escribir, por ejemplo:\n${suggested}`,

  dataFoundMessage: 'Se encontraron datos anteriores de Coopanion',
  dataFoundDetail: (data, when, program) => `Coopanion ahora está instalado en ${program}, que todavía no tiene datos. Los datos que usabas están en:\n${data}\nÚltimo inicio: ${when}\n\n`
    + 'Si los heredas, conservas la configuración, las API Keys, los prompts y la memoria. Si empiezas de nuevo, Coopanion comienza desde cero aquí; los datos anteriores se quedan donde están y no se borran.',
  dataInherit: 'Heredar estos datos',
  dataNew: 'Empezar de nuevo',
  dataMissingMessage: 'No se encuentran los datos que usabas',
  dataMissingDetail: (data, when, beside) => `Los datos que usabas estaban en:\n${data}\nÚltimo inicio: ${when}\nAhí ya no hay datos de Coopanion.\n\n`
    + `Si están en una unidad extraíble o en la red, conéctala y haz clic en Reintentar. Si los moviste, haz clic en Elegir carpeta para encontrarlos. Empezar de nuevo comienza desde cero aquí:\n${beside}`,
  dataRetry: 'Reintentar',
  dataChoose: 'Elegir carpeta',
  dataQuit: 'Salir',
  dataChooseTitle: 'Elige la carpeta de datos de Coopanion',
  dataChooseInvalid: (dir) => `Esta carpeta no tiene datos de Coopanion:\n${dir}\n\nElige la carpeta de instalación o la carpeta data que está dentro.`,
};
