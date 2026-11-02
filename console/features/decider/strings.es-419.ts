import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Elección de expresiones',
  enabled: 'Dejar que un modelo de decisión elija expresiones y movimientos',
  enabledHint: 'Coo escribe cómo se siente en cada globo y un modelo de decisión de OpenRouter elige las expresiones y los movimientos; el prompt del sistema ya no lleva la tabla de palabras.',
  privacy: 'Mientras está activada, cada decisión envía a OpenRouter el texto del globo, el sentimiento de Coo, y el nombre, la descripción y el vestuario de la figura actual con su lista de expresiones y movimientos.',
  key: 'API Key',
  keySave: 'Guardar',
  keyHint: 'Se guarda en la carpeta del despliegue y solo se envía a OpenRouter. Guardarla no activa la elección de expresiones.',
  keySaved: 'API Key guardada',
  status: 'Estado',
  on: 'Se está usando un modelo de decisión.',
  off: 'Desactivada: Coo escribe sus expresiones y movimientos.',
  needKey: 'Activada: surte efecto cuando haya una API Key de OpenRouter.',
  lastFailed: (why: string) => `La última decisión falló: ${why}.`,
  saveFailed: (why: string) => `No se guardó: ${why}`,
};
