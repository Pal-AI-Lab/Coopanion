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
  finishingToast: 'Desligando…',
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
  renameSaved: 'Nome de exibição salvo',
  renameFailed: (msg: string) => `Nome de exibição não salvo: ${msg}`,
  // avatar.ts
  changeAvatar: 'Trocar o avatar do Coo',
  uploadAvatar: 'Enviar e recortar o avatar do Coo',
  unreadable: 'Não foi possível ler esta imagem',
  cropPreview: 'Prévia do recorte do avatar',
  zoomAria: 'Zoom do avatar',
  zoom: 'Zoom',
  note: 'Arraste a imagem para reposicioná-la; use a roda do mouse ou o controle deslizante para dar zoom. Salvar grava avatar.png no diretório de dados do Coo.',
  cancel: 'Cancelar',
  save: 'Salvar avatar',
  cropTitle: 'Recortar avatar',
  noCanvas: 'O navegador não conseguiu criar um canvas de imagem',
  saved: 'Avatar salvo',
};
