/**
 * Character naming and text correction by a model: names speakers from what they say and corrects
 * recognition errors chunk by chunk. Replies are parsed as JSON; anything that does not parse or
 * names unknown lines is dropped, and the transcript keeps its recognized text.
 *
 * `createChatClient` speaks to a separately configured service over one of three wire protocols:
 * OpenAI Chat Completions (and every service compatible with it), Anthropic Messages and Gemini
 * generateContent. `deployment-model.ts` supplies the client for the deployment's own endpoint.
 */
import type { LLMUsage } from 'cortico/core/types.ts';
import type { WriterProtocol } from './config.ts';
import type { ScriptLine, VideoInfo } from './script.ts';

export interface ChatRequest {
  system: string;
  user: string;
}

/** One model; it reports the usage of every request itself. */
export interface ChatClient {
  readonly model: string;
  chat(req: ChatRequest, signal?: AbortSignal): Promise<string>;
}

export interface EndpointOptions {
  protocol: WriterProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  timeoutMs: number;
  onUsage(usage: LLMUsage): void;
  fetchImpl?: typeof fetch;
}

interface ChatReply {
  text: string;
  usage: LLMUsage;
}

const usage = (prompt: unknown, completion: unknown): LLMUsage => ({
  promptTokens: Number(prompt) || 0,
  completionTokens: Number(completion) || 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
});

/** Request URL, headers and body for one protocol, and how to read the reply. */
function wire(o: EndpointOptions, req: ChatRequest): {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  read: (json: any) => ChatReply;
} {
  const base = o.baseUrl.replace(/\/+$/, '');
  switch (o.protocol) {
    case 'anthropic':
      return {
        url: `${base}/v1/messages`,
        headers: { 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' },
        body: {
          model: o.model,
          max_tokens: o.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
        },
        read: (j) => ({
          text: (j.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join(''),
          usage: usage(j.usage?.input_tokens, j.usage?.output_tokens),
        }),
      };
    case 'gemini':
      return {
        url: `${base}/v1beta/models/${encodeURIComponent(o.model)}:generateContent`,
        headers: { 'x-goog-api-key': o.apiKey },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: { maxOutputTokens: o.maxTokens, temperature: 0.2 },
        },
        read: (j) => ({
          text: (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''),
          usage: usage(j.usageMetadata?.promptTokenCount, j.usageMetadata?.candidatesTokenCount),
        }),
      };
    case 'openai':
      return {
        url: `${base}/chat/completions`,
        headers: o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {},
        body: {
          model: o.model,
          max_tokens: o.maxTokens,
          temperature: 0.2,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        },
        read: (j) => ({
          text: String(j.choices?.[0]?.message?.content ?? ''),
          usage: usage(j.usage?.prompt_tokens, j.usage?.completion_tokens),
        }),
      };
  }
}

export function createChatClient(o: EndpointOptions): ChatClient {
  const fetchImpl = o.fetchImpl ?? fetch;
  return {
    model: o.model,
    async chat(req, signal) {
      const w = wire(o, req);
      const timeout = AbortSignal.timeout(o.timeoutMs);
      const res = await fetchImpl(w.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...w.headers },
        body: JSON.stringify(w.body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`${o.protocol} ${w.url} answered ${res.status}: ${raw.slice(0, 300)}`);
      const reply = w.read(JSON.parse(raw));
      o.onUsage(reply.usage);
      return reply.text;
    },
  };
}

/** The first JSON value in a reply, with or without a code fence around it. */
export function parseJsonReply(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('reply holds no JSON');
  const open = body[start];
  const end = body.lastIndexOf(open === '{' ? '}' : ']');
  return JSON.parse(body.slice(start, end + 1));
}

const fmtTime = (sec: number): string => {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const MAX_NAME_CHARS = 40;
/** Transcript characters sent for naming; a longer transcript is cut at a line boundary. */
const NAMING_MAX_CHARS = 24_000;
/** Characters of recognized text per correction request. */
const POLISH_CHUNK_CHARS = 3_000;

export interface Naming {
  names: Record<string, string>;
  /** Why each name was chosen, as the model put it. */
  evidence: Record<string, string>;
}

const NAMING_SYSTEM = [
  'You read machine transcripts of videos in which speakers are labeled S1, S2, ... by a diarization model.',
  'For each label, decide what the person is called, using only the transcript and the video metadata:',
  'names spoken in the dialogue, how others address them, self-introductions, roles (host, guest, interviewer).',
  'If nothing in the material identifies a speaker, return null for that label. Do not invent names.',
  'Two labels may be the same person when the diarization split one voice; you may give them the same name.',
  'Answer with JSON only: {"S1": {"name": "...", "evidence": "..."}, "S2": {"name": null, "evidence": "..."}}.',
  'Write names and evidence in the language of the transcript.',
].join('\n');

export async function nameSpeakers(
  client: ChatClient,
  video: VideoInfo,
  speakers: readonly string[],
  lines: readonly ScriptLine[],
  signal?: AbortSignal,
): Promise<Naming> {
  const body: string[] = [];
  let size = 0;
  for (const l of lines) {
    const row = `[${fmtTime(l.start)}] ${l.speaker}: ${l.text}`;
    if (size + row.length > NAMING_MAX_CHARS) break;
    body.push(row);
    size += row.length + 1;
  }
  const user = [
    `Title: ${video.title}`,
    video.uploader ? `Uploader: ${video.uploader}` : '',
    `Speaker labels: ${speakers.join(', ')}`,
    body.length < lines.length ? `Transcript (first ${body.length} of ${lines.length} lines):` : 'Transcript:',
    body.join('\n'),
  ].filter(Boolean).join('\n');
  const parsed = parseJsonReply(await client.chat({ system: NAMING_SYSTEM, user }, signal));
  const names: Record<string, string> = {};
  const evidence: Record<string, string> = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const s of speakers) {
      const entry = (parsed as Record<string, unknown>)[s];
      const name = typeof entry === 'string' ? entry : (entry as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.trim() && name.trim().length <= MAX_NAME_CHARS) {
        names[s] = name.trim();
        const why = (entry as { evidence?: unknown } | null)?.evidence;
        if (typeof why === 'string' && why.trim()) evidence[s] = why.trim();
      }
    }
  }
  return { names, evidence };
}

