// Italiano: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Avvio in corso…',

  trayOpenSettings: 'Apri impostazioni',
  trayShowPet: "Mostra l'animaletto",
  trayLaunchAtLogin: "Avvia all'accesso",
  trayRestart: 'Riavvia',
  trayQuit: 'Esci',

  coreFailed: (times, code, logFile) => `Il Core si è chiuso ${times} volte in 5 minuti (codice di uscita ${code}) e non viene più riavviato. Log: ${logFile}`,
  coreRestarting: (code) => `Il Core si è chiuso inaspettatamente (codice di uscita ${code}); riavvio tra 3 secondi`,

  strandedMessage: "Trovate le impostazioni di prima dell'aggiornamento",
  strandedDetail: (stranded, parent) => `Un precedente aggiornamento automatico ha installato Coopanion dove si trova ora. Le impostazioni, le API Key, i prompt e la memoria di prima di quell'aggiornamento sono ancora in:\n${stranded}\n\n`
    + `Tornando indietro, i dati attuali vengono rinominati in data-replaced-<ora> e conservati in ${parent}; non viene eliminato nulla. Dopo «Tieni quelle attuali» la domanda non verrà più posta.`,
  strandedRestore: 'Usa le impostazioni di prima',
  strandedKeep: 'Tieni quelle attuali',
};
