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
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} quiere escribir en la ventana de terminal “${window}”:\n${text}\nLo que se escriba puede ejecutarse como un comando. Si dices que sí, durante ${minutes} min no se vuelve a preguntar por escribir o presionar teclas en una terminal ni por win+r. ¿Está bien?`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} quiere presionar ${keys} en la ventana de terminal “${window}”. Si dices que sí, durante ${minutes} min no se vuelve a preguntar por escribir o presionar teclas en una terminal ni por win+r. ¿Está bien?`,
      runBox: (who: string, keys: string, minutes: number) => `${who} quiere presionar ${keys} para abrir el cuadro Ejecutar, que puede iniciar programas o ejecutar comandos. Si dices que sí, durante ${minutes} min no se vuelve a preguntar por escribir o presionar teclas en una terminal ni por win+r. ¿Está bien?`,
    },
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
    permission: { title: 'Cuándo preguntarte', description: 'ask-each-turn: antes de mirar la pantalla o actuar, en cada turno; ask-before-acting: mirar es libre, pregunta antes de usar el mouse y el teclado en cada turno; ask-once: mirar es libre, pregunta una vez antes de usar el mouse y el teclado, y un sí vale durante “Un sí dura”; never-ask: nunca pregunta. Si “Desactivar la pregunta antes de la terminal y Ejecutar” está apagado, con cualquier opción, antes de escribir o presionar teclas en una terminal y antes de win+r pregunta una vez aparte, y un sí vale durante “Un sí dura”.' },
    grantMinutes: { title: 'Un sí dura', suffix: 'min', description: 'Para ask-once y para la pregunta aparte sobre las terminales.' },
    skipTerminalAsk: { title: 'Desactivar la pregunta antes de la terminal y Ejecutar', description: 'Si está encendido, escribir o presionar teclas en una terminal y win+r ya no tienen pregunta aparte y siguen “Cuándo preguntarte” como cualquier otra acción. Con never-ask, Coo puede ejecutar comandos sin preguntarte.' },
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
