import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '알람',
  desc: 'Coo가 설정한 알람입니다. 여기서 삭제하면 Coo에게 알려집니다.',
  setAt: '설정 시각',
  daily: '매일',
  empty: 'Coo가 설정한 알람이 없습니다.',
  remove: '삭제',
  confirmTitle: (when) => `${when} 알람을 삭제할까요?`,
  removed: '삭제했습니다',
  failed: (msg) => `삭제하지 못했습니다: ${msg}`,
  loadFailed: (msg) => `불러오지 못했습니다: ${msg}`,
  search: '내용이나 시간 검색',
  noMatch: '일치하는 알람이 없습니다.',
  perPage: '페이지당',
  shown: (from: number, to: number, total: number) => `${total}개 중 ${from}–${to}`,
  prevPage: '‹ 이전',
  nextPage: '다음 ›',
};
