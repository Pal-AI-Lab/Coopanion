import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "Mis Worlds",
  marketTab: "Mercado de extensiones",
  extensionList: "Lista de extensiones",
  filterByName: "Filtrar por nombre",
  allStates: "Todos los estados",
  noMatches: "Ninguna extensión coincide con el filtro.",
  newGroup: "Nuevo grupo",
  groupDefaultName: "Nuevo grupo",
  renameGroup: "Cambiar nombre del grupo",
  deleteGroup: "Eliminar grupo (conserva las extensiones)",
  pendingNote: "Las extensiones de arriba surten efecto al reiniciar el proceso.",
  packageInfo: "Información de la extensión",
  updateAvailable: (from: string, to: string) => `Actualización disponible: ${from} → ${to}`,
  hideFromSidebar: "Ocultar de la barra lateral",
  showInSidebar: "Mostrar en la barra lateral",
  builtinAlwaysOn: "Los World integrados siempre están activos.",
  modeOff: "Detenido",
  modeRunning: "Solo ejecución",
  modeAttached: "Conectado",

  navLabel: 'Extensiones World',
  introTitle: 'Extensiones World',
  prefixReloadFailed: (msg: string) => `Falló la recarga del prefijo: ${msg}`,
  toggleFailed: (msg: string) => `No se pudo cambiar: ${msg}`,
  reloadNowTitle: '¿Recargar ahora el prefijo del sistema?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `“${name}” vuelve a ser visible para el agente.` : `“${name}” ahora está oculto para el agente.`)
    + '\n\nLa entrega de eventos ya sigue el nuevo estado. Al recargar se actualizan el prompt del entorno y las declaraciones de herramientas, y se conservan los mensajes existentes de la conversación. '
    + 'Si cancelas, se actualizan en el próximo traspaso de contexto o reinicio.',
  deactivateTitle: (name: string) => `¿Desactivar “${name}”?`,
  deactivateBody: (id: string) =>
    'El World se detiene de inmediato (sus procesos externos y conexiones gestionados se cierran) y '
    + `se escribe worlds.${id}.enabled=false en config.json. El prompt del entorno y las herramientas del agente se retiran en el acto; al activarlo de nuevo se reconstruye con la configuración actual.`,
  restartTitle: (name: string) => `¿Reiniciar “${name}”?`,
  restartBody: 'Detiene y reconstruye el World para aplicar los ajustes marcados para reinicio del World. Los procesos y conexiones gestionados se detienen y vuelven a iniciarse.',
  missingReasonDefault: 'No se pudo cargar este World.',
  activateWorld: 'Activar World',
  inactiveNoteManual: (id: string) => `Implementado localmente pero no ensamblado. Para activarlo, cambia worlds.${id}.enabled a true en config.json y reinicia.`,
  hideFromAgent: 'Ocultar al agente',
  showToAgent: 'Mostrar al agente',
  restartWorld: 'Reiniciar World',
  deactivateWorld: 'Desactivar World',
  prefixPending: 'Recarga de prefijo pendiente',
  noWorlds: 'No hay Worlds',
  listLoadFailed: (msg: string) => `No se pudo cargar la lista de Worlds: ${msg}`,
  loading: 'Cargando…',
};
