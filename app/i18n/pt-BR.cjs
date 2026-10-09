// Português (Brasil): text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Iniciando…',

  trayOpenSettings: 'Abrir configurações',
  trayShowPet: 'Mostrar o pet',
  trayLaunchAtLogin: 'Abrir ao fazer login',
  trayRestart: 'Reiniciar',
  trayQuit: 'Sair',

  coreFailed: (times, code, logFile) => `O Core fechou ${times} vezes em 5 minutos (código de saída ${code}) e não será mais reiniciado. Log: ${logFile}`,
  coreRestarting: (code) => `O Core fechou inesperadamente (código de saída ${code}); reiniciando em 3 segundos`,

  strandedMessage: 'Configurações de antes da atualização encontradas',
  strandedDetail: (stranded, parent) => `Uma atualização automática anterior instalou o Coopanion onde ele está agora. As configurações, API Keys, prompts e memória de antes dessa atualização ainda estão em:\n${stranded}\n\n`
    + `Voltar para elas renomeia os dados atuais para data-replaced-<horário> e os mantém em ${parent}; nada é excluído. Depois de “Manter as atuais”, isso não será perguntado de novo.`,
  strandedRestore: 'Usar as configurações de antes',
  strandedKeep: 'Manter as atuais',
};
