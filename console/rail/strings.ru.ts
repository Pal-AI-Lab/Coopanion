import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  // index.ts
  navAria: 'Навигация настроек',
  groupWorlds: 'World',
  moduleInstancesAria: 'Экземпляры World',

  runResume: 'Продолжить',
  runPause: 'Приостановить',
  shutdownAria: 'Выключить',
  finishing: 'Выключение…',
  shutdownTitle: 'Выключение',
  shutdownBody: 'Процесс завершится, и соединение будет разорвано.',
  confirmShutdownTitle: '⚠ Выключение',
  confirmShutdownAgainTitle: '⚠⚠ Подтвердить выключение?',
  confirmShutdownAgainBody: 'Остановить работу и завершить процесс?',
  finishingToast: 'Выключение…',
  stepIncomplete: 'не выполнен',
  doneShutdown: 'Выключено',
  resultLocalIncomplete: 'Локальные шаги выключения выполнены не полностью',
  resultExternalUnverified: 'Локально выключено; внешнее состояние не проверено',
  resultUnverified: 'Шаги выключения выполнены; состояние не проверено',
  resultDefault: 'Шаги выключения выполнены.',
  noReceipt: (msg: string) =>
    `Результат выключения не получен (${msg}); возможно, процесс уже завершился.`,
  docTitle: (name: string) => `Настройки · ${name}`,
  renameTitle: 'Нажмите, чтобы переименовать',
  renameSaved: 'Отображаемое имя сохранено',
  renameFailed: (msg: string) => `Отображаемое имя не сохранено: ${msg}`,
  // avatar.ts
  changeAvatar: 'Сменить аватар Coo',
  uploadAvatar: 'Загрузить и обрезать аватар Coo',
  unreadable: 'Не удалось прочитать это изображение',
  cropPreview: 'Предпросмотр обрезки аватара',
  zoomAria: 'Масштаб аватара',
  zoom: 'Масштаб',
  note: 'Перетащите изображение, чтобы сдвинуть его; масштабируйте колесом мыши или ползунком. При сохранении avatar.png записывается в папку данных Coo.',
  cancel: 'Отмена',
  save: 'Сохранить аватар',
  cropTitle: 'Обрезка аватара',
  noCanvas: 'Браузеру не удалось создать холст для изображения',
  saved: 'Аватар сохранён',
};
