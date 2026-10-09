import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'Svuota e ricomincia',
  title: 'Svuotare questa conversazione e far ripartire Coo da zero?',
  body: "Coo dimentica il contesto di questa conversazione e riparte dal prompt di sistema attuale. Non si può annullare. La memoria e la persona nell'area di lavoro restano.",
  clearing: 'Svuotamento…',
  cleared: 'Svuotata e ricominciata',
  failed: (why: string) => `Non svuotata: ${why}`,
  // release.ts
  repoHint: 'Apri il progetto Coopanion su GitHub',
  update: (latest: string) => `È uscito Coopanion ${latest}: scarica l'aggiornamento`,
};
