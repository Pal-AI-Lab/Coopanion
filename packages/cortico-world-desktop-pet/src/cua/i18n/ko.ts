import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const ko: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who}에서 컴퓨터를 사용하려고 합니다. 화면을 보고 마우스와 키보드를 조작합니다. 이번에 허용하시겠습니까?`,
    once: (who: string, minutes: number) => `${who}에서 마우스와 키보드를 사용하려고 합니다. 앞으로 ${minutes}분 동안 허용하시겠습니까?`,
    acting: (who: string) => `${who}에서 마우스와 키보드를 사용하려고 합니다. 이번에 허용하시겠습니까?`,
    caption: '컴퓨터 사용',
    yes: '예',
    no: '이번에는 아니요',
  },

  preflight: {
    noDisplay: '컴퓨터 사용은 Linux에서 X11(Wayland에서는 XWayland)이 필요합니다. DISPLAY가 설정되어 있지 않습니다.',
    unsupported: '컴퓨터 사용은 Windows, macOS, Linux에서만 실행됩니다.',
  },

  console: {
    engine: '입력 엔진',
    screen: (w: number, h: number) => `화면 ${w}×${h}`,
    onDemand: '필요할 때 시작',
    exited: (code: number | null) => `엔진 프로세스가 종료되었습니다(종료 코드 ${code})`,
    allowed: '허용',
    viewOnly: '보기만',
    asking: '묻기',
    levels: { 'ask-each-turn': '매 턴', 'ask-before-acting': '조작 전', 'ask-once': (minutes: number) => `${minutes}분에 한 번`, 'never-ask': '묻지 않음' },
  },

  config: {
    group: '컴퓨터 사용',
    enabled: { title: '컴퓨터 사용 켜기' },
    control: { title: '마우스와 키보드 허용', description: '끄면 스크린샷과 창 목록만 쓸 수 있습니다.' },
    permission: { title: '먼저 물어볼 때', description: 'ask-each-turn: 매 턴 화면을 보거나 조작하기 전에 묻습니다. ask-before-acting: 화면 보기는 묻지 않고, 매 턴 마우스와 키보드를 쓰기 전에 묻습니다. ask-once: 화면 보기는 묻지 않고, 마우스와 키보드를 쓰기 전에 한 번 묻습니다. 허용하면 "허용 유지 시간" 동안 유지됩니다. never-ask: 묻지 않습니다.' },
    grantMinutes: { title: '허용 유지 시간', suffix: '분', description: 'ask-once에만 적용됩니다.' },
    userIdleMs: { title: '비켜 주는 시간', description: '마우스나 키보드를 사용한 뒤 이만큼 움직임이 없을 때까지 기다립니다.' },
    maxYieldWaitMs: { title: '최대 대기 시간' },
    maxWidth: { title: '스크린샷 최대 너비' },
    maxHeight: { title: '스크린샷 최대 높이' },
    quality: { title: '스크린샷 품질' },
    afterAction: { title: '조작 후 스크린샷' },
    settleMs: { title: '스크린샷 전 대기' },
  },
};

export default ko;
