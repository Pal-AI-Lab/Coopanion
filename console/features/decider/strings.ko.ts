import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: '표정 결정',
  enabled: '결정 모델이 표정과 동작을 고르게 하기',
  enabledHint: 'Coo는 말풍선마다 기분을 한 문장 쓰고, OpenRouter의 결정 모델이 표정과 동작을 고릅니다. 시스템 프롬프트에는 단어표가 들어가지 않습니다.',
  privacy: '켜져 있는 동안 결정할 때마다 말풍선의 말, Coo의 기분, 현재 모습의 이름과 소개, 꾸미기, 표정과 동작 목록을 OpenRouter로 보냅니다.',
  key: 'API Key',
  keySave: '저장',
  keyHint: '배포 폴더에 저장되며 OpenRouter로만 보냅니다. 저장해도 표정 결정이 켜지지는 않습니다.',
  keySaved: 'API Key를 저장했습니다',
  status: '상태',
  on: '결정 모델을 사용 중입니다.',
  off: '꺼짐: 표정과 동작은 Coo가 직접 씁니다.',
  needKey: '켜짐: OpenRouter API Key를 입력하면 적용됩니다.',
  lastFailed: (why: string) => `지난 결정 실패: ${why}.`,
  saveFailed: (why: string) => `저장하지 못했습니다: ${why}`,
};
