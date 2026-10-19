import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SpeechText } from '../src/speech/index.ts';

const speech = new SpeechText(
  fileURLToPath(new URL('../src/speech/data/', import.meta.url)),
  fileURLToPath(new URL('../web/speech/zh.json', import.meta.url)),
);
const keys = (text: string, language: string) => speech.units(text, language).map((u) => u.key);

describe('speech syllables', () => {
  it('reads an English word by its dictionary pronunciation, one unit per spoken syllable', () => {
    // the dictionary's last phoneme of each line carries the stress digit
    expect(keys('nice', 'en')).toEqual(['nai']);
    const hello = speech.units('Hello', 'en');
    expect(hello.map((u) => [u.key, u.stress])).toEqual([['he', false], ['lou', true]]);
  });

  it('keeps a glide when the stress mark falls between it and its vowel', () => {
    expect(keys('you', 'en')).toEqual(['you']);
    expect(keys('bien', 'fr')).toEqual(['bian']);
  });

  it('reads a precomposed nasal vowel as a vowel', () => {
    expect(keys('bem', 'pt-BR')).toEqual(['ben']);
  });

  it('reads kanji by the Japanese dictionary in a sentence with kana, and Hangul with its finals carried over', () => {
    expect(keys('元気です', 'zh')).toEqual(['gen', 'qi', 'de', 'su']);
    // the Jōyō appendix comes before IPADIC: 明日 is あす there, あした in IPADIC
    expect(keys('明日です', 'ja')).toEqual(['a', 'su', 'de', 'su']);
    expect(keys('元气', 'zh')).toEqual(['yuan', 'qi']);
    // 한국어: the final ㄱ of 국 starts 어
    expect(keys('한국어', 'ko')).toEqual(['han', 'ku', 'ge']);
  });

  it('places each unit in its phrase and keeps the marks that close it', () => {
    const u = speech.units('今天好的,你好吗?', 'zh');
    expect(u.map((x) => `${x.key}${x.pos}/${x.of}${x.end}`)).toEqual(['jin0/4,', 'tian1/4,', 'hao2/4,', 'de3/4,', 'ni0/3?', 'hao1/3?', 'ma2/3?']);
    expect(u.find((x) => x.key === 'de')!.weak).toBe(true);
  });
});
