import { afterEach, describe, expect, it } from 'vitest';
import { createChatClient, parseJsonReply, polishLines } from '../src/writer.ts';
import type { ScriptLine, VideoInfo } from '../src/script.ts';
import { startChatServer } from './helpers/chat-server.ts';

const VIDEO: VideoInfo = { title: 'T', uploader: '', durationSec: 10, webpageUrl: 'u', ref: 'BV1xx411c7mD', page: 1 };
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

describe('createChatClient', () => {
  it('anthropic: posts to /v1/messages with x-api-key and reads text blocks', async () => {
    const s = await startChatServer(() => ({
      json: { content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 3, output_tokens: 1 } },
    }));
    close = s.close;
    const c = createChatClient({ protocol: 'anthropic', baseUrl: s.baseUrl, model: 'm', apiKey: 'k', maxTokens: 100, timeoutMs: 5000 });
    const r = await c.chat({ system: 'sys', user: 'u' });
    expect(r.text).toBe('hi');
    expect(r.usage.promptTokens).toBe(3);
    expect(s.received[0].path).toBe('/v1/messages');
    expect(s.received[0].headers['x-api-key']).toBe('k');
    expect(s.received[0].body).toMatchObject({ model: 'm', system: 'sys', messages: [{ role: 'user', content: 'u' }] });
  });

  it('gemini: posts to generateContent with x-goog-api-key and reads candidate parts', async () => {
    const s = await startChatServer(() => ({
      json: { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } },
    }));
    close = s.close;
    const c = createChatClient({ protocol: 'gemini', baseUrl: `${s.baseUrl}/`, model: 'g-1', apiKey: 'k', maxTokens: 100, timeoutMs: 5000 });
    const r = await c.chat({ system: 'sys', user: 'u' });
    expect(r.text).toBe('ab');
    expect(r.usage.completionTokens).toBe(2);
    expect(s.received[0].path).toBe('/v1beta/models/g-1:generateContent');
    expect(s.received[0].headers['x-goog-api-key']).toBe('k');
  });

  it('openai: an error status becomes an error with the body', async () => {
    const s = await startChatServer(() => ({ status: 401, json: { error: 'bad key' } }));
    close = s.close;
    const c = createChatClient({ protocol: 'openai', baseUrl: `${s.baseUrl}/v1`, model: 'm', apiKey: 'k', maxTokens: 100, timeoutMs: 5000 });
    await expect(c.chat({ system: 's', user: 'u' })).rejects.toThrow(/401.*bad key/);
    expect(s.received[0].headers.authorization).toBe('Bearer k');
  });
});

describe('parseJsonReply', () => {
  it('reads fenced and bare JSON with surrounding prose', () => {
    expect(parseJsonReply('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('result [1,2] done')).toEqual([1, 2]);
  });
});

describe('polishLines', () => {
  it('keeps recognized text for lines the reply leaves out or numbers outside the chunk', async () => {
    const lines: ScriptLine[] = [
      { start: 0, end: 1, speaker: 'S1', text: 'a' },
      { start: 1, end: 2, speaker: 'S2', text: 'b' },
    ];
    const client = {
      model: 'm',
      chat: async () => ({
        text: '[{"n": 2, "text": "B"}, {"n": 9, "text": "x"}]',
        usage: { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0 },
      }),
    };
    const r = await polishLines(client, VIDEO, lines, () => {});
    expect([...r.texts]).toEqual([[1, 'B']]);
    expect(r.failures).toEqual([]);
  });
});
