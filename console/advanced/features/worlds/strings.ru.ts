import type { en } from './strings.ts';

const pluralRules = new Intl.PluralRules('ru');
const plural = (n: number, one: string, few: string, many: string) => {
  const form = pluralRules.select(n);
  return form === 'one' ? one : form === 'many' ? many : few;
};

export const S: Partial<typeof en> = {
  myWorlds: "Мои World",
  marketTab: "Магазин расширений",
  extensionList: "Список расширений",
  filterByName: "Фильтр по имени",
  allStates: "Все состояния",
  newGroup: "Новая группа",
  groupDefaultName: "Новая группа",
  renameGroup: "Переименовать группу",
  deleteGroup: "Удалить группу (расширения останутся)",
  pendingNote: "Расширения выше вступят в силу после перезапуска процесса.",
  configure: "Настроить",
  packageInfo: "Сведения о расширении",
  modeOff: "Остановлен",
  modeRunning: "Только работа",
  modeAttached: "Подключён",

  navLabel: 'Обзор World',
  introTitle: 'World',
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
  declaredByPersona: 'Объявлено Persona',
  optionalAddon: 'Дополнительное расширение',
  open: 'Открыть',
  missingReasonDefault: 'Не удалось загрузить этот World.',
  activateWorld: 'Активировать World',
  inactiveNoteManual: (id: string) => `Реализация есть локально, но World не собран. Чтобы включить его, задайте worlds.${id}.enabled значение true в config.json и перезапустите.`,
  hideFromAgent: 'Скрыть от агента',
  showToAgent: 'Показать агенту',
  restartWorld: 'Перезапустить World',
  deactivateWorld: 'Деактивировать World',
  prefixPending: 'Нужна перезагрузка префикса',
  kvTools: 'Инструменты',
  kvNone: '(нет)',
  kvWorkspace: 'Рабочая область',
  listSep: ', ',
  driftNote: 'Доставка событий уже следует новому состоянию; промпт окружения и объявления инструментов обновятся после перезагрузки префикса.',
  noWorlds: 'Нет ни одного World',
  listLoadFailed: (msg: string) => `Не удалось загрузить список World: ${msg}`,
  loading: 'Загрузка…',
};
