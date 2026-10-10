import type { en, stepEn } from './strings.ts';
import type { Touch } from './index.ts';

export const S: Partial<typeof en> = {
  nav: '대화',
  title: '대화',
  trace: '실행 기록',
  traceHint: '고급 모드의 전체 실행 기록: 컨텍스트, 도구 호출, 원시 이벤트',
  placeholder: (bot: string) => `${bot}에게 할 말…`,
  connecting: '연결하는 중…',
  empty: (bot: string) => `아직 ${bot}에게 한 말이 없습니다.`,
  older: '이전 대화',
  voice: '음성',
  idle: '대기 중',
  thinking: (bot: string) => `${bot} 생각 중…`,
  doing: (what: string) => `작업 중: ${what}`,
  retry: (at: string) => `모델이 응답하지 않았습니다. ${at}에 다시 시도합니다`,
  handoff: '이전 대화를 정리하는 중',
  paused: '일시 중지됨 · 재개하면 메시지가 전달됩니다',
  queued: (bot: string) => `대기 중 · 이 단계가 끝나면 ${bot}에게 전달됩니다`,
  queuedPaused: '일시 중지됨 · 재개하면 전달됩니다',
  sendNow: '지금 보내기',
  sendNowHint: (bot: string) => `${bot}의 현재 작업을 멈추고 바로 전달합니다`,
  withdraw: '되돌리기',
  withdrawHint: '입력창으로 되돌립니다',
  discarded: '전달되지 않음: 대기열이 비워졌습니다',
  imageCount: (n: number) => `[이미지 ${n}장]`,
  ownAnswer: '직접 답하기…',
  send: '보내기',
  computer: '컴퓨터 사용',
  steps: (n: number) => `${n}단계`,
  things: (n: number) => `작업 ${n}개 완료`,
  seconds: (s: number) => `${s}초`,
  imagesUnseen: (bot: string) => `현재 모델은 이미지를 볼 수 없어 ${bot}에게는 보낸 이미지 수만 전달됩니다.`,
  touch: (t: Touch, b: string): string => {
    const out = t.crashed ? `. ${b}은(는) 잠시 기절했습니다` : '';
    switch (t.kind) {
      case 'poke': return t.woke ? `잠든 ${b}을(를) 찔러 깨웠습니다` : t.count > 1 ? `${b}을(를) ${t.count}번 찔렀습니다` : `${b}을(를) 찔렀습니다`;
      case 'pet': return t.count > 1 ? `${b}을(를) 여러 번 쓰다듬었습니다` : `${b}을(를) 쓰다듬었습니다`;
      case 'throw': return `${b}을(를) 들어 올려 던졌습니다${out}`;
      case 'drop': return `${b}을(를) 들어 다른 곳으로 옮겼습니다${out}`;
      default: return `${b}은(는) 땅에 세게 떨어져 잠시 기절했습니다`;
    }
  },
  figure: (change: string, name: string, b: string): string => (change === 'figure' ? `${b}을(를) '${name}'(으)로 바꿨습니다` : change === 'dress' ? `${b}의 옷을 갈아입혔습니다` : `'${name}'을(를) 표시하지 못해 Coo를 표시합니다`),
};

export const STEP: Partial<typeof stepEn> = {
  cua_screenshot: '스크린샷', cua_click: '클릭', cua_move: '마우스 이동', cua_drag: '드래그', cua_scroll: '스크롤', cua_type: '입력',
  cua_key: '키 누르기', cua_windows: '창 목록 보기', cua_focus: '창 전환', cua_wait: '대기',
  pet_walk_to: '걷기', pet_act: '동작하기', pet_set: '스스로 조정', pet_quiet: '잠시 조용히',
};
