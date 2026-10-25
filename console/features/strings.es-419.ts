import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "Borrar conversación y reiniciar",
  title: "¿Borrar la conversación actual y reiniciar?",
  body: "Guarda los cambios de esta página, borra el contexto de la conversación actual de Coo y reinicia con el prompt del sistema actualizado. El borrado no se puede deshacer. Memory y la personalidad se conservan.",
  clearing: "Iniciando una nueva conversación…",
  cleared: "Nueva conversación iniciada",
  // release.ts
  updateShort: (version: string) => `v${version} disponible`,
  updateDownloadingShort: (version: string) => `Descargando v${version}`,
  updateReadyShort: (version: string) => `v${version} lista`,
  updateFailedShort: (version: string) => `Descargar v${version}`,
  repoHint: 'Abrir el proyecto Coopanion en GitHub',
  update: (latest: string) => `Salió Coopanion ${latest}: descarga la actualización`,
  updateDownloading: (version: string) => `Coopanion ${version} se está descargando en segundo plano`,
  updateReady: (version: string) => `Coopanion ${version} ya se descargó y se instala al salir`,
  updateFailed: (version: string) => `Coopanion ${version} no se descargó: descárgalo a mano`,
};
