import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Alarmes',
  desc: 'Alarmes que o Coo definiu. O Coo é avisado quando você exclui um aqui.',
  head: ['Horário', 'Nota', 'Criado em', ''],
  daily: 'Diário',
  empty: 'O Coo não tem alarmes.',
  remove: 'Excluir',
  confirmTitle: (when) => `Excluir o alarme de ${when}?`,
  removed: 'Excluído',
  failed: (msg) => `Não foi possível excluir: ${msg}`,
  loadFailed: (msg) => `Não foi possível carregar: ${msg}`,
};
