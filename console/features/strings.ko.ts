import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // advanced/features/prompts/index.ts
  button: "대화 지우고 다시 시작",
  title: "현재 대화를 지우고 다시 시작할까요?",
  body: "이 페이지의 수정을 저장한 뒤 Coo의 현재 대화 맥락을 지우고 업데이트된 시스템 프롬프트로 다시 시작합니다. 지우기는 취소할 수 없습니다. Memory와 페르소나는 유지됩니다.",
  clearing: "새 대화 시작 중…",
  cleared: "새 대화를 시작했습니다",
  // release.ts
  updateShort: (version: string) => `v${version} 업데이트 가능`,
  updateDownloadingShort: (version: string) => `v${version} 다운로드 중`,
  updateReadyShort: (version: string) => `v${version} 준비 완료`,
  updateFailedShort: (version: string) => `v${version} 다운로드`,
  repoHint: 'GitHub에서 Coopanion 프로젝트 열기',
  update: (latest: string) => `Coopanion ${latest} 출시: 업데이트 다운로드`,
  updateDownloading: (version: string) => `Coopanion ${version} 백그라운드에서 다운로드 중`,
  updateReady: (version: string) => `Coopanion ${version} 다운로드 완료, 종료할 때 자동 설치`,
  updateFailed: (version: string) => `Coopanion ${version} 자동 다운로드 실패: 직접 다운로드`,
};
