import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: 'Contraer barra lateral', expandSidebar: 'Expandir barra lateral',
  goBack: 'Atrás', goForward: 'Adelante',
  trace: 'Consola', integrations: 'Integraciones', personaMemory: 'Personalidad y memoria', diagnostics: 'Solución de problemas',
  toAdvanced: 'Modo avanzado', toAdvancedHint: "Mostrar proveedores de modelos, Persona, Memory y diagnóstico",
  toNormal: 'Volver al modo normal', toNormalHint: "Mostrar páginas de la mascota y extensiones World",
  featureLoadFailed: (label: string) => `No se pudo cargar “${label}”`,
  running: 'En marcha', paused: 'En pausa',
};
