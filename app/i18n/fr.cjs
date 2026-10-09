// Français: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
module.exports = {
  starting: 'Démarrage…',

  trayOpenSettings: 'Ouvrir les paramètres',
  trayShowPet: 'Afficher le compagnon',
  trayLaunchAtLogin: "Lancer à l'ouverture de session",
  trayRestart: 'Redémarrer',
  trayQuit: 'Quitter',

  coreFailed: (times, code, logFile) => `Le Core s'est arrêté ${times} fois en 5 minutes (code de sortie ${code}) et n'est plus redémarré. Journal : ${logFile}`,
  coreRestarting: (code) => `Le Core s'est arrêté de façon inattendue (code de sortie ${code}) ; redémarrage dans 3 secondes`,

  strandedMessage: "Des paramètres d'avant la mise à jour ont été trouvés",
  strandedDetail: (stranded, parent) => `Une mise à jour automatique précédente a installé Coopanion à son emplacement actuel. Les paramètres, API Keys, prompts et la mémoire d'avant cette mise à jour se trouvent toujours dans :\n${stranded}\n\n`
    + `Revenir en arrière renomme les données actuelles en data-replaced-<heure> et les conserve dans ${parent} ; rien n'est supprimé. Après « Garder les actuels », la question ne sera plus posée.`,
  strandedRestore: "Reprendre les paramètres d'avant",
  strandedKeep: 'Garder les actuels',
};
