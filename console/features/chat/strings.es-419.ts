import type { Touch } from './index.ts';
import type { en, stepEn } from './strings.ts';

export const S: Partial<typeof en> = {
  nav: 'Chat',
  title: 'Chat',
  trace: 'Traza de ejecución',
  traceHint: 'La traza de ejecución completa en el modo avanzado: contexto, llamadas a herramientas y eventos sin procesar',
  placeholder: (bot: string) => `Dile algo a ${bot}…`,
  connecting: 'Conectando…',
  empty: (bot: string) => `Todavía no le has dicho nada a ${bot}.`,
  older: 'Anteriores',
  voice: 'Voz',
  idle: 'Inactivo',
  thinking: (bot: string) => `${bot} está pensando…`,
  doing: (what: string) => `Ocupado: ${what}`,
  retry: (at: string) => `El modelo no respondió; se reintentará a las ${at}`,
  handoff: 'Ordenando la conversación anterior',
  paused: 'En pausa · los mensajes llegan al reanudar',
  queued: (bot: string) => `En cola; ${bot} lo lee después de este paso`,
  queuedPaused: 'En pausa; se entrega al reanudar',
  sendNow: 'Enviar ahora',
  sendNowHint: (bot: string) => `Detener lo que ${bot} está haciendo y entregarlo ahora`,
  withdraw: 'Retirar',
  withdrawHint: 'De vuelta al cuadro de texto',
  discarded: 'No se entregó: se vació la cola',
  imageCount: (n: number) => `[${n} ${n === 1 ? 'imagen' : 'imágenes'}]`,
  ownAnswer: 'Tu propia respuesta…',
  send: 'Enviar',
  computer: 'Usando la computadora',
  steps: (n: number) => `${n} ${n === 1 ? 'paso' : 'pasos'}`,
  things: (n: number) => `${n} ${n === 1 ? 'cosa hecha' : 'cosas hechas'}`,
  seconds: (s: number) => `${s} s`,
  imagesUnseen: (bot: string) => `El modelo actual no puede ver imágenes; ${bot} solo sabe cuántas enviaste.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `, y ${b} quedó aturdido un rato` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `Despertaste a ${b} con un toquecito` : t.count > 1 ? `Le diste ${t.count} toquecitos a ${b}` : `Le diste un toquecito a ${b}`;
      case 'pet': return t.count > 1 ? `Acariciaste a ${b} varias veces` : `Acariciaste a ${b}`;
      case 'throw': return `Levantaste a ${b} y lo lanzaste${out}`;
      case 'drop': return `Llevaste a ${b} a otro lugar${out}`;
      default: return `${b} cayó fuerte al suelo y quedó aturdido un rato`;
    }
  },
};

export const STEP: Partial<typeof stepEn> = {
  cua_screenshot: 'Captura de pantalla', cua_click: 'Clic', cua_move: 'Mover el mouse', cua_drag: 'Arrastrar', cua_scroll: 'Desplazar', cua_type: 'Escribir',
  cua_key: 'Presionar teclas', cua_windows: 'Ver ventanas', cua_focus: 'Cambiar de ventana', cua_wait: 'Esperar',
  pet_walk_to: 'Caminar', pet_act: 'Moverse', pet_set: 'Ajustarse', pet_quiet: 'Quedarse en silencio',
};
