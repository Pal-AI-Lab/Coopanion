import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // clear-session.ts
  button: '비우고 다시 시작',
  title: '이 대화를 비우고 Coo를 처음부터 다시 시작하시겠습니까?',
  body: 'Coo가 이 대화의 맥락을 잊고 현재 시스템 프롬프트로 다시 시작합니다. 되돌릴 수 없습니다. 작업 공간의 기억과 인격 설정은 그대로 남습니다.',
  clearing: '비우는 중…',
  cleared: '비우고 다시 시작했습니다',
  failed: (why: string) => `비우지 못했습니다: ${why}`,
  // release.ts
  repoHint: 'GitHub에서 Coopanion 프로젝트 열기',
  update: (latest: string) => `Coopanion ${latest} 출시: 업데이트 다운로드`,
};