const POLISH_SYSTEM = [
  'You correct speech recognition output line by line.',
  'Fix misrecognized words (homophones, names, terms that the context makes clear) and punctuation.',
  'Keep the meaning, the speaker and the line boundaries; do not summarize, merge, split or add lines.',
  'Leave a line unchanged when unsure. Keep the language and script (simplified or traditional) of the input.',
  'Answer with JSON only: [{"n": <line number>, "text": "<corrected line>"}, ...], one entry per input line.',
].join('\n');

export interface PolishResult {
  /** Corrected text by line index; lines left out keep their recognized text. */
  texts: Map<number, string>;
  /** Chunks whose request or reply failed, with the reason. */
  failures: string[];
}

export async function polishLines(
  client: ChatClient,
  video: VideoInfo,
  lines: readonly ScriptLine[],
  signal?: AbortSignal,
): Promise<PolishResult> {
  const texts = new Map<number, string>();
  const failures: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (signal?.aborted) break;
    const from = i;
    let size = 0;
    const rows: string[] = [];
    while (i < lines.length && (rows.length === 0 || size + lines[i].text.length <= POLISH_CHUNK_CHARS)) {
      rows.push(`${i + 1}\t${lines[i].speaker}\t${lines[i].text}`);
      size += lines[i].text.length;
      i++;
    }
    try {
      const reply = await client.chat({ system: POLISH_SYSTEM, user: `Video: ${video.title}\n\n${rows.join('\n')}` }, signal);
      const parsed = parseJsonReply(reply);
      if (!Array.isArray(parsed)) throw new Error('reply is not a JSON array');
      for (const item of parsed) {
        const n = Number((item as { n?: unknown })?.n) - 1;
        const text = (item as { text?: unknown })?.text;
        if (Number.isInteger(n) && n >= from && n < i && typeof text === 'string' && text.trim()) {
          texts.set(n, text.trim());
        }
      }
    } catch (err) {
      failures.push(`lines ${from + 1}-${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { texts, failures };
}
