import { pick, type Language } from 'cortico/core/language.ts';
import { cooText as zhHant } from './strings.zh-Hant.ts';
import { cooText as ja } from './strings.ja.ts';
import { cooText as ko } from './strings.ko.ts';
import { cooText as fr } from './strings.fr.ts';
import { cooText as de } from './strings.de.ts';
import { cooText as es419 } from './strings.es-419.ts';
import { cooText as ptBR } from './strings.pt-BR.ts';
import { cooText as it } from './strings.it.ts';
import { cooText as ru } from './strings.ru.ts';

/** What the console shows of this provider: its description, the thinking levels, the protocol setting and its error. */
const zh = {
  /** `names`: the services' names in the console's language. */
  description: (names: readonly string[]) => `一个模块接 ${names.join('、')};按接口地址认是哪一家、走哪种协议。思考可调四档。`,
  tiers: { off: '不思考', low: '思考 · 快', high: '思考 · 标准', max: '思考 · 最深' },
  protocol: '协议',
  protocolHint: '留空时,列出的服务用它自己的协议,其他地址用 responses。responses:POST <地址>/responses;chat:POST <地址>/chat/completions;anthropic:Messages API,地址填 /v1 之前的部分;gemini:Gemini API,地址填 /models 之前的部分。',
  badProtocol: (protocols: string) => `协议只能是 ${protocols}`,
};

export const en: typeof zh = {
  description: (names: readonly string[]) => `One module for ${names.join(', ')}; the base URL tells which service it is and which protocol it takes. Thinking has four levels.`,
  tiers: { off: 'No thinking', low: 'Thinking · fast', high: 'Thinking · standard', max: 'Thinking · deepest' },
  protocol: 'Protocol',
  protocolHint: 'Unset: a listed service uses its own protocol, any other URL uses responses. responses: POST <URL>/responses; chat: POST <URL>/chat/completions; anthropic: the Messages API, with the URL before /v1; gemini: the Gemini API, with the URL before /models.',
  badProtocol: (protocols: string) => `The protocol must be one of ${protocols}`,
};

export const cooText = (language: Language) => pick(language, {
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
