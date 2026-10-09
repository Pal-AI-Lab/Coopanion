import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'Borrar y reiniciar',
  title: '¿Borrar esta conversación y que Coo empiece de cero?',
  body: 'Coo olvida el contexto de esta conversación y vuelve a empezar desde el prompt del sistema actual. No se puede deshacer. La memoria y la personalidad del espacio de trabajo se conservan.',
  clearing: 'Borrando…',
  cleared: 'Borrado y reiniciado',
  failed: (why: string) => `No se borró: ${why}`,
  // release.ts
  repoHint: 'Abrir el proyecto Coopanion en GitHub',
  update: (latest: string) => `Salió Coopanion ${latest}: descarga la actualización`,
};
