import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const ko: Translation<CoreText> = {
  settings: {
    language: { title: '언어', description: '설정 창과 펫의 말풍선, 메뉴에 이 언어를 쓰며, Coo도 이 언어로 말합니다. 바로 적용됩니다.' },
    telemetry: { title: '익명 사용 통계', description: '대화 내용 없이 사용 횟수와 설정을 보내 Coopanion 개선에 도움을 줍니다. 보내는 항목은 docs/TELEMETRY.md에 있습니다.' },
    roundsSoft: { title: '마무리 알림', suffix: '회', description: '한 번 깨어난 동안 모델 요청이 이만큼 쌓이면 Coo에게 하던 일을 마치고 턴을 끝내라고 알립니다.' },
    roundsHard: { title: '한 번 깨어날 때 요청 한도', suffix: '회', description: '한 번 깨어난 동안 보낼 수 있는 최대 모델 요청 수이며, 도달하면 턴이 끝납니다.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `최근 모델 요청 ${n}번이 실패했습니다. 오류${status ? ` ${status}` : ''}: ${reason}. 설정의 시작 페이지에서 모델 이름과 API Key를 확인하세요. 거기서 연결을 테스트할 수 있습니다.`,
    open: '설정 열기',
    ok: '확인',
  },

  update: {
    downloading: (v: string) => `${v} 버전이 나와서 백그라운드에서 다운로드하고 있습니다. 준비되면 알려 드리겠습니다. 다운로드가 멈추면 GitHub에서 직접 받을 수 있습니다.`,
    ready: (v: string) => `${v} 버전을 다운로드했습니다. 지금 다시 시작해서 업데이트하시겠습니까? 아니면 다음에 앱을 종료할 때 설치됩니다.`,
    failed: (v: string, why: string) => `${v} 버전을 다운로드하지 못했습니다: ${why}. GitHub에서 직접 받을 수 있습니다.`,
    ok: '확인', github: 'GitHub에서 다운로드', install: '다시 시작하고 업데이트', later: '나중에', gotIt: '확인',
  },

  quit: '앱 종료',
  cuaYes: '예',
  cuaNo: '이번에는 아니요',

  status: {
    read: '읽는 중', browse: '둘러보는 중', memory: '기억', find: '찾는 중', search: '검색 중', write: '쓰는 중', edit: '고치는 중', append: '덧붙이는 중',
    delete: '삭제 중', save: '저장 중', screen: '화면 보는 중', windows: '열린 창 보는 중', rightClick: '오른쪽 클릭 중', doubleClick: '더블클릭 중', click: '클릭 중',
    move: '마우스 옮기는 중', drag: '드래그 중', scroll: '스크롤 중', focus: '창 전환 중', type: '입력 중', key: '키 누르는 중', wait: '기다리는 중',
    alarmSet: '알람 맞추는 중', alarmList: '알람 확인 중', alarmCancel: '알람 취소 중',
    quoted: (text: string) => `"${text}"`,
    seconds: (n: number) => `${n}초`,
    minutesLater: (n: number) => `${n}분 후`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `펫이 ${figure}의 "${preset}"(으)로 바뀔 때 적용됩니다`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['친구', 'friend'], ['다른 곳', 'other'], ['밝히지 않음', 'skip']],
    hello: '안녕하세요! 저는 Coo입니다. 이제부터 화면 아래쪽에서 지냅니다. Coo...',
    helloReply: '안녕, Coo!',
    askName: '어떻게 불러 드리면 될까요?',
    nameSend: '이 이름으로',
    gotName: (name: string) => `${name}, 기억하겠습니다!`,
    askSource: '저를 어디서 알게 되셨나요?',
    sourceThanks: '아, 그렇군요. Coo...',
    askRoam: '평소에 조용히 있을까요, 활발하게 움직일까요? 하나를 클릭하면 제가 어떻게 하는지 보여 드립니다.',
    roam: {
      off: { label: '제자리', level: '낮음', line: '그럼 가만히 서 있다가 부르시면 움직이겠습니다.' },
      calm: { label: '가끔', level: '보통', line: '가끔 한 바퀴 산책하고 대부분은 제자리에 있겠습니다.' },
      free: { label: '자주', level: '높음', line: '여기저기 마음껏 뛰어다니겠습니다. Coo...!' },
    },
    roamOk: '이걸로',
    roamDone: '좋습니다, 그렇게 하겠습니다.',

    askVendor: (first: string) => `대화하려면 모델에 연결해야 합니다. 어느 서비스를 쓸까요? 잘 모르겠으면 ${first}을(를) 고르세요.`,
    vendorOk: '이 서비스 사용',
    moreVendors: '더 보기…',
    pickModel: (model: string) => `기본으로 ${model}을(를) 씁니다. 저렴하고 이미지도 읽을 수 있습니다. 다른 모델을 쓰려면 그 이름을 대신 입력하세요.`,
    modelOk: '이 모델 사용',
    askKey: (name: string) => `${name} API Key를 여기에 붙여 넣으세요. 사용량에 따라 요금이 부과되니 token 사용량을 확인하세요.`,
    keySend: '연결',
    keyLink: (name: string) => `아직 Key가 없나요? ${name}에서 발급받으세요`,
    keyLater: '나중에',
    connecting: '연결하는 중…',
    keyOk: (name: string, model: string) => `${name}에 연결했습니다${model ? `(${model})` : ''}! 이제 말할 수 있습니다. Coo...`,
    keyFail: (why: string) => `연결하지 못했습니다: ${why}. Key가 빠짐없이 들어갔는지, 계정에 잔액이 남아 있는지 확인하고 다시 붙여 넣어 보세요.`,
    keyAlready: (connection: string) => `모델이 이미 연결되어 있습니다(${connection}). 간단하네요. Coo...`,
    keySkipped: '괜찮습니다. 추가하시면 그때부터 말하겠습니다. 나중에 다시 여쭙겠습니다.',

    askModel: (mb: number) => `말씀을 알아들으려면 음성 인식 모델(FunASR, 약 ${mb} MB)을 다운로드해야 합니다. 지금 다운로드할까요?`,
    download: '다운로드',
    notNow: '지금은 안 함',
    downloading: '음성 모델을 다운로드하는 중입니다. Coo...',
    downloaded: '완료! 이제 말씀을 알아들을 수 있습니다.',
    downloadFail: (why: string) => `다운로드하지 못했습니다: ${why}. 설정의 음성 입력 페이지에서 다시 시도할 수 있습니다.`,
    modelLater: '알겠습니다. 나중에 설정의 음성 입력 페이지에서 클릭 한 번으로 다운로드할 수 있습니다.',
    talk: (hint: string) => `저와 말하려면: ${hint}. `,
    talkOff: '지금은 음성 입력이 꺼져 있습니다. 설정의 음성 입력 페이지에서 켤 수 있습니다. ',
    talkType: '포인터를 제게 올리고 옆의 말풍선 버튼을 클릭해 입력할 수도 있습니다.',
    gotIt: '알겠습니다',
    buttons: '포인터를 제게 올리면 옆에 버튼 몇 개가 나타납니다. 저를 오른쪽 클릭하면 일시 중지, 설정, 종료가 있는 메뉴가 열립니다.',
    ok: '확인',
    persona: '제 성격과 말투는 설정 창의 시스템 프롬프트 페이지에 적혀 있습니다. 저를 바꾸려면 거기서 고치거나, 그냥 말씀해 주시면 제가 직접 바꾸겠습니다.',
    personaMark: '시스템 프롬프트',
    personaOk: '알겠습니다',
    finish: MAC
      ? '준비 완료! 메뉴 막대에도 제 아이콘이 있으니 클릭해서 설정을 바꾸세요.'
      : process.platform === 'linux'
        ? '준비 완료! 설정을 바꾸려면 저를 오른쪽 클릭해 메뉴를 여세요. 트레이에 제 아이콘이 있으면 그것을 클릭해도 됩니다.'
        : '준비 완료! 작업 표시줄 오른쪽 아래 트레이에도 제 아이콘이 있으니 클릭해서 설정을 바꾸세요.',
    go: '시작하기',
    dress: '먼저 꾸미기',
    closed: '알겠습니다, 여기까지 하겠습니다. 제 소개를 다시 들으려면 설정을 열고 시작 페이지에서 "사용 안내"를 클릭하세요.',

    askFirst: '아직 모델에 연결되지 않았습니다. API Key를 추가하면 말할 수 있습니다. 어느 서비스를 쓸까요?',
    askAgain: '아직 연결된 모델이 없습니다. API Key를 추가하면 곁에서 함께할 수 있습니다. 어느 서비스를 쓸까요?',
    askLater: '나중에',
    noModel: '연결된 모델이 없습니다. 지금 연결하시겠습니까?',
    noModelGo: '연결',
    noModelLater: '나중에',
  },
};

export default ko;
