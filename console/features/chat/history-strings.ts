import { pick } from '../../base/language.ts';

const zh = {
  history: '查找记录', keyword: '搜索聊天记录', date: '日期', search: '查找',
  export: '导出全部记录', exportDay: '导出当天记录', reveal: '打开所在文件夹',
  latest: '回到最新', previous: '上一条', next: '下一条', more: '更多结果',
  empty: '没有找到记录', loading: '正在读取记录…', failed: '读取记录失败，请重试',
  saved: '聊天记录已导出', saveFailed: '导出失败，请重试',
};
const en: typeof zh = {
  history: 'Find history', keyword: 'Search chat history', date: 'Date', search: 'Search',
  export: 'Export all history', exportDay: 'Export this day', reveal: 'Show in folder',
  latest: 'Back to latest', previous: 'Previous match', next: 'Next match', more: 'More results',
  empty: 'No matches', loading: 'Reading history…', failed: 'Could not read history. Try again.',
  saved: 'Chat history exported', saveFailed: 'Could not export history. Try again.',
};
const locales: Record<string, typeof zh> = {
  'zh-Hant': {
    history: '尋找記錄', keyword: '搜尋聊天記錄', date: '日期', search: '搜尋',
    export: '匯出全部記錄', exportDay: '匯出當天記錄', reveal: '開啟所在資料夾',
    latest: '回到最新', previous: '上一筆', next: '下一筆', more: '更多結果',
    empty: '沒有找到記錄', loading: '正在讀取記錄…', failed: '讀取記錄失敗，請重試',
    saved: '聊天記錄已匯出', saveFailed: '匯出失敗，請重試',
  },
  ja: {
    history: '履歴を検索', keyword: 'チャット履歴を検索', date: '日付', search: '検索',
    export: 'すべての履歴を保存', exportDay: 'この日の履歴を保存', reveal: '保存先フォルダーを開く',
    latest: '最新に戻る', previous: '前の結果', next: '次の結果', more: 'さらに表示',
    empty: '該当する履歴がありません', loading: '履歴を読み込み中…', failed: '履歴を読み込めませんでした。再試行してください。',
    saved: 'チャット履歴を保存しました', saveFailed: '保存できませんでした。再試行してください。',
  },
  ko: {
    history: '기록 찾기', keyword: '대화 기록 검색', date: '날짜', search: '검색',
    export: '전체 기록 내보내기', exportDay: '선택한 날짜 내보내기', reveal: '저장 폴더 열기',
    latest: '최신 대화로', previous: '이전 결과', next: '다음 결과', more: '결과 더 보기',
    empty: '검색 결과가 없습니다', loading: '기록을 읽는 중…', failed: '기록을 읽지 못했습니다. 다시 시도하세요.',
    saved: '대화 기록을 내보냈습니다', saveFailed: '내보내지 못했습니다. 다시 시도하세요.',
  },
  fr: {
    history: 'Rechercher dans l’historique', keyword: 'Rechercher dans les conversations', date: 'Date', search: 'Rechercher',
    export: 'Exporter tout l’historique', exportDay: 'Exporter cette journée', reveal: 'Afficher dans le dossier',
    latest: 'Revenir aux derniers messages', previous: 'Résultat précédent', next: 'Résultat suivant', more: 'Plus de résultats',
    empty: 'Aucun résultat', loading: 'Lecture de l’historique…', failed: 'Lecture impossible. Réessayez.',
    saved: 'Historique exporté', saveFailed: 'Exportation impossible. Réessayez.',
  },
  de: {
    history: 'Verlauf durchsuchen', keyword: 'Chatverlauf durchsuchen', date: 'Datum', search: 'Suchen',
    export: 'Gesamten Verlauf exportieren', exportDay: 'Diesen Tag exportieren', reveal: 'Im Ordner anzeigen',
    latest: 'Zu den neuesten Nachrichten', previous: 'Vorheriger Treffer', next: 'Nächster Treffer', more: 'Weitere Ergebnisse',
    empty: 'Keine Treffer', loading: 'Verlauf wird gelesen…', failed: 'Verlauf konnte nicht gelesen werden. Erneut versuchen.',
    saved: 'Chatverlauf exportiert', saveFailed: 'Export fehlgeschlagen. Erneut versuchen.',
  },
  'es-419': {
    history: 'Buscar en el historial', keyword: 'Buscar en las conversaciones', date: 'Fecha', search: 'Buscar',
    export: 'Exportar todo el historial', exportDay: 'Exportar este día', reveal: 'Mostrar en la carpeta',
    latest: 'Volver a lo más reciente', previous: 'Resultado anterior', next: 'Resultado siguiente', more: 'Más resultados',
    empty: 'Sin resultados', loading: 'Leyendo el historial…', failed: 'No se pudo leer el historial. Inténtalo de nuevo.',
    saved: 'Historial exportado', saveFailed: 'No se pudo exportar. Inténtalo de nuevo.',
  },
  'pt-BR': {
    history: 'Buscar no histórico', keyword: 'Buscar nas conversas', date: 'Data', search: 'Buscar',
    export: 'Exportar todo o histórico', exportDay: 'Exportar este dia', reveal: 'Mostrar na pasta',
    latest: 'Voltar às mensagens recentes', previous: 'Resultado anterior', next: 'Próximo resultado', more: 'Mais resultados',
    empty: 'Nenhum resultado', loading: 'Lendo o histórico…', failed: 'Não foi possível ler o histórico. Tente novamente.',
    saved: 'Histórico exportado', saveFailed: 'Não foi possível exportar. Tente novamente.',
  },
  it: {
    history: 'Cerca nella cronologia', keyword: 'Cerca nelle conversazioni', date: 'Data', search: 'Cerca',
    export: 'Esporta tutta la cronologia', exportDay: 'Esporta questa giornata', reveal: 'Mostra nella cartella',
    latest: 'Torna ai messaggi recenti', previous: 'Risultato precedente', next: 'Risultato successivo', more: 'Altri risultati',
    empty: 'Nessun risultato', loading: 'Lettura della cronologia…', failed: 'Impossibile leggere la cronologia. Riprova.',
    saved: 'Cronologia esportata', saveFailed: 'Esportazione non riuscita. Riprova.',
  },
  ru: {
    history: 'Поиск в истории', keyword: 'Поиск в переписке', date: 'Дата', search: 'Найти',
    export: 'Экспорт всей истории', exportDay: 'Экспорт за этот день', reveal: 'Показать в папке',
    latest: 'К последним сообщениям', previous: 'Предыдущее совпадение', next: 'Следующее совпадение', more: 'Ещё результаты',
    empty: 'Ничего не найдено', loading: 'Чтение истории…', failed: 'Не удалось прочитать историю. Повторите попытку.',
    saved: 'История экспортирована', saveFailed: 'Не удалось экспортировать историю. Повторите попытку.',
  },
};

export const H = pick({ zh, en, ...locales });
