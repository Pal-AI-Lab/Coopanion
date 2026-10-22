import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Chat',
  title: 'Chat',
  trace: 'Konsole',
  traceHint: 'Die Seite „Konsole“ im erweiterten Modus: Kontext, Tool-Aufrufe und Rohereignisse',
  placeholder: (bot: string) => `Nachricht an ${bot}…`,
  connecting: 'Verbinde…',
  empty: (bot: string) => `Noch nichts zu ${bot} gesagt.`,
  older: 'Früher',
  voice: 'Stimme',
  idle: 'Im Leerlauf',
  thinking: (bot: string) => `${bot} denkt nach…`,
  doing: (what: string) => `Beschäftigt: ${what}`,
  retry: (at: string) => `Das Modell hat nicht geantwortet; neuer Versuch um ${at}`,
  handoff: 'Räumt das frühere Gespräch auf',
  contextUsed: (used: string, limit: string) => `Etwa ${used} / ${limit} Tokens`,
  contextTokens: (used: string) => `Etwa ${used} Tokens`,
  contextLimit: (limit: string) => `Bei ${limit} wird das frühere Gespräch aufgeräumt`,
  contextLast: (when: string) => `Zuletzt aufgeräumt: ${when}`,
  paused: 'Pausiert · Nachrichten kommen nach dem Fortsetzen an',
  queued: (bot: string) => `In der Warteschlange; ${bot} liest es nach diesem Schritt`,
  queuedPaused: 'Pausiert; wird nach dem Fortsetzen zugestellt',
  sendNow: 'Jetzt senden',
  sendNowHint: (bot: string) => `Unterbrich, was ${bot} gerade tut, und stell es sofort zu`,
  withdraw: 'Zurückholen',
  withdrawHint: 'Zurück ins Eingabefeld',
  discarded: 'Nicht zugestellt: Die Warteschlange wurde geleert',
  imageCount: (n: number) => `[${n} ${n === 1 ? 'Bild' : 'Bilder'}]`,
  ownAnswer: 'Eigene Antwort…',
  send: 'Senden',
  computer: 'Bedient den Computer',
  steps: (n: number) => `${n} ${n === 1 ? 'Schritt' : 'Schritte'}`,
  things: (n: number) => `${n} ${n === 1 ? 'Schritt' : 'Schritte'} erledigt`,
  seconds: (s: number) => `${s} s`,
  imagesUnseen: (bot: string) => `Das aktuelle Modell kann keine Bilder sehen; ${bot} erfährt nur, wie viele du geschickt hast.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, und ${b} war kurz k. o.` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `Du hast ${b} wach gestupst` : t.count > 1 ? `Du hast ${b} ${t.count}-mal angestupst` : `Du hast ${b} angestupst`;
      case 'pet': return t.count > 1 ? `Du hast ${b} ein paarmal gestreichelt` : `Du hast ${b} gestreichelt`;
      case 'throw': return `Du hast ${b} hochgehoben und geworfen${out}`;
      case 'drop': return `Du hast ${b} woandershin getragen${out}`;
      default: return `${b} ist hart aufgeschlagen und war kurz k. o.`;
    }
  },
  figure: (kind: string, name: string, b: string): string => (kind === 'figure' ? `Du hast ${b} auf ${name} umgestellt` : kind === 'dress' ? `Du hast das Outfit von ${b} geändert` : `${name} konnte nicht angezeigt werden; zu Coo gewechselt`),
};

export const STEP: Partial<typeof stepEn> = {
  pet_cua_screenshot: 'Screenshot', pet_cua_click: 'Klicken', pet_cua_move: 'Maus bewegen', pet_cua_drag: 'Ziehen', pet_cua_scroll: 'Scrollen', pet_cua_type: 'Tippen',
  pet_cua_key: 'Tasten drücken', pet_cua_windows: 'Fenster auflisten', pet_cua_focus: 'Fenster wechseln', pet_cua_wait: 'Warten',
  pet_move_to: 'Laufen', pet_act: 'Sich bewegen', pet_set: 'Sich anpassen', pet_quiet: 'Still sein',
};
