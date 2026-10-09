import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: 'Rastro de execução', model: 'Modelo', settings: 'Configurações', advanced: 'Avançado',
  toAdvanced: 'Modo avançado', toAdvancedHint: 'Mostra todo o Cortico: modelos, extensões, Worlds, memória e diagnóstico',
  toNormal: 'Voltar ao modo normal', toNormalHint: 'Mostra só as páginas sobre o pet',
  featureLoadFailed: (label: string) => `Falha ao carregar “${label}”`,
};
