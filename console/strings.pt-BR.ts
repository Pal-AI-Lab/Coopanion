import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Recolher barra lateral', expandSidebar: 'Expandir barra lateral',
  goBack: 'Voltar', goForward: 'Avançar',
  trace: 'Console', integrations: 'Integrações', personaMemory: 'Personalidade e memória', diagnostics: 'Solução de problemas',
  toAdvanced: 'Modo avançado', toAdvancedHint: 'Mostra todo o Cortico: modelos, extensões, Worlds, memória e diagnóstico',
  toNormal: 'Voltar ao modo normal', toNormalHint: 'Mostra só as páginas sobre o pet',
  featureLoadFailed: (label: string) => `Falha ao carregar “${label}”`,
  running: 'Em execução', paused: 'Pausado',
};
