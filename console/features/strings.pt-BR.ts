import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "Apagar conversa e reiniciar",
  title: "Apagar a conversa atual e reiniciar?",
  body: "Salva as alterações desta página, apaga o contexto da conversa atual de Coo e reinicia com o prompt do sistema atualizado. A exclusão não pode ser desfeita. Memory e a personalidade são mantidos.",
  clearing: "Iniciando uma nova conversa…",
  cleared: "Nova conversa iniciada",
  // release.ts
  updateShort: (version: string) => `v${version} disponível`,
  updateDownloadingShort: (version: string) => `Baixando v${version}`,
  updateReadyShort: (version: string) => `v${version} pronta`,
  updateFailedShort: (version: string) => `Baixar v${version}`,
  repoHint: 'Abrir o projeto Coopanion no GitHub',
  update: (latest: string) => `O Coopanion ${latest} saiu: baixe a atualização`,
  updateDownloading: (version: string) => `Coopanion ${version} está sendo baixado em segundo plano`,
  updateReady: (version: string) => `Coopanion ${version} foi baixado e será instalado ao sair`,
  updateFailed: (version: string) => `Coopanion ${version} não foi baixado: baixe manualmente`,
};
