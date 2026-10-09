import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  trace: '실행 기록', model: '모델', settings: '설정', advanced: '고급',
  toAdvanced: '고급 모드', toAdvancedHint: 'Cortico의 모든 설정 표시: 모델, 확장, World, 기억, 진단',
  toNormal: '일반 모드로 돌아가기', toNormalHint: '펫 관련 페이지만 표시',
  featureLoadFailed: (label: string) => `"${label}"을(를) 불러오지 못했습니다`,
};
