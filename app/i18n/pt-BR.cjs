// Português (Brasil): text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Iniciando…',

  trayOpenSettings: 'Abrir configurações',
  trayShowPet: 'Mostrar o pet',
  trayClickThrough: 'Deixar os cliques atravessarem o Coo',
  trayClickThroughTip: 'Coopanion (os cliques atravessam o Coo)',
  trayLaunchAtLogin: 'Abrir ao fazer login',
  trayRestart: 'Reiniciar',
  trayQuit: 'Sair',

  coreFailed: (times, code, logFile) => `O Core fechou ${times} vezes em 5 minutos (código de saída ${code}) e não será mais reiniciado. Se o app acabou de ser atualizado, escolha "Sair" no menu da bandeja e abra o Coopanion de novo. Log: ${logFile}`,
  coreIncomplete: (url, logFile) => `Faltam arquivos do Coopanion, por isso o Core não consegue iniciar. Baixe o instalador completo em ${url} e instale na mesma pasta; as configurações, API Keys, prompts e memória são mantidos. Log: ${logFile}`,
  coreRestarting: (code) => `O Core fechou inesperadamente (código de saída ${code}); reiniciando em 3 segundos`,
  coreLocked: (pid, file) => `Outro processo${pid ? ` (PID ${pid})` : ''} está usando os dados do Coopanion, então o Core não foi iniciado. Espere ele terminar ou encerre-o e depois escolha "Reiniciar" no menu da bandeja. Arquivo de bloqueio: ${file}`,
  corePortsBusy: (from, to) => `As portas do console ${from}–${to} estão todas ocupadas, então o Core não foi iniciado. Talvez já haja ${to - from + 1} cópias do Coopanion abertas, ou outros programas estão usando essas portas. Feche um deles e depois escolha "Reiniciar" no menu da bandeja.`,

  strandedMessage: 'Configurações de antes da atualização encontradas',
  strandedDetail: (stranded, parent) => `Uma atualização automática anterior instalou o Coopanion onde ele está agora. As configurações, API Keys, prompts e memória de antes dessa atualização ainda estão em:\n${stranded}\n\n`
    + `Voltar para elas renomeia os dados atuais para data-replaced-<horário> e os mantém em ${parent}; nada é excluído. Depois de “Manter as atuais”, isso não será perguntado de novo.`,
  strandedRestore: 'Usar as configurações de antes',
  strandedKeep: 'Manter as atuais',

  dataNotWritable: (dir, suggested) => `O Coopanion não consegue gravar na pasta de dados e não foi iniciado:\n${dir}\n\nExecute o instalador de novo e instale em uma pasta em que sua conta possa gravar, por exemplo:\n${suggested}`,

  dataFoundMessage: 'Dados anteriores do Coopanion encontrados',
  dataFoundDetail: (data, when, program) => `O Coopanion agora está instalado em ${program}, que ainda não tem dados. Os dados usados até agora estão em:\n${data}\nÚltima inicialização: ${when}\n\n`
    + 'Ao herdá-los, você mantém as configurações, API Keys, prompts e a memória. Ao começar de novo, o Coopanion recomeça do zero aqui; os dados anteriores ficam onde estão e não são apagados.',
  dataInherit: 'Herdar estes dados',
  dataNew: 'Começar de novo',
  dataMissingMessage: 'Os dados usados até agora não foram encontrados',
  dataMissingDetail: (data, when, beside) => `Os dados usados até agora estavam em:\n${data}\nÚltima inicialização: ${when}\nNão há mais dados do Coopanion lá.\n\n`
    + `Se estiverem em um drive removível ou na rede, conecte-o e clique em Tentar de novo. Se foram movidos, clique em Escolher pasta para encontrá-los. Começar de novo recomeça do zero aqui:\n${beside}`,
  dataRetry: 'Tentar de novo',
  dataChoose: 'Escolher pasta',
  dataQuit: 'Sair',
  dataChooseTitle: 'Escolha a pasta de dados do Coopanion',
  dataChooseInvalid: (dir) => `Esta pasta não tem dados do Coopanion:\n${dir}\n\nEscolha a pasta de instalação ou a pasta data dentro dela.`,
};
