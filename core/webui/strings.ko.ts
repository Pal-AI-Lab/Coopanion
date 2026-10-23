import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '알람',
  desc: 'Coo가 설정한 알람입니다. 여기서 삭제하면 Coo에게 알려집니다.',
  head: ['시간', '내용', '설정 시각', ''],
  daily: '매일',
  empty: 'Coo가 설정한 알람이 없습니다.',
  remove: '삭제',
  confirmTitle: (when) => `${when} 알람을 삭제할까요?`,
  removed: '삭제했습니다',
  failed: (msg) => `삭제하지 못했습니다: ${msg}`,
  loadFailed: (msg) => `불러오지 못했습니다: ${msg}`,
};
