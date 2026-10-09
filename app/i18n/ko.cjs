// 한국어: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: '시작하는 중…',

  trayOpenSettings: '설정 열기',
  trayShowPet: '펫 표시',
  trayLaunchAtLogin: '로그인 시 자동 시작',
  trayRestart: '다시 시작',
  trayQuit: '종료',

  coreFailed: (times, code, logFile) => `Core가 5분 안에 ${times}번 종료되어(종료 코드 ${code}) 더 이상 다시 시작하지 않습니다. 로그: ${logFile}`,
  coreRestarting: (code) => `Core가 예기치 않게 종료되었습니다(종료 코드 ${code}). 3초 뒤 다시 시작합니다`,

  strandedMessage: '업데이트 전 설정을 찾았습니다',
  strandedDetail: (stranded, parent) => `이전 자동 업데이트가 Coopanion을 지금 위치에 설치했습니다. 그 업데이트 전의 설정, API Key, 프롬프트, 기억은 아직 다음 위치에 있습니다:\n${stranded}\n\n`
    + `되돌리면 현재 데이터는 data-replaced-<시간>으로 이름이 바뀌어 ${parent}에 보관되며, 아무것도 삭제되지 않습니다. "현재 설정 유지"를 선택하면 다시 묻지 않습니다.`,
  strandedRestore: '업데이트 전 설정 사용',
  strandedKeep: '현재 설정 유지',
};
