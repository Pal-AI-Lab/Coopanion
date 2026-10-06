import { describe, expect, it } from 'vitest';
import { figurePacks } from '../src/packs.ts';
import { estimateSeconds, parseActions as actionsIn, parseScript as scriptIn, vocabId, INLINE_TAG_MAX } from '../src/script.ts';

// Coo's words, as the body on screen gives them
const VOCAB = figurePacks([]).packs.find((p) => p.id === 'coo')!.manifest.vocab;
const parseScript = (s: string) => scriptIn(s, VOCAB);
const parseActions = (list: unknown[]) => actionsIn(list, VOCAB);

describe('parseScript', () => {
  it('splits bubbles at blocking markers and keeps inline markers at their character offset', () => {
    const { beats, dropped } = parseScript('【开心】你好呀!<眨眼>今天也加油。【jump, 点头】看我!');
    expect(dropped).toEqual([]);
    expect(beats).toEqual([
      { actions: ['happy'], text: '你好呀!今天也加油。', anchors: [{ at: 4, actions: ['wink'] }] },
      { actions: ['jump', 'nod'], text: '看我!', anchors: [] },
    ]);
  });

  it('reports unknown words and drops them', () => {
    const { beats, dropped } = parseScript('【开心,飞起来】好');
    expect(dropped).toEqual(['飞起来']);
    expect(beats[0].actions).toEqual(['happy']);
  });

  it('treats an over-long or multi-line inline marker as text', () => {
    const long = `<${'x'.repeat(INLINE_TAG_MAX + 1)}>`;
    expect(parseScript(`a${long}b`).beats[0].text).toBe(`a${long}b`);
    expect(parseScript('a<开\n心>b').beats[0].text).toBe('a<开\n心>b');
  });

  it('keeps an unclosed blocking marker as text', () => {
    expect(parseScript('你好【开心').beats[0].text).toBe('你好【开心');
  });

  it('allows a beat with actions only', () => {
    expect(parseScript('【sleep】').beats).toEqual([{ actions: ['sleep'], text: '', anchors: [] }]);
  });
});

describe('vocabulary', () => {
  it('resolves every id and every name to the same id', () => {
    for (const v of VOCAB) {
      expect(vocabId(v.id, VOCAB)).toBe(v.id);
      for (const z of Object.values(v.names).flat()) expect(vocabId(z, VOCAB)).toBe(v.id);
    }
  });

  it('parseActions separates known from unknown words', () => {
    expect(parseActions(['跳', 'happy', 'fly', 3])).toEqual({ actions: ['jump', 'happy'], dropped: ['fly', '3'] });
  });

  it('estimates longer display for longer text', () => {
    expect(estimateSeconds(parseScript('短').beats)).toBeLessThan(estimateSeconds(parseScript('这是一段明显更长的话,要多打一会儿字才能说完。').beats));
  });
});
