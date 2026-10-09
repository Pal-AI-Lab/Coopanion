/** The filter for recognizer lines that are not speech, against what Whisper wrote for silence and room noise. */
import { describe, expect, it } from 'vitest';
import { looksHallucinated } from '../src/asr/result.ts';

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
