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
    permission: { title: 'Quando chiederti', description: 'ask-each-turn: chiede ogni turno prima di guardare lo schermo o agire; ask-before-acting: guardare è libero, chiede ogni turno prima di usare mouse e tastiera; ask-once: guardare è libero, chiede una volta prima di usare mouse e tastiera, e un sì dura quanto indicato in «Un sì vale»; never-ask: non chiede mai.' },
    grantMinutes: { title: 'Un sì vale', suffix: 'min', description: 'Solo per ask-once.' },
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
