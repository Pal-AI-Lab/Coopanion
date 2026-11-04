import type { ConfigGroup } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { uiText } from './strings.ts';

export const BILISCRIPT_ID = 'biliscript';

export type WriterMode = 'bot' | 'endpoint';
export type WriterProtocol = 'openai' | 'anthropic' | 'gemini';

/** config.json 的 worlds.biliscript 段。 */
export interface BiliScriptConfigSection {
  enabled: boolean;
  /** 装了 requirements.txt 的 Python;空串时 Windows 用 `python`,其他系统用 `python3`。 */
  pythonPath: string;
  /** 传给子进程的 HF_ENDPOINT;空串时用 Hugging Face 默认地址。 */
  hfEndpoint: string;
  /** 转写完成后保留下载的音频。 */
  keepAudio: boolean;
  asr: {
    /** faster-whisper 的模型名或本机模型目录。 */
    model: string;
    device: 'auto' | 'cuda' | 'cpu';
    /** 空串时 cuda 用 float16,cpu 用 int8。 */
    computeType: string;
    /** 空串时自动识别语言。 */
    language: string;
    initialPrompt: string;
    beamSize: number;
  };
  diarization: {
    enabled: boolean;
    /** pyannote.audio 的流水线名或本机目录。 */
    model: string;
  };
  writer: {
    /** bot:说话人由 bot 命名;endpoint:由下面配置的模型命名并修订文字。 */
    mode: WriterMode;
    protocol: WriterProtocol;
    baseUrl: string;
    model: string;
    maxTokens: number;
    /** endpoint 模式下逐段修订错字与标点,原文保留在 script.json。 */
    polish: boolean;
    timeoutSec: number;
  };
}

export const BILISCRIPT_DEFAULTS: BiliScriptConfigSection = {
  enabled: false,
  pythonPath: '',
  hfEndpoint: '',
  keepAudio: false,
  asr: {
    model: 'large-v3',
    device: 'auto',
    computeType: '',
    language: 'zh',
    initialPrompt: '以下是普通话的对话。',
    beamSize: 5,
  },
  diarization: {
    enabled: true,
    model: 'pyannote/speaker-diarization-3.1',
  },
  writer: {
    mode: 'bot',
    protocol: 'openai',
    baseUrl: '',
    model: '',
    maxTokens: 4096,
    polish: true,
    timeoutSec: 120,
  },
};

/** 部署 .env 里的密钥名。 */
export const BILISCRIPT_SECRETS = {
  /** 说话人区分模型在 Hugging Face 上需要的访问令牌。 */
  hfToken: 'BILISCRIPT_HF_TOKEN',
  /** writer.mode 为 endpoint 时模型服务的密钥。 */
  llmApiKey: 'BILISCRIPT_LLM_API_KEY',
  /** 可选的 B 站 Cookie(整串,或只填 SESSDATA 的值),用于需要登录的视频。 */
  biliCookie: 'BILISCRIPT_BILI_COOKIE',
} as const;

export function biliScriptConfigGroup(language: Language): ConfigGroup {
  const t = uiText(language);
  const p = `worlds.${BILISCRIPT_ID}.`;
  return {
    id: `world:${BILISCRIPT_ID}`,
    owner: `world:${BILISCRIPT_ID}`,
    schema: {
      type: 'object',
      title: t.label,
      properties: {
        [`${p}pythonPath`]: { type: 'string', title: t.pythonPathTitle, description: t.pythonPathDesc },
        [`${p}hfEndpoint`]: { type: 'string', title: t.hfEndpointTitle, description: t.hfEndpointDesc },
        [`${p}keepAudio`]: { type: 'boolean', title: t.keepAudioTitle },
        [`${p}asr.model`]: { type: 'string', title: t.asrModelTitle, description: t.asrModelDesc },
        [`${p}asr.device`]: { type: 'string', enum: ['auto', 'cuda', 'cpu'], title: t.deviceTitle },
        [`${p}asr.computeType`]: { type: 'string', title: t.computeTypeTitle, description: t.computeTypeDesc },
        [`${p}asr.language`]: { type: 'string', title: t.languageTitle, description: t.languageDesc },
        [`${p}asr.initialPrompt`]: { type: 'string', title: t.initialPromptTitle, description: t.initialPromptDesc },
        [`${p}asr.beamSize`]: { type: 'integer', minimum: 1, maximum: 10, title: t.beamSizeTitle },
        [`${p}diarization.enabled`]: { type: 'boolean', title: t.diarizationTitle, description: t.diarizationDesc },
        [`${p}diarization.model`]: { type: 'string', title: t.diarizationModelTitle },
        [`${p}writer.mode`]: {
          type: 'string',
          enum: ['bot', 'endpoint'],
          title: t.writerModeTitle,
          description: t.writerModeDesc,
        },
        [`${p}writer.protocol`]: {
          type: 'string',
          enum: ['openai', 'anthropic', 'gemini'],
          title: t.protocolTitle,
          description: t.protocolDesc,
        },
        [`${p}writer.baseUrl`]: { type: 'string', title: t.baseUrlTitle, description: t.baseUrlDesc },
        [`${p}writer.model`]: { type: 'string', title: t.writerModelTitle },
        [`${p}writer.maxTokens`]: { type: 'integer', minimum: 256, title: t.maxTokensTitle },
        [`${p}writer.polish`]: { type: 'boolean', title: t.polishTitle, description: t.polishDesc },
        [`${p}writer.timeoutSec`]: { type: 'integer', minimum: 10, title: t.timeoutTitle },
      },
    },
  };
}
