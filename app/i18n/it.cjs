// Italiano: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Avvio in corso…',

  trayOpenSettings: 'Apri impostazioni',
  trayShowPet: "Mostra l'animaletto",
  trayClickThrough: 'Lascia passare i clic attraverso Coo',
  trayClickThroughTip: 'Coopanion (i clic attraversano Coo)',
  trayLaunchAtLogin: "Avvia all'accesso",
  trayRestart: 'Riavvia',
  trayQuit: 'Esci',

  coreFailed: (times, code, logFile) => `Il Core si è chiuso ${times} volte in 5 minuti (codice di uscita ${code}) e non viene più riavviato. Se l'app è stata appena aggiornata, scegli «Esci» nel menu dell'area di notifica e riapri Coopanion. Log: ${logFile}`,
  coreIncomplete: (url, logFile) => `Mancano dei file di Coopanion, quindi il Core non può avviarsi. Scarica il programma di installazione completo da ${url} e installalo nella stessa cartella; impostazioni, API Key, prompt e memoria restano. Log: ${logFile}`,
  coreRestarting: (code) => `Il Core si è chiuso inaspettatamente (codice di uscita ${code}); riavvio tra 3 secondi`,
  coreLocked: (pid, file) => `Un altro processo${pid ? ` (PID ${pid})` : ''} sta usando i dati di Coopanion, quindi il Core non è partito. Attendi che termini o chiudilo, poi scegli «Riavvia» nel menu dell'area di notifica. File di blocco: ${file}`,
  corePortsBusy: (from, to) => `Le porte della console ${from}–${to} sono tutte occupate, quindi il Core non è partito. Forse ci sono già ${to - from + 1} copie di Coopanion aperte, oppure altri programmi usano queste porte. Chiudine una, poi scegli «Riavvia» nel menu dell'area di notifica.`,

  strandedMessage: "Trovate le impostazioni di prima dell'aggiornamento",
  strandedDetail: (stranded, parent) => `Un precedente aggiornamento automatico ha installato Coopanion dove si trova ora. Le impostazioni, le API Key, i prompt e la memoria di prima di quell'aggiornamento sono ancora in:\n${stranded}\n\n`
    + `Tornando indietro, i dati attuali vengono rinominati in data-replaced-<ora> e conservati in ${parent}; non viene eliminato nulla. Dopo «Tieni quelle attuali» la domanda non verrà più posta.`,
  strandedRestore: 'Usa le impostazioni di prima',
  strandedKeep: 'Tieni quelle attuali',

  dataNotWritable: (dir, suggested) => `Coopanion non può scrivere nella sua cartella dei dati e non è partito:\n${dir}\n\nAvvia di nuovo il programma di installazione e installa in una cartella in cui il tuo account può scrivere, per esempio:\n${suggested}`,

  dataFoundMessage: 'Trovati dati precedenti di Coopanion',
  dataFoundDetail: (data, when, program) => `Coopanion ora è installato in ${program}, che non ha ancora dati. I dati usati finora sono in:\n${data}\nUltimo avvio: ${when}\n\n`
    + 'Se li erediti, mantieni impostazioni, API Key, prompt e memoria. Se ricominci da capo, Coopanion riparte da zero qui; i dati precedenti restano dove sono e non vengono eliminati.',
  dataInherit: 'Eredita questi dati',
  dataNew: 'Ricomincia da capo',
  dataMissingMessage: 'I dati usati finora non sono stati trovati',
  dataMissingDetail: (data, when, beside) => `I dati usati finora erano in:\n${data}\nUltimo avvio: ${when}\nLì ora non ci sono dati di Coopanion.\n\n`
    + `Se sono su un'unità rimovibile o in rete, collegala e fai clic su Riprova. Se li hai spostati, fai clic su Scegli cartella per trovarli. Ricomincia da capo riparte da zero qui:\n${beside}`,
  dataRetry: 'Riprova',
  dataChoose: 'Scegli cartella',
  dataQuit: 'Esci',
  dataChooseTitle: 'Scegli la cartella dei dati di Coopanion',
  dataChooseInvalid: (dir) => `Questa cartella non contiene dati di Coopanion:\n${dir}\n\nScegli la cartella di installazione o la cartella data al suo interno.`,
};
