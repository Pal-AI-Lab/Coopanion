// 한국어: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: '시작하는 중…',

  trayOpenSettings: '설정 열기',
  trayShowPet: '펫 표시',
  trayLaunchAtLogin: '로그인 시 자동 시작',
  trayRestart: '다시 시작',
  trayQuit: '종료',

  coreFailed: (times, code, logFile) => `Core가 5분 안에 ${times}번 종료되어(종료 코드 ${code}) 더 이상 다시 시작하지 않습니다. 방금 업데이트했다면 트레이 메뉴에서 '종료'를 선택한 뒤 Coopanion을 다시 여세요. 로그: ${logFile}`,
  coreIncomplete: (url, logFile) => `Coopanion 프로그램 파일이 일부 없어 Core를 시작할 수 없습니다. ${url}에서 전체 설치 프로그램을 내려받아 원래 폴더에 설치하세요. 설정, API Key, 프롬프트, 기억은 그대로 유지됩니다. 로그: ${logFile}`,
  coreRestarting: (code) => `Core가 예기치 않게 종료되었습니다(종료 코드 ${code}). 3초 뒤 다시 시작합니다`,
  coreLocked: (pid, file) => `다른 프로세스${pid ? `(PID ${pid})` : ''}가 Coopanion 데이터를 사용 중이라 Core가 시작되지 않았습니다. 그 프로세스가 끝나기를 기다리거나 직접 종료한 뒤 트레이 메뉴에서 '다시 시작'을 선택하세요. 잠금 파일: ${file}`,
  corePortsBusy: (from, to) => `콘솔 포트 ${from}–${to}가 모두 사용 중이라 Core가 시작되지 않았습니다. Coopanion이 이미 ${to - from + 1}개 실행 중이거나 다른 프로그램이 이 포트를 쓰고 있습니다. 그중 하나를 종료한 뒤 트레이 메뉴에서 '다시 시작'을 선택하세요.`,

  strandedMessage: '업데이트 전 설정을 찾았습니다',
  strandedDetail: (stranded, parent) => `이전 자동 업데이트가 Coopanion을 지금 위치에 설치했습니다. 그 업데이트 전의 설정, API Key, 프롬프트, 기억은 아직 다음 위치에 있습니다:\n${stranded}\n\n`
    + `되돌리면 현재 데이터는 data-replaced-<시간>으로 이름이 바뀌어 ${parent}에 보관되며, 아무것도 삭제되지 않습니다. "현재 설정 유지"를 선택하면 다시 묻지 않습니다.`,
  strandedRestore: '업데이트 전 설정 사용',
  strandedKeep: '현재 설정 유지',

  dataNotWritable: (dir, suggested) => `Coopanion이 데이터 폴더에 쓸 수 없어 시작하지 않았습니다:\n${dir}\n\n설치 프로그램을 다시 실행해 현재 사용자가 쓸 수 있는 폴더에 설치하세요. 예:\n${suggested}`,

  dataFoundMessage: '이전 Coopanion 데이터를 찾았습니다',
  dataFoundDetail: (data, when, program) => `Coopanion이 지금 ${program}에 설치되어 있고, 여기에는 아직 데이터가 없습니다. 이전에 쓰던 데이터 위치:\n${data}\n마지막 실행: ${when}\n\n`
    + '이어받으면 설정, API Key, 프롬프트, 기억을 그대로 씁니다. 새로 시작하면 지금 위치에서 처음부터 시작하며, 이전 데이터는 그 자리에 남고 삭제되지 않습니다.',
  dataInherit: '이 데이터 이어받기',
  dataNew: '새로 시작',
  dataMissingMessage: '이전에 쓰던 데이터를 찾을 수 없습니다',
  dataMissingDetail: (data, when, beside) => `이전에 쓰던 데이터 위치:\n${data}\n마지막 실행: ${when}\n지금 그곳에 Coopanion 데이터가 없습니다.\n\n`
    + `외장 드라이브나 네트워크 위치에 있다면 연결한 뒤 「다시 시도」를 누르세요. 다른 곳으로 옮겼다면 「폴더 선택」으로 찾아 주세요. 새로 시작하면 여기에서 처음부터 시작합니다:\n${beside}`,
  dataRetry: '다시 시도',
  dataChoose: '폴더 선택',
  dataQuit: '종료',
  dataChooseTitle: 'Coopanion 데이터 폴더 선택',
  dataChooseInvalid: (dir) => `이 폴더에는 Coopanion 데이터가 없습니다:\n${dir}\n\n설치 폴더나 그 안의 data 폴더를 선택하세요.`,
};
