import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Recolher barra lateral', expandSidebar: 'Expandir barra lateral',
  goBack: 'Voltar', goForward: 'Avançar',
  trace: 'Console', integrations: 'Integrações', personaMemory: 'Personalidade e memória', diagnostics: 'Solução de problemas',
  toAdvanced: 'Modo avançado', toAdvancedHint: "Mostrar provedores de modelos, Persona, Memory e diagnóstico",
  toNormal: 'Voltar ao modo normal', toNormalHint: "Mostrar páginas do pet e das extensões World",
  featureLoadFailed: (label: string) => `Falha ao carregar “${label}”`,
  running: 'Em execução', paused: 'Pausado',
};
