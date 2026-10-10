import { pick } from '../../core/language.ts';
import { S as zhHant } from './strings.zh-Hant.ts';
import { S as ja } from './strings.ja.ts';
import { S as ko } from './strings.ko.ts';
import { S as fr } from './strings.fr.ts';
import { S as de } from './strings.de.ts';
import { S as es419 } from './strings.es-419.ts';
import { S as ptBR } from './strings.pt-BR.ts';
import { S as it } from './strings.it.ts';
import { S as ru } from './strings.ru.ts';

const zh = {
  nav: '装扮',
  note: '换配色、帽子、耳饰、眼镜、颈饰，改动立刻生效。',
  noPet: '桌宠尚未就绪，请稍后再试。',
};

export const en: typeof zh = {
  nav: 'Dress up',
  note: 'Colors, hats, earrings, glasses and neckwear; changes apply at once.',
  noPet: 'The pet is not ready yet. Try again in a moment.',
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
