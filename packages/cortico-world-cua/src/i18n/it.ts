import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const it: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} vuole usare il tuo computer: guardare lo schermo e usare mouse e tastiera. Va bene per questa volta?`,
    once: (who: string, minutes: number) => `${who} vuole usare il tuo mouse e la tua tastiera. Va bene per i prossimi ${minutes} minuti?`,
    acting: (who: string) => `${who} vuole usare il tuo mouse e la tua tastiera. Va bene per questa volta?`,
    caption: 'Controllo del computer',
    yes: 'Sì',
    no: 'No',
  },

  preflight: {
    noDisplay: 'Il World Controllo del computer richiede X11 su Linux (o XWayland sotto Wayland): DISPLAY non è impostato.',
    unsupported: 'Il World Controllo del computer funziona solo su Windows, macOS e Linux.',
  },

  console: {
    label: 'Controllo del computer',
    engine: 'Motore di input',
    screen: (w: number, h: number) => `Schermo ${w}×${h}`,
    onDemand: 'Si avvia quando serve',
    exited: (code: number | null) => `Il processo del motore è terminato (codice di uscita ${code})`,
    control: 'Controllo',
    allowed: 'Consentito',
    viewOnly: 'Solo guardare',
    asking: 'Chiede',
    levels: { 'ask-each-turn': 'Ogni turno', 'ask-before-acting': 'Prima di agire', 'ask-once': (minutes: number) => `Una volta ogni ${minutes} min`, 'never-ask': 'Mai' },
    envPrompt: { title: 'Ambiente di controllo del computer', description: 'Coordinate degli screenshot, le regole per non intralciare la persona e cosa si può fare.' },
    vars: {
      'cua.os': 'Il sistema di questo computer: Windows o Mac',
      'cua.keys': 'Scorciatoie comuni su questo sistema',
      'cua.shot': 'Dimensione degli screenshot',
      'cua.control': 'Se mouse e tastiera possono essere usati',
      'cua.idle': 'Per quanto lasciare il passo (secondi)',
      'cua.permission': "Quando chiedere prima alla persona (dall'impostazione permission)",
    },
  },

  config: {
    group: 'Controllo del computer',
    control: { title: 'Consenti mouse e tastiera', description: "Se disattivato, solo screenshot ed elenco delle finestre." },
    permission: { title: 'Quando chiederti prima', description: 'ask-each-turn: chiede ogni turno prima di guardare lo schermo o agire; ask-before-acting: guardare è libero, chiede ogni turno prima di usare mouse e tastiera; ask-once: guardare è libero, chiede una volta prima di usare mouse e tastiera, e un sì vale per «Quanto dura un sì»; never-ask: non chiede mai.' },
    grantMinutes: { title: 'Quanto dura un sì', suffix: 'min', description: 'Solo per ask-once.' },
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
