/** Which recognizer voice input uses for a setting and an app language. */
import { describe, expect, it } from 'vitest';
import { asrEngineFor } from '../src/config.ts';

describe('asrEngineFor', () => {
  it('unset, picks SenseVoice for the languages it hears and Whisper for the other app languages', () => {
    for (const language of ['zh', 'zh-Hant', 'en', 'ja', 'ko']) expect(asrEngineFor('', language, true)).toBe('funasr');
    for (const language of ['fr', 'de', 'es-419', 'pt-BR', 'it', 'ru']) expect(asrEngineFor('', language, true)).toBe('whisper');
  });

  it('keeps a chosen engine; system only where Windows has its recognizer, the language picks elsewhere', () => {
    expect(asrEngineFor('whisper', 'zh', false)).toBe('whisper');
    expect(asrEngineFor('funasr', 'fr', false)).toBe('funasr');
    expect(asrEngineFor('system', 'fr', true)).toBe('system');
    expect(asrEngineFor('system', 'fr', false)).toBe('whisper');
    expect(asrEngineFor('system', 'ja', false)).toBe('funasr');
  });

  it('reads a value this version does not take as unset', () => {
    expect(asrEngineFor('auto', 'de', true)).toBe('whisper');
    expect(asrEngineFor('auto', 'ko', true)).toBe('funasr');
  });
});
