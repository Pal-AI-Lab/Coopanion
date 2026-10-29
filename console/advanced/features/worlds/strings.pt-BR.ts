import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "Meus Worlds",
  marketTab: "Mercado de extensões",
  extensionList: "Lista de extensões",
  filterByName: "Filtrar por nome",
  allStates: "Todos os estados",
  noMatches: "Nenhuma extensão corresponde ao filtro.",
  newGroup: "Novo grupo",
  groupDefaultName: "Novo grupo",
  renameGroup: "Renomear grupo",
  deleteGroup: "Excluir grupo (mantém as extensões)",
  pendingNote: "As extensões acima têm efeito após reiniciar o processo.",
  packageInfo: "Informações da extensão",
  updateAvailable: (from: string, to: string) => `Atualização disponível: ${from} → ${to}`,
  hideFromSidebar: "Ocultar da barra lateral",
  showInSidebar: "Mostrar na barra lateral",
  builtinAlwaysOn: "Os World integrados ficam sempre ativos.",
  modeOff: "Parado",
  modeRunning: "Somente execução",
  modeAttached: "Conectado",

  navLabel: 'Extensões World',
  introTitle: 'Extensões World',
  prefixReloadFailed: (msg: string) => `Falha ao recarregar o prefixo: ${msg}`,
  toggleFailed: (msg: string) => `Falha ao alternar: ${msg}`,
  reloadNowTitle: 'Recarregar o prefixo de sistema agora?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `“${name}” está visível para o agente novamente.` : `“${name}” agora está oculto para o agente.`)
    + '\n\nA entrega de eventos já segue o novo estado. Recarregar atualiza o prompt do ambiente e as declarações de ferramentas e mantém as mensagens existentes da conversa. '
    + 'Se cancelar, eles são atualizados na próxima transferência de contexto ou reinício.',
  deactivateTitle: (name: string) => `Desativar “${name}”?`,
  deactivateBody: (id: string) =>
    'O World para imediatamente (seus processos externos e conexões gerenciados são encerrados), e '
    + `worlds.${id}.enabled=false é gravado em config.json. O prompt do ambiente e as ferramentas do agente são retirados na hora; ativar de novo o reconstrói com a configuração atual.`,
  restartTitle: (name: string) => `Reiniciar “${name}”?`,
  restartBody: 'Para e reconstrói o World para aplicar as configurações marcadas para reinício do World. Processos e conexões gerenciados param e reiniciam.',
  missingReasonDefault: 'Não foi possível carregar este World.',
  activateWorld: 'Ativar World',
  inactiveNoteManual: (id: string) => `Implementado localmente, mas não montado. Para ativá-lo, defina worlds.${id}.enabled como true em config.json e reinicie.`,
  hideFromAgent: 'Ocultar do agente',
  showToAgent: 'Mostrar ao agente',
  restartWorld: 'Reiniciar World',
  deactivateWorld: 'Desativar World',
  prefixPending: 'Recarga do prefixo pendente',
  noWorlds: 'Nenhum World',
  listLoadFailed: (msg: string) => `Falha ao carregar a lista de Worlds: ${msg}`,
  loading: 'Carregando…',
};
