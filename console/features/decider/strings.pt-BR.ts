import type { en } from './strings.ts';

export const S: Partial<typeof en> = {
  title: 'Escolha de expressões',
  enabled: 'Deixar um modelo de decisão escolher expressões e movimentos',
  enabledHint: 'O Coo escreve como se sente em cada balão e um modelo de decisão do OpenRouter escolhe as expressões e os movimentos; o prompt do sistema deixa de trazer a tabela de palavras.',
  privacy: 'Enquanto estiver ligada, cada decisão envia ao OpenRouter o texto do balão, o sentimento do Coo, e o nome, a descrição e a roupa da figura atual com sua lista de expressões e movimentos.',
  key: 'API Key',
  keySave: 'Salvar',
  keyHint: 'Fica salva na pasta da implantação e só é enviada ao OpenRouter. Salvá-la não liga a escolha de expressões.',
  keySaved: 'API Key salva',
  status: 'Estado',
  on: 'Um modelo de decisão está em uso.',
  off: 'Desligada: o Coo escreve as próprias expressões e movimentos.',
  needKey: 'Ligada: passa a valer quando houver uma API Key do OpenRouter.',
  lastFailed: (why: string) => `A última decisão falhou: ${why}.`,
  saveFailed: (why: string) => `Não foi salvo: ${why}`,
};
