// Русский: text of the main process. Keys as in en.cjs; a key left out reads en.cjs.
const pluralRules = new Intl.PluralRules('ru');
const plural = (n, one, few, many) => {
  const form = pluralRules.select(n);
  return form === 'one' ? one : form === 'many' ? many : few;
};

module.exports = {
  starting: 'Запуск…',

  trayOpenSettings: 'Открыть настройки',
  trayShowPet: 'Показать питомца',
  trayLaunchAtLogin: 'Запускать при входе в систему',
  trayRestart: 'Перезапустить',
  trayQuit: 'Выйти',

  coreFailed: (times, code, logFile) => `Core завершился ${times} ${plural(times, 'раз', 'раза', 'раз')} за 5 минут (код выхода ${code}) и больше не перезапускается. Журнал: ${logFile}`,
  coreRestarting: (code) => `Core неожиданно завершился (код выхода ${code}); перезапуск через 3 секунды`,

  strandedMessage: 'Найдены настройки, сохранённые до обновления',
  strandedDetail: (stranded, parent) => `Одно из прошлых автоматических обновлений установило Coopanion туда, где он сейчас. Настройки, API Key, промпты и память, сохранённые до этого обновления, по-прежнему находятся здесь:\n${stranded}\n\n`
    + `При возврате текущие данные переименовываются в data-replaced-<время> и остаются в ${parent}; ничего не удаляется. После выбора «Оставить текущие» этот вопрос больше не появится.`,
  strandedRestore: 'Вернуть прежние настройки',
  strandedKeep: 'Оставить текущие',
};
