import type { en } from './strings.ts';

export const L: Partial<typeof en> = {
  collapseSidebar: '사이드바 접기', expandSidebar: '사이드바 펼치기',
  goBack: '뒤로', goForward: '앞으로',
  trace: '콘솔', integrations: '연동', personaMemory: '인격과 기억', diagnostics: '진단',
  toAdvanced: '고급 모드', toAdvancedHint: "모델 공급자, Persona, Memory 및 진단 표시",
  toNormal: '일반 모드로 돌아가기', toNormalHint: "펫 및 World 확장 페이지 표시",
  featureLoadFailed: (label: string) => `"${label}"을(를) 불러오지 못했습니다`,
  running: '실행 중', paused: '일시 정지됨',
};
