import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: 'Traza de ejecución', model: 'Modelo', settings: 'Configuración', advanced: 'Avanzado',
  toAdvanced: 'Modo avanzado', toAdvancedHint: 'Muestra todo Cortico: modelos, extensiones, Worlds, memoria y diagnóstico',
  toNormal: 'Volver al modo normal', toNormalHint: 'Muestra solo las páginas sobre la mascota',
  featureLoadFailed: (label: string) => `No se pudo cargar “${label}”`,
  running: 'En marcha', paused: 'En pausa',
};
