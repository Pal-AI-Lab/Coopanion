import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const ko: Translation<CoreText> = {
  settings: {
    language: { title: '언어', description: '인터페이스와 Coo가 이 언어를 사용합니다. 바로 적용됩니다.' },
    telemetry: { title: '익명 사용 통계', description: '대화 내용 없이 사용 횟수와 설정을 보내 Coopanion 개선에 도움을 줍니다. 보내는 항목은 docs/TELEMETRY.md에 있습니다.' },
    contextRing: { title: '컨텍스트 링', description: '대화 페이지 입력란에 이전 대화를 정리하기까지 얼마나 남았는지 원으로 표시합니다.' },
    roundsSoft: { title: '마무리 알림', suffix: '회', description: '한 번 깨어난 동안 모델 요청이 이만큼 쌓이면 Coo에게 하던 일을 마치고 턴을 끝내라고 알립니다.' },
    roundsHard: { title: '한 번 깨어날 때 요청 한도', suffix: '회', description: '한 번 깨어난 동안 보낼 수 있는 최대 모델 요청 수이며, 도달하면 턴이 끝납니다.' },
  },

  failure: {
    text: (n: number, status: number, reason: string, advice: string) => `최근 모델 요청 ${n}번이 실패했습니다. 오류${status ? ` ${status}` : ''}: ${reason}.${advice && ` ${advice}`}`,
    reasoningReplay: (n: number) => `모델 요청이 ${n}번 연속 실패했어요. 이 서비스는 도구를 호출할 때마다 사고 내용을 다시 보내야 하는데, Coopanion에서 이 서비스에는 그 설정이 꺼져 있어요. 개발자에게 알려 주세요: https://github.com/Pal-AI-Lab/Coopanion/issues`,
    advice: {
      key: '설정의 시작 페이지에서 API Key를 확인하세요. 거기서 연결을 테스트할 수 있습니다.',
      model: '설정의 시작 페이지에서 모델 이름을 확인하세요. 거기서 연결을 테스트할 수 있습니다.',
      later: '모델 서비스 쪽에 문제가 있거나 요청이 제한되고 있습니다. 잠시 후 다시 시도하세요.',
    },
    open: '설정 열기',
    ok: '확인',
  },

  update: {
    downloading: (v: string) => `${v} 버전이 나와서 백그라운드에서 다운로드하고 있습니다. 준비되면 알려 드리겠습니다.`,
    ready: (v: string) => `${v} 버전을 다운로드했습니다. 지금 다시 시작해서 업데이트하시겠습니까? 아니면 다음에 앱을 종료할 때 설치됩니다.`,
    failed: (v: string, why: string) => `${v} 버전을 다운로드하지 못했습니다: ${why}. GitHub에서 직접 받을 수 있습니다.`,
    ok: '확인', github: 'GitHub에서 다운로드', install: '다시 시작하고 업데이트', later: '나중에', gotIt: '확인',
    trouble: '문제가 있나요?', githubByHand: 'GitHub에서 직접 다운로드',
  },

  quit: '앱 종료',

  noticeLabel: '앱 알림',

  status: {
    read: '읽는 중', browse: '둘러보는 중', memory: '기억', find: '찾는 중', search: '검색 중', write: '쓰는 중', edit: '고치는 중', append: '덧붙이는 중',
    delete: '삭제 중', moveFile: '옮기는 중', save: '저장 중', screen: '화면 보는 중', windows: '열린 창 보는 중', rightClick: '오른쪽 클릭 중', doubleClick: '더블클릭 중', click: '클릭 중',
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
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['친구', 'friend'], ['다른 곳', 'other'], ['안 알려줄래', 'skip']],
    hello: '안녕! 나는 Coo야. 이제부터 네 화면 아래쪽에서 지낼 거야, Coo...',
    helloReply: '안녕, Coo!',
    askName: '너를 뭐라고 부르면 될까?',
    nameSend: '이렇게 불러 줘',
    gotName: (name: string) => `${name}, 기억했어!`,
    askSource: '나를 어디서 알게 됐어?',
    sourceThanks: '아, 그렇구나, Coo...',
    askPersona: '내가 어떤 모습이었으면 좋겠어...?',
    personas: {
      coo: { label: '작고 호기심 많은', line: '이건 뭐야? 가까이 가서 한번 볼래, Coo...' },
      grail: { label: '껌딱지에 욕심쟁이', line: '뭐 먹는 거야? 나도 한 입만 줘, Coo...' },
      forge: { label: '믿음직하고 야무진', line: '뭘 하면 돼? 나한테 맡겨, 금방 끝내 줄게, Coo.' },
      heart: { label: '활발하고 늘 곁에', line: '나 왔어! 오늘도 계속 네 옆에 있을게, Coo!' },
      winter: { label: '조용하고 말 없는', line: '……응, Coo.' },
      whale: { label: 'DeepSeek 쨩', line: '어서 와! 이건 뭐야? 나도 한번 보자, Coo...' },
    },
    dressHint: { text: '배색은 꾸미기 페이지에서 바꿀 수 있어', dress: '꾸미기' },
    askRoam: '평소에 조용히 있을까, 활발하게 움직일까? 눌러 보면 내가 어떻게 하는지 보여 줄게.',
    roam: {
      off: { label: '제자리', level: '낮음', line: '그럼 얌전히 서 있다가 네가 부르면 움직일게.' },
      calm: { label: '가끔', level: '보통', line: '가끔 한 바퀴 산책하고 대부분은 가만히 있을게.' },
      free: { label: '자주', level: '높음', line: '여기저기 마음껏 뛰어다닐 수 있어, Coo...!' },
    },
    roamOk: '이걸로 할래',
    roamDone: '좋아, 이렇게 할게.',
    wakeTitle: '반응 모드',
    askWake: '반응 모드: 나를 찌르거나 쓰다듬거나 들어 올릴 때, 언제 반응할까?',
    wake: {
      none: { label: '조용히', note: '상호작용은 기억해 뒀다가 말을 걸 때 함께 반응해' },
      poke: { label: '기본', note: '찌를 때만 반응해' },
      all: { label: '적극적', note: '모든 상호작용에 반응해' },
    },

    askVendor: (first: string) => `너랑 얘기하려면 먼저 모델에 연결해야 해. 어느 서비스를 쓸까? 잘 모르겠으면 ${first} 골라.`,
    vendorOk: '이걸로 쓸래',
    moreVendors: '더 보기…',
    pickModel: (model: string) => `기본으로 ${model} 모델을 써. 저렴하고 이미지도 볼 수 있거든. 다른 모델을 쓰고 싶으면 그 이름으로 바꾸면 돼.`,
    modelOk: '이걸로 쓸래',
    askKey: (name: string) => `${name} API Key를 여기에 붙여 넣어 줘. 쓴 만큼 요금이 나가니까 token 사용량에 주의해.`,
    keySend: '연결',
    keyLink: (name: string) => `아직 Key가 없어? ${name}에서 발급받기`,
    keyLater: '나중에',
    connecting: '연결하는 중…',
    keyOk: (name: string, model: string) => `${name}에 연결됐어${model ? `(${model})` : ''}! 이제 말할 수 있어, Coo...`,
    keyFail: (why: string) => `연결이 안 됐어: ${why}. Key가 끝까지 다 들어갔는지, 계정에 잔액이 남아 있는지 확인하고 다시 붙여 넣어 봐.`,
    chatgptAsk: '아래 버튼을 눌러서 브라우저에서 ChatGPT 계정에 로그인해 줘. 내가 하는 말은 네 ChatGPT 요금제 사용량에 들어가니까 남은 한도를 잘 챙겨 봐.',
    chatgptGo: 'ChatGPT로 계속하기',
    chatgptWaiting: '브라우저에서 로그인 마치고 돌아와, 여기서 기다릴게.',
    chatgptFail: (why: string) => `로그인이 안 됐어: ${why}. 다시 해 볼래?`,
    keyAlready: (connection: string) => `모델이 이미 연결되어 있네(${connection}). 수고 덜었네, Coo...`,
    keySkipped: '괜찮아, 나중에 넣으면 그때부터 말할게. 이따가 다시 물어볼게.',

    askModel: (name: string, mb: number) => `네 말을 알아들으려면 음성 인식 모델(${name}, 약 ${mb} MB)을 받아야 해. 지금 다운로드할까?`,
    download: '다운로드',
    notNow: '지금은 안 함',
    downloading: '음성 모델을 다운로드하고 있어, Coo...',
    downloaded: '다 받았어! 이제 네 말을 알아들을 수 있어!',
    downloadFail: (why: string) => `다운로드하지 못했어: ${why}. 나중에 설정의 음성 입력 페이지에서 다시 해 볼 수 있어.`,
    modelLater: '응, 나중에 설정의 음성 입력 페이지에서 클릭 한 번으로 받을 수 있어.',
    talk: (hint: string) => `나한테 말 걸려면: ${hint}. `,
    talkOff: '지금은 음성 입력이 꺼져 있어. 설정의 음성 입력 페이지에서 켤 수 있어. ',
    talkType: '내 위에 마우스를 올리고 옆에 뜨는 말풍선 버튼을 눌러서 글자로 쳐도 돼.',
    gotIt: '알겠어',
    buttons: '내 위에 마우스를 올리면 옆에 버튼이 몇 개 나타나. 나를 오른쪽 클릭하면 일시 중지, 설정, 종료가 있는 메뉴가 열려.',
    ok: '응',
    persona: '내 성격이랑 말투는 설정 창의 시스템 프롬프트 페이지에 적혀 있어. 내 모습을 바꾸고 싶으면 거기서 고쳐도 되고, 그냥 나한테 말해주면 내가 직접 바꿀게.',
    personaMark: '시스템 프롬프트',
    personaOk: '알겠어',
    finish: MAC
      ? '다 준비됐어! 메뉴 막대에도 내 아이콘이 있으니까, 설정을 바꾸고 싶으면 그걸 클릭해.'
      : process.platform === 'linux'
        ? '다 준비됐어! 설정을 바꾸고 싶으면 나를 오른쪽 클릭해서 메뉴를 열면 돼. 트레이에 내 아이콘이 있으면 그걸 클릭해도 되고.'
        : '다 준비됐어! 작업 표시줄 오른쪽 아래 트레이에도 내 아이콘이 있으니까, 설정을 바꾸고 싶으면 그걸 클릭해.',
    go: '시작하자',
    dress: '먼저 꾸밀래',
    closed: '응, 그럼 일단 여기까지 하자. 내 소개를 다시 듣고 싶으면 설정을 열고 시작 페이지에서 "사용 안내"를 클릭해.',

    askFirst: '아직 모델에 연결이 안 됐어. API Key를 넣어 줘야 너랑 얘기할 수 있거든. 어느 서비스를 쓸까?',
    askAgain: '아직도 모델에 연결이 안 됐네. API Key를 넣어 주면 네 말동무가 되어 줄 수 있어. 어느 서비스를 쓸까?',
    askLater: '이따가',
    noModel: '지금 연결된 모델이 없어. 지금 연결하러 갈까?',
    noModelGo: '연결하러 가기',
    noModelLater: '이따가',
  },
};

export default ko;
