import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: 'Очистить и начать заново',
  title: 'Очистить этот разговор и начать с Coo заново?',
  body: 'Coo забудет контекст этого разговора и начнёт заново с текущего системного промпта. Это нельзя отменить. Память и описание личности в рабочей области сохранятся.',
  clearing: 'Очистка…',
  cleared: 'Очищено, начато заново',
  failed: (why: string) => `Не очищено: ${why}`,
  // release.ts
  repoHint: 'Открыть проект Coopanion на GitHub',
  update: (latest: string) => `Вышел Coopanion ${latest}: скачайте обновление`,
};
