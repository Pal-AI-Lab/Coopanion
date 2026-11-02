import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BREAKER_FAILS, BREAKER_MS, BUDGET, DeciderClient, FLOOR, SLEEP_FLOOR, buildQuestions, buildRequest, buildState, orderGroup, parseAnswers,
  pickGroup, stripMarkers, type Answer, type Question,
} from '../src/decider.ts';
import type { VocabWord } from '../src/script.ts';

const COO: VocabWord[] = JSON.parse(readFileSync(new URL('../web/coo/figure.json', import.meta.url), 'utf8')).vocab;

/** Answers that put each listed probability on its option in question `q` and the rest on the keep option. */
function answers(questions: readonly Question[], picks: Record<string, Array<[string, number]>>): Record<string, Answer> {
  return Object.fromEntries(questions.map((q) => {
    const list = picks[q.id] ?? [[q.options[0]!.key, .9]];
    return [q.id, { choice: list[0]![0], probabilities: Object.fromEntries(list) }];
  }));
}
const keyOf = (qs: readonly Question[], q: string, id: string) => qs.find((x) => x.id === q)!.options.find((o) => o.id === id)!.key;

describe('the questions', () => {
  it("ask about Coo's face, head, arms and body, each word in one question and walking left to pet_move_to", () => {
    const qs = buildQuestions(COO);
    expect(qs.map((q) => q.id)).toEqual(['face', 'head', 'arm', 'body']);
    expect(qs.map((q) => q.options[0]!.id)).toEqual([null, null, null, null]);
    const all = qs.flatMap((q) => q.options.map((o) => o.id)).filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set([...all, 'walk', 'run'])).toEqual(new Set(COO.map((v) => v.id)));
    expect(qs.find((q) => q.id === 'head')!.options.map((o) => o.id)).toEqual([null, 'nod', 'shake']);
  });

  it('leave sleep out of a bubble, key options by first name and give their looks, other names and lasting', () => {
    expect(buildQuestions(COO, 'zh', true).find((q) => q.id === 'body')!.options.map((o) => o.id)).not.toContain('sleep');
    expect(buildQuestions(COO).find((q) => q.id === 'face')!.options.find((o) => o.id === 'happy')).toEqual({ key: '开心', id: 'happy', about: '眼睛弯成 ^ ^;也叫:高兴' });
    const en = buildQuestions(COO, 'en');
    expect(en[0]!.options[0]!.key).toBe('same face');
    expect(en.find((q) => q.id === 'body')!.options.find((o) => o.id === 'sit')!.about).toMatch(/it stays like this$/);
  });

  it('keep a keep option and two words apart when their names collide', () => {
    const vocab: VocabWord[] = [
      { id: 'still', kind: 'expression', names: { zh: ['不换表情'] }, about: { zh: '一动不动' }, seconds: 1 },
      { id: 'grin', kind: 'expression', names: { zh: ['笑'] }, about: { zh: '咧嘴' }, seconds: 1 },
      { id: 'smile', kind: 'expression', names: { zh: ['笑'] }, about: { zh: '抿嘴' }, seconds: 1 },
    ];
    expect(buildQuestions(vocab)[0]!.options.map((o) => o.key)).toEqual(['(不换表情)', '不换表情', '笑', '笑 (smile)']);
  });

  it('go into the request with their instructions and the options as criteria, and the state says the figure, the feeling and the line', () => {
    const qs = buildQuestions(COO);
    const req = buildRequest('vendor/model-a', buildState({ body: 'Coo,一只小鸟', feeling: '有点得意', text: '我做到啦' }), qs);
    expect(req.questions.head).toEqual({ type: 'choice', instructions: qs[1]!.instructions, criteria: Object.fromEntries(qs[1]!.options.map((o) => [o.key, o.about])) });
    expect(req.state.split('\n').slice(1)).toEqual(['它此刻的心情:有点得意', '它正要说的话:我做到啦']);
    expect(buildState({ body: 'x', feeling: '很'.repeat(1000) })).toContain(`${'很'.repeat(200)}…`);
  });
});

describe('the answers', () => {
  it('read choices and probabilities, skip what cannot be read, and give null without any', () => {
    expect(parseAnswers({ answers: { face: { type: 'choice', choice: '开心', probabilities: { 开心: .7, 不换表情: '.3' } }, head: 3, arm: {} } }))
      .toEqual({ face: { choice: '开心', probabilities: { 开心: .7 } } });
    expect(parseAnswers({ answers: {} })).toBeNull();
    expect(parseAnswers({})).toBeNull();
  });
});

