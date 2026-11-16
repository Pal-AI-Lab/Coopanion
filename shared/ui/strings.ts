const close: Record<string, string> = {
  zh: '关闭', en: 'Close', 'zh-Hant': '關閉', ja: '閉じる', ko: '닫기',
  fr: 'Fermer', de: 'Schließen', 'es-419': 'Cerrar', 'pt-BR': 'Fechar', it: 'Chiudi', ru: 'Закрыть',
};
export const closeLabel = (language: string): string => close[language === 'zh-CN' ? 'zh' : language] ?? close.en;
