import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WORKER = fileURLToPath(new URL('../python/biliscript_worker.py', import.meta.url));
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const hasPython = spawnSync(PYTHON, ['--version']).status === 0;

function align(words: unknown[], turns: unknown[]) {
  const r = spawnSync(PYTHON, [WORKER, 'align'], { input: JSON.stringify({ words, turns }), encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout).lines as Array<{ speaker: string; text: string; start: number; end: number }>;
}

describe.skipIf(!hasPython)('worker align', () => {
  it('assigns words to the turn they overlap most and numbers speakers by first appearance', () => {
    const lines = align(
      [
        { start: 0, end: 0.5, text: '你好' },
        { start: 0.5, end: 1.0, text: '。' },
        { start: 1.2, end: 1.6, text: '嗨' },
        { start: 1.6, end: 1.9, text: '!' },
        { start: 2.0, end: 2.4, text: '再见' },
      ],
      [
        { start: 0, end: 1.1, speaker: 'SPEAKER_01' },
        { start: 1.1, end: 1.95, speaker: 'SPEAKER_00' },
        { start: 1.95, end: 3, speaker: 'SPEAKER_01' },
      ],
    );
    expect(lines.map((l) => [l.speaker, l.text])).toEqual([
      ['S1', '你好。'],
      ['S2', '嗨!'],
      ['S1', '再见'],
    ]);
  });

  it('starts a new line after a long pause from the same speaker and keeps English spacing', () => {
    const lines = align(
      [
        { start: 0, end: 0.4, text: ' Hello' },
        { start: 0.4, end: 0.8, text: ' there.' },
        { start: 5, end: 5.4, text: ' Again.' },
      ],
      [],
    );
    expect(lines).toEqual([
      { start: 0, end: 0.8, speaker: 'S1', text: 'Hello there.' },
      { start: 5, end: 5.4, speaker: 'S1', text: 'Again.' },
    ]);
  });

  it('a word outside every turn takes the nearest turn within a second', () => {
    const lines = align(
      [
        { start: 0, end: 0.5, text: 'a' },
        { start: 3.2, end: 3.4, text: 'b' },
      ],
      [
        { start: 0, end: 0.6, speaker: 'A' },
        { start: 3.6, end: 4, speaker: 'B' },
      ],
    );
    expect(lines.map((l) => l.speaker)).toEqual(['S1', 'S2']);
  });
});
