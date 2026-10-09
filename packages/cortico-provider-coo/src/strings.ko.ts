import type { en } from './strings.ts';

export const cooText: Partial<typeof en> = {
  description: (names: readonly string[]) => `모듈 하나로 ${names.join(', ')}에 연결합니다. 기본 URL로 어느 서비스인지, 어떤 프로토콜을 쓰는지 판단합니다. 추론은 네 단계로 조절할 수 있습니다.`,
  tiers: { off: '추론 안 함', low: '추론 · 빠름', high: '추론 · 표준', max: '추론 · 최대' },
  protocol: '프로토콜',
  protocolHint: '비워 두면 목록에 있는 서비스는 자체 프로토콜을, 그 밖의 URL은 responses를 씁니다. responses: POST <URL>/responses, chat: POST <URL>/chat/completions, anthropic: Messages API이며 URL은 /v1 앞부분까지, gemini: Gemini API이며 URL은 /models 앞부분까지 입력합니다.',
  badProtocol: (protocols: string) => `프로토콜은 ${protocols} 중 하나여야 합니다`,
};
