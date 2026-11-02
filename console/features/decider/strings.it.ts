import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Scelta delle espressioni',
  enabled: 'Lascia scegliere espressioni e movimenti a un modello di decisione',
  enabledHint: 'Coo scrive come si sente a ogni fumetto e un modello di decisione su OpenRouter sceglie espressioni e movimenti; il prompt di sistema non contiene più la tabella delle parole.',
  privacy: "Finché è attiva, ogni decisione invia a OpenRouter il testo del fumetto, lo stato d'animo di Coo, e il nome, la descrizione e l'abbigliamento della figura attuale con il suo elenco di espressioni e movimenti.",
  key: 'API Key',
  keySave: 'Salva',
  keyHint: 'Viene conservata nella cartella della distribuzione e inviata solo a OpenRouter. Salvarla non attiva la scelta delle espressioni.',
  keySaved: 'API Key salvata',
  status: 'Stato',
  on: 'È in uso un modello di decisione.',
  off: 'Disattiva: Coo scrive da sé espressioni e movimenti.',
  needKey: "Attiva: ha effetto quando c'è una API Key di OpenRouter.",
  lastFailed: (why: string) => `L'ultima decisione non è riuscita: ${why}.`,
  saveFailed: (why: string) => `Non salvato: ${why}`,
};
