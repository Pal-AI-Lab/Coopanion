import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  myWorlds: "Мои World",
  marketTab: "Магазин расширений",
  extensionList: "Список расширений",
  filterByName: "Фильтр по имени",
  allStates: "Все состояния",
  noMatches: "Нет расширений, подходящих под фильтр.",
  newGroup: "Новая группа",
  groupDefaultName: "Новая группа",
  renameGroup: "Переименовать группу",
  deleteGroup: "Удалить группу (расширения останутся)",
  pendingNote: "Расширения выше вступят в силу после перезапуска процесса.",
  packageInfo: "Сведения о расширении",
  updateAvailable: (from: string, to: string) => `Доступно обновление: ${from} → ${to}`,
  hideFromSidebar: "Скрыть из боковой панели",
  showInSidebar: "Показывать в боковой панели",
  builtinAlwaysOn: "Встроенные World всегда включены.",
  modeOff: "Остановлен",
  modeRunning: "Только работа",
  modeAttached: "Подключён",

  navLabel: 'Расширения World',
  introTitle: 'Расширения World',
  prefixReloadFailed: (msg: string) => `Не удалось перезагрузить префикс: ${msg}`,
  toggleFailed: (msg: string) => `Не удалось переключить: ${msg}`,
  reloadNowTitle: 'Перезагрузить системный префикс сейчас?',
  reloadNowBody: (name: string, wantVisible: boolean) =>
    (wantVisible ? `«${name}» снова виден агенту.` : `«${name}» теперь скрыт от агента.`)
    + '\n\nДоставка событий уже следует новому состоянию. Перезагрузка обновит промпт окружения и объявления инструментов и сохранит существующие сообщения разговора. '
    + 'Если отменить, они обновятся при следующей передаче контекста или перезапуске.',
  deactivateTitle: (name: string) => `Деактивировать «${name}»?`,
  deactivateBody: (id: string) =>
    'World немедленно останавливается (его управляемые внешние процессы и подключения завершаются), а в config.json '
    + `записывается worlds.${id}.enabled=false. Промпт окружения и инструменты агента сразу убираются; при повторной активации World пересобирается по текущей конфигурации.`,
  restartTitle: (name: string) => `Перезапустить «${name}»?`,
  restartBody: 'Останавливает и пересобирает World, чтобы применить параметры с пометкой о перезапуске World. Управляемые процессы и подключения останавливаются и запускаются заново.',
  missingReasonDefault: 'Не удалось загрузить этот World.',
  activateWorld: 'Активировать World',
  inactiveNoteManual: (id: string) => `Реализация есть локально, но World не собран. Чтобы включить его, задайте worlds.${id}.enabled значение true в config.json и перезапустите.`,
  hideFromAgent: 'Скрыть от агента',
  showToAgent: 'Показать агенту',
  restartWorld: 'Перезапустить World',
  deactivateWorld: 'Деактивировать World',
  prefixPending: 'Нужна перезагрузка префикса',
  noWorlds: 'Нет ни одного World',
  listLoadFailed: (msg: string) => `Не удалось загрузить список World: ${msg}`,
  loading: 'Загрузка…',
};
