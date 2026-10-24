import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Alarmas',
  desc: 'Alarmas que Coo puso. Coo recibe un aviso cuando eliminas una aquí.',
  setAt: 'Creada el',
  daily: 'Diaria',
  empty: 'Coo no tiene alarmas.',
  remove: 'Eliminar',
  confirmTitle: (when) => `¿Eliminar la alarma de las ${when}?`,
  removed: 'Eliminada',
  failed: (msg) => `No se pudo eliminar: ${msg}`,
  loadFailed: (msg) => `No se pudo cargar: ${msg}`,
  search: 'Buscar notas u horas',
  noMatch: 'Ninguna alarma coincide.',
  perPage: 'Por página',
  shown: (from: number, to: number, total: number) => `${from}–${to} de ${total}`,
  prevPage: '‹ Anterior',
  nextPage: 'Siguiente ›',
};
