import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const it: Translation<CoreText> = {
  settings: {
    language: { title: 'Lingua', description: "La finestra delle impostazioni, i fumetti e il menu dell'animaletto usano questa lingua, e Coo ti parla in questa lingua. Ha effetto subito." },
    telemetry: { title: "Statistiche d'uso anonime", description: "Invia conteggi d'uso e impostazioni, mai le conversazioni, per aiutare a migliorare Coopanion. I campi sono elencati in docs/TELEMETRY.md." },
    roundsSoft: { title: 'Promemoria di chiusura', suffix: 'richieste', description: 'Dopo questo numero di richieste al modello in un risveglio, Coo viene invitato a finire ciò che sta facendo e chiudere il turno.' },
    roundsHard: { title: 'Richieste per risveglio', suffix: 'richieste', description: 'Il massimo di richieste al modello in un risveglio; raggiunto il limite, il turno finisce.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `Le mie ultime ${n} richieste al modello non sono riuscite. Errore${status ? ` ${status}` : ''}: ${reason}. Controlla il nome del modello e l'API Key nella pagina Inizio delle impostazioni, dove puoi testare la connessione.`,
    open: 'Apri impostazioni',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `È uscita la versione ${v} e si sta scaricando in background; ti avviso quando è pronta. Se il download si blocca, puoi scaricarla tu da GitHub.`,
    ready: (v: string) => `La versione ${v} è scaricata. Riavviare per aggiornare ora? Altrimenti si installa la prossima volta che chiudi l'app.`,
    failed: (v: string, why: string) => `La versione ${v} non si è scaricata: ${why}. Puoi scaricarla tu da GitHub.`,
    ok: 'OK', github: 'Scarica da GitHub', install: 'Riavvia e aggiorna', later: 'Più tardi', gotIt: 'OK',
  },

  quit: "Esci dall'app",
  cuaYes: 'Sì',
  cuaNo: 'Non stavolta',

  status: {
    read: 'Legge', browse: 'Sfoglia', memory: 'memoria', find: 'Trova', search: 'Cerca', write: 'Scrive', edit: 'Modifica', append: 'Aggiunge a',
    delete: 'Elimina', save: 'Salva', screen: 'Guarda lo schermo', windows: 'Guarda le finestre aperte', rightClick: 'Fa clic destro', doubleClick: 'Fa doppio clic', click: 'Fa clic',
    move: 'Muove il mouse', drag: 'Trascina', scroll: 'Scorre', focus: 'Cambia finestra', type: 'Digita', key: 'Preme', wait: 'Aspetta',
    alarmSet: 'Imposta una sveglia', alarmList: 'Controlla le sveglie', alarmCancel: 'Annulla una sveglia',
    quoted: (text: string) => `«${text}»`,
    seconds: (n: number) => `${n} s`,
    minutesLater: (n: number) => `tra ${n} min`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `Applicato quando l'animaletto passa a «${preset}» di ${figure}`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['Amici', 'friend'], ['Altrove', 'other'], ['Preferisco non dirlo', 'skip']],
    hello: 'Ciao! Sono Coo, e da ora vivo in fondo al tuo schermo. Coo...',
    helloReply: 'Ciao, Coo!',
    askName: 'Come devo chiamarti?',
    nameSend: 'Chiamami così',
    gotName: (name: string) => `${name}, me lo ricordo!`,
    askSource: 'Dove hai sentito parlare di me?',
    sourceThanks: 'Ah, capisco. Coo...',
    askRoam: 'Di solito devo starmene in pace o muovermi tanto? Clicca una scheda per vedere cosa farei.',
    roam: {
      off: { label: 'Resta al suo posto', level: 'Basso', line: 'Allora resto al mio posto e mi muovo quando mi chiami.' },
      calm: { label: 'Ogni tanto', level: 'Medio', line: 'Ogni tanto faccio un giretto, ma quasi sempre resto dove sono.' },
      free: { label: 'Spesso', level: 'Alto', line: 'Posso correre dappertutto. Coo...!' },
    },
    roamOk: 'Così',
    roamDone: 'Va bene, farò così.',

    askVendor: (first: string) => `Per chiacchierare con te devo collegarmi a un modello. Quale servizio uso? Nel dubbio, scegli ${first}.`,
    vendorOk: 'Usa questo',
    moreVendors: 'Altri…',
    pickModel: (model: string) => `Di default userò ${model}: costa poco e sa leggere le immagini. Per usare un altro modello, scrivi invece il suo nome.`,
    modelOk: 'Usa questo',
    askKey: (name: string) => `Incolla qui la tua API Key di ${name}. Si paga in base all'uso, quindi tieni d'occhio i token.`,
    keySend: 'Collega',
    keyLink: (name: string) => `Non hai ancora una chiave? Ottienine una da ${name}`,
    keyLater: 'Più tardi',
    connecting: 'Connessione…',
    keyOk: (name: string, model: string) => `Collegamento a ${name} riuscito${model ? ` (${model})` : ''}! Ora posso parlare. Coo...`,
    keyFail: (why: string) => `Connessione non riuscita: ${why}. La chiave è completa, e c'è ancora credito sull'account? Prova a incollarla di nuovo.`,
    keyAlready: (connection: string) => `Un modello è già collegato (${connection}). Facile. Coo...`,
    keySkipped: "Nessun problema; parlerò quando l'avrai aggiunta. Te lo richiederò più tardi.",

    askModel: (mb: number) => `Per capire cosa dici devo scaricare un modello di riconoscimento vocale (FunASR, circa ${mb} MB). Lo scarico ora?`,
    download: 'Scarica',
    notNow: 'Non ora',
    downloading: 'Sto scaricando il modello vocale. Coo...',
    downloaded: 'Fatto! Ora capisco cosa dici.',
    downloadFail: (why: string) => `Il download non è riuscito: ${why}. Puoi riprovare nella pagina Input vocale delle impostazioni.`,
    modelLater: 'Va bene. Più tardi basta un clic nella pagina Input vocale delle impostazioni per scaricarlo.',
    talk: (hint: string) => `Per parlarmi: ${hint}. `,
    talkOff: "L'input vocale ora è spento; puoi accenderlo nella pagina Input vocale delle impostazioni. ",
    talkType: 'Puoi anche tenere il puntatore su di me e cliccare il pulsante del fumetto accanto a me per scrivere.',
    gotIt: 'Capito',
    buttons: 'Tieni il puntatore su di me e accanto spuntano alcuni pulsanti; fai clic destro su di me per il menu, con pausa, impostazioni ed esci.',
    ok: 'OK',
    persona: 'Come sono e come parlo è scritto nella pagina Prompt di sistema della finestra delle impostazioni. Per cambiarmi, modificalo lì, oppure dimmelo e lo cambio io.',
    personaMark: 'Prompt di sistema',
    personaOk: 'Ho capito',
    finish: MAC
      ? 'Tutto pronto! La mia icona è anche nella barra dei menu; cliccala per cambiare le impostazioni.'
      : process.platform === 'linux'
        ? "Tutto pronto! Per cambiare le impostazioni, fai clic destro su di me per il menu; se la mia icona è nell'area di notifica, puoi cliccare anche quella."
        : "Tutto pronto! La mia icona è anche nell'area di notifica, in basso a destra nella barra delle applicazioni; cliccala per cambiare le impostazioni.",
    go: 'Andiamo',
    dress: 'Prima vestimi',
    closed: 'Va bene, fermiamoci qui. Per riascoltare la mia presentazione, apri le impostazioni e clicca «Guida» nella pagina Inizio.',

    askFirst: 'Non ho ancora un modello collegato; potrò parlare quando aggiungerai una API Key. Quale servizio uso?',
    askAgain: 'Ancora nessun modello collegato; aggiungi una API Key e potrò farti compagnia. Quale servizio uso?',
    askLater: 'Più tardi',
    noModel: 'Nessun modello collegato. Collegarne uno ora?',
    noModelGo: 'Collega',
    noModelLater: 'Più tardi',
  },
};

export default it;
