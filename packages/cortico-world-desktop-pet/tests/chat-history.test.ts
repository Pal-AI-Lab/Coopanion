import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlEventStore } from 'cortico/core/event-store.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { BlobRef } from 'cortico/core/types.ts';
import { SELF_TYPE, chatExport, chatLocate, chatMatches, type ChatItem } from '../src/chat.ts';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function store(run: string) {
  const dataDir = dirs.at(-1) ?? (dirs.push(mkdtempSync(join(tmpdir(), 'pet-history-'))), dirs.at(-1)!);
  return new JsonlEventStore({ dataDir, run, log: nullLogger(), timezone: 'Asia/Shanghai' });
}

type Line = { type?: string; ts: string; text: string; meta?: Record<string, unknown>; blobs?: BlobRef[] };

/** Appends one stored event the way the World does: chat records are `desktop-pet.self`, input is delivered. */
function line(s: JsonlEventStore, e: Line) {
  const type = e.type ?? SELF_TYPE;
  return s.append({
    type, source: 'desktop-pet', origin: type === SELF_TYPE ? 'internal' : 'external',
    ts: e.ts, text: e.text, senderKey: type === SELF_TYPE ? SELF_TYPE : 'desktop-pet.chat',
    ...(e.meta ? { meta: e.meta } : {}),
    ...(e.blobs ? { blobs: e.blobs } : {}),
  });
}

const said = (s: JsonlEventStore, ts: string, text: string) => line(s, { ts, text, meta: { kind: 'say', beats: [{ text }] } });
const asked = (s: JsonlEventStore, ts: string, askId: string, question: string, options: string[]) =>
  line(s, { ts, text: question, meta: { kind: 'ask', askId, question, options, own: true } });
const typed = (s: JsonlEventStore, ts: string, text: string, extra: Partial<Line> = {}) =>
  line(s, { ts, type: 'desktop-pet.message', text, meta: { via: 'chat', text }, ...extra });

/** The text a person reads for one item, in the test's own terms. */
const label = (i: ChatItem): string => i.kind === 'say' ? i.beats[0]!.text
  : i.kind === 'ask' ? i.question
  : i.kind === 'answer' ? (i.text ?? `选项 ${(i.index ?? 0) + 1}`)
  : i.kind === 'user' ? i.text
  : i.kind;

/** The full stream the way a history request reads it, across both runs. */
function history(s: JsonlEventStore) {
  return s.range({ source: 'desktop-pet' });
}

