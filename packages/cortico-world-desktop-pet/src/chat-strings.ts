import type { Language } from 'cortico/core/language.ts';

interface ExportStrings {
  title: string;
  question: string;
  answer: string;
  option: string;
  skipped: string;
  image: string;
}

export const CHAT_EXPORT: Record<Language, ExportStrings> = {
  zh: { title: '对话记录', question: '询问', answer: '回答', option: '选项', skipped: '跳过', image: '图片' },
  'zh-Hant': { title: '對話記錄', question: '詢問', answer: '回答', option: '選項', skipped: '略過', image: '圖片' },
  en: { title: 'Chat history', question: 'Question', answer: 'Answer', option: 'Option', skipped: 'Skipped', image: 'Image' },
  ja: { title: 'チャット履歴', question: '質問', answer: '回答', option: '選択肢', skipped: 'スキップ', image: '画像' },
  ko: { title: '대화 기록', question: '질문', answer: '답변', option: '선택지', skipped: '건너뜀', image: '이미지' },
  fr: { title: 'Historique des conversations', question: 'Question', answer: 'Réponse', option: 'Option', skipped: 'Ignoré', image: 'Image' },
  de: { title: 'Chatverlauf', question: 'Frage', answer: 'Antwort', option: 'Option', skipped: 'Übersprungen', image: 'Bild' },
  'es-419': { title: 'Historial de conversaciones', question: 'Pregunta', answer: 'Respuesta', option: 'Opción', skipped: 'Omitida', image: 'Imagen' },
  'pt-BR': { title: 'Histórico de conversas', question: 'Pergunta', answer: 'Resposta', option: 'Opção', skipped: 'Ignorada', image: 'Imagem' },
  it: { title: 'Cronologia delle conversazioni', question: 'Domanda', answer: 'Risposta', option: 'Opzione', skipped: 'Saltata', image: 'Immagine' },
  ru: { title: 'История переписки', question: 'Вопрос', answer: 'Ответ', option: 'Вариант', skipped: 'Пропущено', image: 'Изображение' },
};
