import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const es419: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} quiere usar tu computadora: ver la pantalla y usar el mouse y el teclado. ¿Está bien esta vez?`,
    once: (who: string, minutes: number) => `${who} quiere usar tu mouse y tu teclado. ¿Está bien durante los próximos ${minutes} minutos?`,
    acting: (who: string) => `${who} quiere usar tu mouse y tu teclado. ¿Está bien esta vez?`,
    caption: 'Uso de la computadora',
    yes: 'Sí',
    no: 'Esta vez no',
  },

  preflight: {
    noDisplay: 'El uso de la computadora necesita X11 en Linux (o XWayland en Wayland): DISPLAY no está definido.',
    unsupported: 'El uso de la computadora solo funciona en Windows, macOS y Linux.',
  },

  console: {
    engine: 'Motor de entrada',
    screen: (w: number, h: number) => `Pantalla ${w}×${h}`,
    onDemand: 'Se inicia cuando hace falta',
    exited: (code: number | null) => `El proceso del motor terminó (código de salida ${code})`,
    allowed: 'Permitido',
    viewOnly: 'Solo mirar',
    asking: 'Pregunta',
    levels: { 'ask-each-turn': 'Cada turno', 'ask-before-acting': 'Antes de actuar', 'ask-once': (minutes: number) => `Una vez cada ${minutes} min`, 'never-ask': 'Nunca' },
  },

  config: {
    group: 'Uso de la computadora',
    enabled: { title: 'Activar el uso de la computadora' },
    control: { title: 'Permitir el mouse y el teclado', description: 'Si está desactivado, solo capturas de pantalla y la lista de ventanas.' },
    permission: { title: 'Cuándo preguntarte', description: 'ask-each-turn: antes de mirar la pantalla o actuar, en cada turno; ask-before-acting: mirar es libre, pregunta antes de usar el mouse y el teclado en cada turno; ask-once: mirar es libre, pregunta una vez antes de usar el mouse y el teclado, y un sí vale durante “Un sí dura”; never-ask: nunca pregunta.' },
    grantMinutes: { title: 'Un sí dura', suffix: 'min', description: 'Solo para ask-once.' },
    userIdleMs: { title: 'No estorbar durante', description: 'Después de que usas el mouse o el teclado, espera hasta que hayan estado quietos este tiempo.' },
    maxYieldWaitMs: { title: 'Espera máxima por ti' },
    maxWidth: { title: 'Ancho máximo de la captura' },
    maxHeight: { title: 'Alto máximo de la captura' },
    quality: { title: 'Calidad de la captura' },
    afterAction: { title: 'Captura después de cada acción' },
    settleMs: { title: 'Espera antes de la captura' },
  },
};

export default es419;
