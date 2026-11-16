import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: 'Navegação das configurações',
  groupWorlds: 'World',
  moduleInstancesAria: 'Instâncias de World',

  runResume: 'Retomar',
  runPause: 'Pausar',
  shutdownAria: 'Desligar',
  finishing: 'Desligando…',
  shutdownTitle: 'Desligar',
  shutdownBody: 'O processo será encerrado e a conexão será desfeita.',
  confirmShutdownTitle: '⚠ Desligar',
  confirmShutdownAgainTitle: '⚠⚠ Confirmar desligamento?',
  confirmShutdownAgainBody: 'Parar a execução e encerrar o processo?',
  stepIncomplete: 'não concluída',
  doneShutdown: 'Desligado',
  resultLocalIncomplete: 'Etapas de desligamento local incompletas',
  resultExternalUnverified: 'Desligado localmente; estado externo não verificado',
  resultUnverified: 'Etapas de desligamento executadas; estado não verificado',
  resultDefault: 'Etapas de desligamento executadas.',
  noReceipt: (msg: string) =>
    `Nenhum resultado de desligamento recebido (${msg}); o processo pode ter sido encerrado.`,
  docTitle: (name: string) => `Configurações · ${name}`,
  renameTitle: 'Clique para renomear',
  renameFailed: (msg: string) => `Nome de exibição não salvo: ${msg}`,
  // avatar.ts
  changeAvatar: 'Trocar o avatar do Coo',
  uploadAvatar: 'Enviar e recortar o avatar do Coo',
  unreadable: 'Não foi possível ler esta imagem',
  cropPreview: 'Prévia do recorte do avatar',
  zoomAria: 'Zoom do avatar',
  zoom: 'Zoom',
  note: "Arraste para mover; use a roda ou o controle para ampliar.",
  cancel: 'Cancelar',
  save: 'Salvar avatar',
  cropTitle: 'Recortar avatar',
  noCanvas: 'O navegador não conseguiu criar um canvas de imagem',
};
