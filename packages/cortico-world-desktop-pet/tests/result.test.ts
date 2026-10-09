/** The filter for recognizer lines that are not speech, against what Whisper wrote for silence and room noise, and how sentences heard one after another are joined. */
import { describe, expect, it } from 'vitest';
import { joinSpeech, looksHallucinated } from '../src/asr/result.ts';

describe('joinSpeech', () => {
  it('puts a space between sentences of languages written with spaces, accented letters, Cyrillic and Hangul included', () => {
    expect(joinSpeech(['передвигаться.', 'Оцелоты выслеживают', 'добычу'])).toBe('передвигаться. Оцелоты выслеживают добычу');
    expect(joinSpeech(['Il était déjà là', 'à la maison'])).toBe('Il était déjà là à la maison');
    expect(joinSpeech(['안녕하세요.', '반가워요'])).toBe('안녕하세요. 반가워요');
  });

  it('puts none next to Chinese or Japanese', () => {
    expect(joinSpeech(['今天天气', '怎么样'])).toBe('今天天气怎么样');
    expect(joinSpeech(['打开 Chrome', '浏览器'])).toBe('打开 Chrome浏览器');
    expect(joinSpeech(['こんにちは', 'はい'])).toBe('こんにちははい');
  });
});

describe('looksHallucinated', () => {
  it("drops Whisper's sound labels, cut off or whole, and its subtitle credits", () => {
    for (const line of ['[Musique]', '(...)', '...', '*Bruit de la porte*', '* Stille *', '[Sottotitoli e rispondenti del', '(звук пива', 'Субтитры субтитров О.', '♪']) {
      expect(looksHallucinated(line), line).toBe(true);
    }
  });

  it('keeps sentences', () => {
    for (const line of ["Il n'avait pas non plus le pouvoir de déroger aux lois fiscales.", 'Они умеют отлично видеть в темноте.', 'Kannst du die Musik leiser machen?', '今天天气怎么样']) {
      expect(looksHallucinated(line), line).toBe(false);
    }
  });
});
