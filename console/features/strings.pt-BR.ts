import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'Limpar e recomeçar',
  title: 'Limpar esta conversa e fazer o Coo começar do zero?',
  body: 'O Coo esquece o contexto desta conversa e recomeça a partir do prompt de sistema atual. Isso não pode ser desfeito. A memória e a personalidade no espaço de trabalho continuam.',
  clearing: 'Limpando…',
  cleared: 'Limpo e recomeçado',
  failed: (why: string) => `Não foi limpo: ${why}`,
  // release.ts
  repoHint: 'Abrir o projeto Coopanion no GitHub',
  update: (latest: string) => `O Coopanion ${latest} saiu: baixe a atualização`,
};
