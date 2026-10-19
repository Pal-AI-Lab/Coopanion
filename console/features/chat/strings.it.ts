import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Chat',
  title: 'Chat',
  trace: 'Console',
  traceHint: 'La pagina Console della modalità avanzata: contesto, chiamate agli strumenti ed eventi grezzi',
  placeholder: (bot: string) => `Scrivi a ${bot}…`,
  connecting: 'Connessione…',
  empty: (bot: string) => `Non hai ancora detto niente a ${bot}.`,
  older: 'Precedenti',
  voice: 'Voce',
  idle: 'A riposo',
  thinking: (bot: string) => `${bot} sta pensando…`,
  doing: (what: string) => `In corso: ${what}`,
  retry: (at: string) => `Il modello non ha risposto; nuovo tentativo alle ${at}`,
  handoff: 'Riordina la conversazione precedente',
  paused: 'In pausa · i messaggi arrivano alla ripresa',
  queued: (bot: string) => `In coda; ${bot} lo legge dopo questo passaggio`,
  queuedPaused: 'In pausa; consegnato alla ripresa',
  sendNow: 'Invia ora',
  sendNowHint: (bot: string) => `Interrompi ciò che ${bot} sta facendo e consegna subito`,
  withdraw: 'Ritira',
  withdrawHint: 'Torna nella casella di testo',
  discarded: 'Non consegnato: la coda è stata svuotata',
  imageCount: (n: number) => `[${n} ${n === 1 ? 'immagine' : 'immagini'}]`,
  ownAnswer: 'La tua risposta…',
  send: 'Invia',
  computer: 'Usa il computer',
  steps: (n: number) => `${n} ${n === 1 ? 'passaggio' : 'passaggi'}`,
  things: (n: number) => `${n} ${n === 1 ? 'passaggio completato' : 'passaggi completati'}`,
  seconds: (s: number) => `${s} s`,
  imagesUnseen: (bot: string) => `Il modello attuale non vede le immagini; ${bot} sa solo quante ne hai inviate.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, e a ${b} è girata la testa per un po'` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `Hai svegliato ${b} con un colpetto` : t.count > 1 ? `Hai dato ${t.count} colpetti a ${b}` : `Hai dato un colpetto a ${b}`;
      case 'pet': return t.count > 1 ? `Hai accarezzato ${b} più volte` : `Hai accarezzato ${b}`;
      case 'throw': return `Hai sollevato e lanciato ${b}${out}`;
      case 'drop': return `Hai portato ${b} da un'altra parte${out}`;
      default: return `Atterraggio duro: a ${b} è girata la testa per un po'`;
    }
  },
  figure: (kind: string, name: string, b: string): string => (kind === 'figure' ? `Hai cambiato ${b} in ${name}` : kind === 'dress' ? `Hai cambiato gli abiti di ${b}` : `Impossibile mostrare ${name}; sostituito da Coo`),
};

export const STEP: Partial<typeof stepEn> = {
  pet_cua_screenshot: 'Screenshot', pet_cua_click: 'Clic', pet_cua_move: 'Movimento del mouse', pet_cua_drag: 'Trascinamento', pet_cua_scroll: 'Scorrimento', pet_cua_type: 'Digitazione',
  pet_cua_key: 'Pressione di tasti', pet_cua_windows: 'Elenco delle finestre', pet_cua_focus: 'Cambio di finestra', pet_cua_wait: 'Attesa',
  pet_move_to: 'Camminata', pet_act: 'Movimento', pet_set: 'Regolazione', pet_quiet: 'Silenzio',
};