describe('chat history over a real event store', () => {
  function twoRuns() {
    const a = store('r-20261027-090000-aaaa');
    typed(a, '2026-10-27T09:00:00.000+08:00', '我们明天去爬山吧');
    said(a, '2026-10-27T09:01:00.000+08:00', '好呀，早上出发');
    typed(a, '2026-10-27T09:02:00.000+08:00', "Let's go Hiking tomorrow");
    // a second run on the same data dir keeps appending to the same stream
    const b = store('r-20261028-100000-bbbb');
    typed(b, '2026-10-28T10:00:00.000+08:00', '今天天气怎么样');
    said(b, '2026-10-28T10:01:00.000+08:00', '晴，适合爬山');
    asked(b, '2026-10-28T10:02:00.000+08:00', 'q1', '你想几点出发？', ['七点', '八点']);
    line(b, { ts: '2026-10-28T10:03:00.000+08:00', type: 'desktop-pet.answer', text: '七点去', meta: { askId: 'q1', text: '七点去' } });
    const gone = typed(b, '2026-10-28T10:04:00.000+08:00', '这条要撤回');
    line(b, { ts: '2026-10-28T10:05:00.000+08:00', text: `撤回了 #${gone.cursor}`, meta: { kind: 'withdrawn', cursor: gone.cursor } });
    const queued = typed(b, '2026-10-28T10:06:00.000+08:00', '排队的一条');
    line(b, { ts: '2026-10-28T10:07:00.000+08:00', text: '送达了', meta: { kind: 'delivered', cursors: [queued.cursor] } });
    line(b, { ts: '2026-10-28T10:08:00.000+08:00', text: '做了:pet_cua_screenshot', meta: { kind: 'activity', steps: ['pet_cua_screenshot'], ms: 5 } });
    typed(b, '2026-10-29T00:00:00.000+08:00', '午夜整点');
    return b;
  }

  it('queries the whole history across runs, case-insensitively, and leaves out withdrawn messages', () => {
    const s = twoRuns();
    const hiking = chatMatches(history(s), { query: 'hiking', limit: 100 });
    expect(hiking.matches.map(label)).toEqual(["Let's go Hiking tomorrow"]);

    const up = chatMatches(history(s), { query: '爬山', limit: 100 });
    expect(up.matches.map((i) => i.kind)).toEqual(['user', 'say']);
    expect(up.matches[0]).toMatchObject({ ts: '2026-10-27T09:00:00.000+08:00' });
    expect(up.matches[1]).toMatchObject({ ts: '2026-10-28T10:01:00.000+08:00' });

    expect(chatMatches(history(s), { query: '撤回', limit: 100 }).matches).toEqual([]);
    expect(chatMatches(history(s), { query: '排队', limit: 100 }).matches.map((i) => (i as { text: string }).text)).toEqual(['排队的一条']);
  });

  it('reads the time window as [fromTs, toTs)', () => {
    const s = twoRuns();
    const day = chatMatches(history(s), { fromMs: Date.parse('2026-10-28T00:00:00.000+08:00'), toMs: Date.parse('2026-10-29T00:00:00.000+08:00'), limit: 100 });
    const texts = day.matches.map(label);
    expect(texts).toEqual(['今天天气怎么样', '晴，适合爬山', '你想几点出发？', '七点去', '排队的一条']);
    expect(chatMatches(history(s), { fromMs: Date.parse('2026-10-29T00:00:00.000+08:00'), limit: 100 }).matches.map((i) => (i as { text: string }).text)).toEqual(['午夜整点']);
  });

  it('pages back by the cursor of the page already shown, without repeats', () => {
    const s = twoRuns();
    const all = chatMatches(history(s), { limit: 100 });
    expect(all.more).toBe(false);
    const first = chatMatches(history(s), { limit: 3 });
    expect(first.matches).toHaveLength(3);
    expect(first.more).toBe(true);
    expect(first.before).toBe(first.matches[0]!.cursor);
    const second = chatMatches(history(s), { limit: 3, before: first.before! });
    expect(second.matches.map((i) => i.cursor)).toEqual(all.matches.slice(-6, -3).map((i) => i.cursor));
    const seen = [...second.matches, ...first.matches].map((i) => i.cursor);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('locates twenty either side of the named cursor, including the message settled later', () => {
    const s = twoRuns();
    const settled = history(s).find((e) => (e.meta as { kind?: string } | undefined)?.kind === 'delivered')!.cursor;
    const items = chatLocate(history(s), settled, 1);
    expect(items!.map(label)).toEqual(['你想几点出发？', '七点去', '排队的一条', 'activity']);
    expect(items![2]).toMatchObject({ kind: 'user', text: '排队的一条', at: settled });
    expect(chatLocate(history(s), 999999)).toBeNull();
  });

  it('exports the visible conversation as Markdown and changes nothing', () => {
    const s = twoRuns();
    const before = s.latestCursor();
    const text = chatExport(history(s), { fromMs: Date.parse('2026-10-27T00:00:00.000+08:00'), user: '伙伴', bot: 'Coo' });
    expect(text).toContain('# 对话记录');
    expect(text).toContain('## 2026-10-27');
    expect(text).toContain('## 2026-10-28');
    expect(text).toContain('2026-10-27T09:00:00.000+08:00 · 伙伴');
    expect(text).toContain('我们明天去爬山吧');
    expect(text).toContain('晴，适合爬山');
    expect(text).toContain('> 询问: 你想几点出发？');
    expect(text).toContain('> - 七点');
    expect(text).toContain('> 回答: 七点去');
    expect(text).not.toContain('这条要撤回');
    expect(text).not.toContain('pet_cua_screenshot');
    expect(s.latestCursor()).toBe(before);
  });

  it('carries image references and leaves empty records out', () => {
    const s = store('r-20261030-090000-cccc');
    typed(s, '2026-10-30T09:00:00.000+08:00', '看这张', { blobs: [{ handle: 'log:abc.png', mime: 'image/png', name: 'abc.png', fallbackText: '' }] });
    typed(s, '2026-10-30T09:01:00.000+08:00', '');
    asked(s, '2026-10-30T08:59:00.000+08:00', 'q2', '选哪个？', ['甲', '乙']);
    line(s, { ts: '2026-10-30T08:59:30.000+08:00', type: 'desktop-pet.answer', text: '乙', meta: { askId: 'q2', index: 1 } });
    const text = chatExport(history(s), { user: '伙伴', bot: 'Coo' });
    expect(text).toContain('![图片](log:abc.png)');
    expect(text).toContain('> 回答: 选项 2');
    expect(text.match(/· 伙伴/g)).toHaveLength(2);
  });

  it('includes a distant question when locating its answer', () => {
    const s = store('r-20261030-090000-cccc');
    const question = asked(s, '2026-10-30T09:00:00Z', 'distant', 'When?', ['Tomorrow']);
    for (let i = 0; i < 45; i++) said(s, '2026-10-30T09:01:00Z', `line ${i}`);
    const answer = line(s, { ts: '2026-10-30T09:02:00Z', type: 'desktop-pet.answer', text: 'Tomorrow', meta: { askId: 'distant', index: 0 } });
    const found = chatLocate(history(s), answer.cursor)!;
    expect(found[0]!.cursor).toBe(question.cursor);
    expect(found.at(-1)!.cursor).toBe(answer.cursor);
    const english = chatExport(history(s), { user: 'Partner', bot: 'Coo', language: 'en' });
    expect(english).toContain('# Chat history');
    expect(english).toContain('> Question: When?');
    expect(english).toContain('> Answer: Option 1');
  });

  it('keeps a withdrawn page boundary in delivery order without repeating matches', () => {
    const s = store('r-20261030-090000-cccc');
    const delayed = typed(s, '2026-10-30T09:00:00Z', 'delayed');
    const older = said(s, '2026-10-30T09:01:00Z', 'older');
    const boundary = typed(s, '2026-10-30T09:02:00Z', 'boundary');
    line(s, { ts: '2026-10-30T09:03:00Z', text: 'delivered', meta: { kind: 'delivered', cursors: [delayed.cursor] } });
    const first = chatMatches(history(s), { limit: 2 });
    expect(first.matches.map(label)).toEqual(['boundary', 'delayed']);
    line(s, { ts: '2026-10-30T09:04:00Z', text: 'withdrawn', meta: { kind: 'withdrawn', cursor: boundary.cursor } });
    const next = chatMatches(history(s), { limit: 2, before: first.before! });
    expect(next.matches.map((item) => item.cursor)).toEqual([older.cursor]);
    expect(next.more).toBe(false);
  });

  it('keeps the answered state when locating a question with a distant answer', () => {
    const s = store('r-20261030-090000-cccc');
    const question = asked(s, '2026-10-30T09:00:00Z', 'later', 'When?', ['Tomorrow']);
    for (let i = 0; i < 24; i++) said(s, '2026-10-30T09:01:00Z', `line ${i}`);
    const answer = line(s, { ts: '2026-10-30T09:02:00Z', type: 'desktop-pet.answer', text: 'Tomorrow', meta: { askId: 'later', index: 0 } });
    expect(chatLocate(history(s), question.cursor)!.map((item) => item.cursor)).toContain(answer.cursor);
  });

  it('searches an option answer by its selected text on the day it was answered', () => {
    const s = store('r-20261030-090000-cccc');
    asked(s, '2026-10-29T09:00:00Z', 'overnight', 'When?', ['Seven', 'Eight']);
    const answer = line(s, { ts: '2026-10-30T09:00:00Z', type: 'desktop-pet.answer', text: 'Eight', meta: { askId: 'overnight', index: 1 } });
    const found = chatMatches(history(s), { query: 'eight', fromMs: Date.parse('2026-10-30T00:00:00Z'), limit: 100 });
    expect(found.matches.map((item) => item.cursor)).toEqual([answer.cursor]);
    expect(found.matches[0]).toMatchObject({ kind: 'answer', choice: 'Eight' });
  });

  it('holds delivery order at the first page while a queued boundary is delivered', () => {
    const s = store('r-20261030-090000-cccc');
    const older = said(s, '2026-10-30T09:00:00Z', 'older');
    const queued = typed(s, '2026-10-30T09:01:00Z', 'queued');
    said(s, '2026-10-30T09:02:00Z', 'newer');
    const first = chatMatches(history(s), { limit: 2 });
    expect(first.matches.map(label)).toEqual(['queued', 'newer']);
    line(s, { ts: '2026-10-30T09:03:00Z', text: 'delivered', meta: { kind: 'delivered', cursors: [queued.cursor] } });
    const next = chatMatches(history(s), { limit: 2, before: first.before!, snapshot: first.snapshot });
    expect(next.matches.map((item) => item.cursor)).toEqual([older.cursor]);
    expect(next.snapshot).toBe(first.snapshot);
    expect(chatMatches(history(s), { limit: 3 }).matches.map(label)).toEqual(['older', 'newer', 'queued']);
  });
});
