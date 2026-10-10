import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Uso de la computadora',
  enabled: 'Dejar que Coo use esta computadora',
  enabledHint: 'Si está desactivado, Coo no puede ver la pantalla ni tocar el mouse y el teclado.',
  control: 'Permitir el mouse y el teclado',
  controlHint: 'Si está desactivado, Coo solo puede tomar capturas de pantalla y listar ventanas.',
  permission: 'Cuándo preguntarte',
  levels: { 'ask-each-turn': 'Cada turno', 'ask-before-acting': 'Antes de actuar', 'ask-once': 'Una vez', 'never-ask': 'Nunca' },
  levelHints: {
    'ask-each-turn': 'En cada turno, Coo pregunta en su burbuja antes de mirar la pantalla o usar el mouse y el teclado por primera vez.',
    'ask-before-acting': 'Para mirar no pregunta; en cada turno, Coo pregunta antes de usar el mouse y el teclado por primera vez.',
    'ask-once': 'Para mirar no pregunta; Coo pregunta una vez antes de usar el mouse y el teclado y, tras un sí, no vuelve a preguntar durante el tiempo indicado abajo.',
    'never-ask': 'Coo nunca pregunta, ni para mirar ni para actuar.',
  },
  grant: 'Un sí dura',
  grantSuffix: 'minutos',
  grantBad: (min: number, max: number) => `Ingresa un número entero de ${min} a ${max}`,
  more: 'Cuánto tiempo te cede el paso, el tamaño de las capturas y el resto de la configuración están en la página del World Uso de la computadora, en el modo avanzado.',
  saved: 'Guardado',
  turnedOn: 'El uso de la computadora está activado',
  turnedOff: 'El uso de la computadora está desactivado',
  saveFailed: (why: string) => `No se guardó: ${why}`,
  enabledLabel: 'Usar la computadora',
  controlLabel: 'Mouse y teclado',
};
