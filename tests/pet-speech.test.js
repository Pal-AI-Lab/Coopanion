import { describe, expect, it } from 'vitest';
import { MAX_LAG, VOICE_GAP, VoiceClock } from '../packages/cortico-world-desktop-pet/web/speech.js';

describe('speech', () => {
  it('keeps the silence after a pause mark when the voice is behind the text', () => {
    const clock = new VoiceClock();
    const ups = 13, len = .085;
    // 20 characters a second against 13 syllables a second: the voice falls behind
    let t = 0, last = 0;
    for (let i = 0; i < 12; i++, t += .05) last = clock.place(t, { weak: false, final: false }, ups, len);
    expect(last - t).toBeGreaterThan(.2);
    clock.mark('，');
    const next = clock.place(t, { weak: false, final: false }, ups, len);
    expect(next).toBeCloseTo(last + len + VOICE_GAP['，'], 6);
  });

  it('drops a weak character once more than MAX_LAG behind, but not one of the last two of its phrase', () => {
    const clock = new VoiceClock();
    for (let i = 0; i < 40; i++) clock.place(0, { weak: false, final: false }, 13, .085);
    expect(clock.last).toBeGreaterThan(MAX_LAG);
    expect(clock.place(0, { weak: true, final: false }, 13, .085)).toBeNull();
    expect(clock.place(0, { weak: true, final: true }, 13, .085)).not.toBeNull();
  });
});
