/** config.ts: which recognizer voice input uses, and how the self-adjustment and touch settings read. */
import { describe, expect, it } from 'vitest';
import { SELF_DEFAULT, asrEngineFor, directSettings, selfAdjustMode, touchWakes } from '../src/config.ts';

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

describe('selfAdjust', () => {
  it('reads the boolean earlier versions wrote: true as default, false as off', () => {
    expect(selfAdjustMode(true)).toBe('default');
    expect(selfAdjustMode(false)).toBe('off');
    expect(directSettings({ selfAdjust: true })).toEqual(SELF_DEFAULT);
  });

  it('custom takes the per-item picks, any makes every item direct', () => {
    const custom = { ...SELF_DEFAULT, figure: false, sound: true };
    expect(directSettings({ selfAdjust: 'custom', selfAdjustCustom: custom })).toEqual(custom);
    expect(directSettings({ selfAdjust: 'default', selfAdjustCustom: custom })).toEqual(SELF_DEFAULT);
    expect(Object.values(directSettings({ selfAdjust: 'any' })).every(Boolean)).toBe(true);
  });
});

describe('touchWakes', () => {
  it('custom wakes for the picked kinds only', () => {
    const touch = { wakeOn: 'custom' as const, wakeKinds: ['pet', 'drop'] };
    expect(['poke', 'pet', 'throw', 'drop'].filter((k) => touchWakes(touch, k))).toEqual(['pet', 'drop']);
    expect(touchWakes({ wakeOn: 'poke' }, 'pet')).toBe(false);
  });
});