describe('picking one group', () => {
  const qs = buildQuestions(COO, 'zh', true);
  const k = (q: string, id: string) => keyOf(qs, q, id);

  it('moves each part whose winner is a word at its floor, and plays posture, arms, head, then the face', () => {
    const ids = pickGroup(qs, answers(qs, { face: [[k('face', 'happy'), .6]], head: [[k('head', 'nod'), FLOOR.head]], arm: [[k('arm', 'wave'), FLOOR.arm - .01]] }), COO);
    expect(ids).toEqual(['nod', 'happy']);
    expect(orderGroup(['happy', 'nod', 'wave', 'sit'], COO)).toEqual(['sit', 'wave', 'nod', 'happy']);
  });

  it(`moves at most ${BUDGET} parts besides the face, the likelier first, and never two words on one part`, () => {
    expect(pickGroup(qs, answers(qs, {
      face: [[k('face', 'happy'), .9]], head: [[k('head', 'nod'), .5]], arm: [[k('arm', 'wave'), .8]], body: [[k('body', 'hop'), .7]],
    }), COO)).toEqual(['hop', 'wave', 'happy']);
    expect(pickGroup(qs, answers(qs, { arm: [[k('arm', 'bow'), .9]], body: [[k('body', 'dance'), .8]] }), COO)).toEqual(['bow']);
  });

  it('lets falling asleep win over a face only above its own floor, and on pet_feel over a likelier face', () => {
    const all = buildQuestions(COO);
    const sleepy = (p: number) => answers(all, { face: [[keyOf(all, 'face', 'happy'), .9]], body: [[keyOf(all, 'body', 'sleep'), p]] });
    expect(pickGroup(all, sleepy(SLEEP_FLOOR - .05), COO, true)).toEqual(['happy']);
    expect(pickGroup(all, sleepy(SLEEP_FLOOR + .05), COO)).toEqual(['happy']);
    expect(pickGroup(all, sleepy(SLEEP_FLOOR + .05), COO, true)).toEqual(['sleep']);
  });

  it('takes a choice without probabilities as certain, and an answer for no question as nothing', () => {
    expect(pickGroup(qs, { face: { choice: k('face', 'shy'), probabilities: {} }, tail: { choice: 'x', probabilities: {} } }, COO)).toEqual(['shy']);
  });
});

describe("a bubble's text", () => {
  it.each([
    ['a < b 而且 c > d', 'a < b 而且 c > d'],
    ['我觉得 3<5 且 7>2', '我觉得 3<5 且 7>2'],
    ['<3 爱你', '<3 爱你'],
    ['【重要】明天开会', '明天开会'],
    ['<Nod>好', '好'],
    ['<happy>好', '好'],
    ['【开心】你好<点头>', '你好'],
    ['【开心, 招手】你好＜眨眼＞呀', '你好呀'],
  ] as const)('loses its markers and keeps other brackets: %s', (input, out) => {
    expect(stripMarkers(input, COO)).toBe(out);
  });
});

describe('the client', () => {
  const req = buildRequest('vendor/model-a', 's', buildQuestions(COO));
  const options = { url: () => 'http://x', timeoutMs: () => 1000 };

  it('makes no request without a key, and keeps no part of the key in an error', async () => {
    let called = 0;
    const none = new DeciderClient({ ...options, key: () => '', fetch: async () => { called++; return new Response('{}'); } });
    expect(await none.decide(req)).toMatchObject({ ok: false, reason: 'nokey' });
    expect(called).toBe(0);
    const key = 'sk-or-secret-1234';
    const c = new DeciderClient({ ...options, key: () => key, fetch: async () => new Response(JSON.stringify({ error: { message: `${'x'.repeat(110)} bad key ${key}` } }), { status: 401 }) });
    const r = await c.decide(req);
    expect(r).toMatchObject({ ok: false, reason: 'http' });
    expect(JSON.stringify([r, c.lastFailure])).not.toContain(key.slice(0, 8));
  });

  it(`opens the breaker after ${BREAKER_FAILS} failures in a row, says so once, and closes it ${BREAKER_MS / 1000} s later`, async () => {
    let now = 0, calls = 0;
    const warned: string[] = [];
    const c = new DeciderClient({ ...options, key: () => 'k', now: () => now, warn: (m) => warned.push(m), fetch: async () => { calls++; return new Response('nope', { status: 500 }); } });
    for (let i = 0; i < BREAKER_FAILS; i++) await c.decide(req);
    expect(c.open).toBe(true);
    expect(await c.decide(req)).toMatchObject({ ok: false, reason: 'breaker' });
    expect([calls, warned.length]).toEqual([BREAKER_FAILS, 1]);
    expect(c.lastFailure).toEqual({ reason: 'http', detail: '500' });
    now += BREAKER_MS;
    expect(c.open).toBe(false);
  });

  it('gives up at the timeout, and at once when the call is stopped, which counts as no failure', async () => {
    const hang: typeof fetch = (_u, init) => new Promise((_, fail) => init!.signal!.addEventListener('abort', () => fail(new Error('aborted'))));
    const slow = new DeciderClient({ ...options, key: () => 'k', timeoutMs: () => 20, fetch: hang });
    expect(await slow.decide(req)).toMatchObject({ ok: false, reason: 'timeout' });
    const stopped = new DeciderClient({ ...options, key: () => 'k', timeoutMs: () => 60_000, fetch: hang });
    const ctrl = new AbortController();
    const out = stopped.decide(req, ctrl.signal);
    ctrl.abort();
    expect(await out).toMatchObject({ ok: false, reason: 'aborted' });
    expect(stopped.lastFailure).toBeNull();
  });
});
