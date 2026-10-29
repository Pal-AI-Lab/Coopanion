import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "내 World",
  marketTab: "확장 마켓",
  extensionList: "확장 목록",
  filterByName: "이름으로 필터",
  allStates: "모든 상태",
  noMatches: "필터와 일치하는 확장이 없습니다.",
  newGroup: "새 그룹",
  groupDefaultName: "새 그룹",
  renameGroup: "그룹 이름 바꾸기",
  deleteGroup: "그룹 삭제(확장은 유지)",
  pendingNote: "위 확장은 프로세스를 재시작한 뒤 적용됩니다.",
  packageInfo: "확장 정보",
  updateAvailable: (from: string, to: string) => `업데이트 있음: ${from} → ${to}`,
  hideFromSidebar: "사이드바에서 숨기기",
  showInSidebar: "사이드바에 표시",
  builtinAlwaysOn: "내장 World는 항상 켜져 있습니다.",
  modeOff: "중지됨",
  modeRunning: "실행만",
  modeAttached: "연결됨",

  navLabel: 'World 확장',
  introTitle: 'World 확장',
  prefixReloadFailed: (msg: string) => `프리픽스를 다시 불러오지 못했습니다: ${msg}`,
  toggleFailed: (msg: string) => `전환하지 못했습니다: ${msg}`,
  reloadNowTitle: '지금 시스템 프리픽스를 다시 불러오시겠습니까?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `"${name}"이(가) 에이전트에게 다시 보입니다.` : `"${name}"을(를) 에이전트에게서 숨겼습니다.`)
    + '\n\n이벤트 전달은 이미 새 상태를 따릅니다. 다시 불러오면 환경 프롬프트와 도구 선언이 업데이트되고 기존 대화는 유지됩니다. '
    + '취소하면 다음 컨텍스트 인계나 재시작 때 업데이트됩니다.',
  deactivateTitle: (name: string) => `"${name}"을(를) 비활성화하시겠습니까?`,
  deactivateBody: (id: string) =>
    'World가 즉시 중지되고(관리하는 외부 프로세스와 연결도 함께 정리됨), config.json에 '
    + `worlds.${id}.enabled=false가 기록됩니다. 에이전트의 환경 프롬프트와 도구는 바로 제거되며, 다시 활성화하면 현재 설정으로 다시 만듭니다.`,
  restartTitle: (name: string) => `"${name}"을(를) 재시작하시겠습니까?`,
  restartBody: 'World를 중지하고 다시 만들어 "World 재시작 후 적용"으로 표시된 설정을 적용합니다. 관리하는 프로세스와 연결은 중지된 뒤 다시 시작됩니다.',
  missingReasonDefault: '이 World를 불러올 수 없습니다.',
  activateWorld: 'World 활성화',
  inactiveNoteManual: (id: string) => `로컬에 구현은 있지만 구성되지 않았습니다. 사용하려면 config.json에서 worlds.${id}.enabled를 true로 바꾸고 재시작하세요.`,
  hideFromAgent: '에이전트에게서 숨기기',
  showToAgent: '에이전트에게 표시',
  restartWorld: 'World 재시작',
  deactivateWorld: 'World 비활성화',
  prefixPending: '프리픽스 다시 불러오기 대기',
  noWorlds: 'World가 없습니다',
  listLoadFailed: (msg: string) => `World 목록을 불러오지 못했습니다: ${msg}`,
  loading: '불러오는 중…',
};
