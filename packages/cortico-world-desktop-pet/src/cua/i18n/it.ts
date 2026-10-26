import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const it: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} vuole usare il tuo computer: guardare lo schermo e usare mouse e tastiera. Va bene per questa volta?`,
    once: (who: string, minutes: number) => `${who} vuole usare il tuo mouse e la tua tastiera. Va bene per i prossimi ${minutes} minuti?`,
    acting: (who: string) => `${who} vuole usare il tuo mouse e la tua tastiera. Va bene per questa volta?`,
    caption: 'Controllo del computer',
    yes: 'Sì',
    no: 'Non stavolta',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} vuole scrivere nella finestra del terminale «${window}»:\n${text}\nCiò che viene scritto può essere eseguito come comando. Dopo un sì, per ${minutes} min non chiede più per scrivere o premere tasti in un terminale né per win+r. Va bene?`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} vuole premere ${keys} nella finestra del terminale «${window}». Dopo un sì, per ${minutes} min non chiede più per scrivere o premere tasti in un terminale né per win+r. Va bene?`,
      runBox: (who: string, keys: string, minutes: number) => `${who} vuole premere ${keys} per aprire la finestra Esegui, che può avviare programmi o eseguire comandi. Dopo un sì, per ${minutes} min non chiede più per scrivere o premere tasti in un terminale né per win+r. Va bene?`,
    },
  },

  preflight: {
    noDisplay: 'Il controllo del computer richiede X11 su Linux (o XWayland sotto Wayland): DISPLAY non è impostato.',
    unsupported: 'Il controllo del computer funziona solo su Windows, macOS e Linux.',
  },

  console: {
    engine: 'Motore di input',
    screen: (w: number, h: number) => `Schermo ${w}×${h}`,
    onDemand: 'Si avvia quando serve',
    exited: (code: number | null) => `Il processo del motore è terminato (codice di uscita ${code})`,
    allowed: 'Consentito',
    viewOnly: 'Solo guardare',
    asking: 'Chiede',
    levels: { 'ask-each-turn': 'Ogni turno', 'ask-before-acting': 'Prima di agire', 'ask-once': (minutes: number) => `Una volta ogni ${minutes} min`, 'never-ask': 'Mai' },
  },

  config: {
    group: 'Controllo del computer',
    enabled: { title: 'Attiva il controllo del computer' },
    control: { title: 'Consenti mouse e tastiera', description: "Se disattivato, solo screenshot ed elenco delle finestre." },
    permission: { title: 'Quando chiederti', description: 'ask-each-turn: chiede ogni turno prima di guardare lo schermo o agire; ask-before-acting: guardare è libero, chiede ogni turno prima di usare mouse e tastiera; ask-once: guardare è libero, chiede una volta prima di usare mouse e tastiera, e un sì dura quanto indicato in «Un sì vale»; never-ask: non chiede mai. Se «Disattiva la domanda prima del terminale e di Esegui» è spento, con qualsiasi impostazione, prima di scrivere o premere tasti in un terminale e prima di win+r chiede una volta a parte, e un sì dura quanto indicato in «Un sì vale».' },
    grantMinutes: { title: 'Un sì vale', suffix: 'min', description: 'Per ask-once e per la domanda a parte sui terminali.' },
    skipTerminalAsk: { title: 'Disattiva la domanda prima del terminale e di Esegui', description: 'Se attivo, scrivere o premere tasti in un terminale e win+r non hanno più una domanda a parte e seguono «Quando chiederti» come ogni altra azione. Con never-ask, Coo può eseguire comandi senza chiederti.' },
    userIdleMs: { title: 'Lasciarti il passo per', description: 'Dopo che hai usato mouse o tastiera, aspetta che restino inattivi per questo tempo.' },
    maxYieldWaitMs: { title: 'Attesa massima per te' },
    maxWidth: { title: 'Larghezza massima screenshot' },
    maxHeight: { title: 'Altezza massima screenshot' },
    quality: { title: 'Qualità screenshot' },
    afterAction: { title: 'Screenshot dopo ogni azione' },
    settleMs: { title: 'Attesa prima dello screenshot' },
  },
};

export default it;
