/**
 * Real-service check, run by hand: an audio attachment on a Gemini endpoint reaches the model as
 * audio. The request goes through the coo provider the app uses (`COO.create`), with the attachment
 * in the context the way Core delivers it (a `[blob ...]` line plus `context.blobs`).
 *
 *   GEMINI_API_KEY=<AI Studio key> pnpm exec tsx scripts/check-gemini-audio.ts [file.wav|.mp3|.ogg|.flac]
 *
 * Without a file it sends a generated 2 s 440 Hz tone and passes when the model calls it a tone.
 * With a file it prints what the model hears. Either way it passes only when Gemini reports audio
 * input tokens (`promptTokensDetails` modality AUDIO). `GEMINI_MODEL` picks the model (default: the
 * vendor table's starting model), `GEMINI_BASE_URL` the endpoint. Without a key it exits 0 and
 * sends nothing.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { blobLine } from 'cortico/core/blobs.ts';
import { nullLogger } from 'cortico/core/util.ts';
import { itemText, message } from 'cortico/protocol/open-responses/context.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import COO, { VENDORS } from '../packages/cortico-provider-coo/src/index.ts';
import { siteOf } from '../packages/cortico-provider-coo/src/vendors.ts';

const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
if (!key) {
  console.log('skipped: set GEMINI_API_KEY to an AI Studio key (https://aistudio.google.com/apikey) to run this check');
  process.exit(0);
}

const MIME_BY_EXT: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.aiff': 'audio/aiff' };

/** 16 kHz mono 16-bit PCM WAV of a sine tone. */
function toneWav(hz: number, seconds: number): Buffer {
  const rate = 16_000;
  const samples = Math.round(rate * seconds);
  const out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) out.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * i / rate) * 12_000), 44 + i * 2);
  return out;
}

const file = process.argv[2];
const mime = file ? MIME_BY_EXT[extname(file).toLowerCase()] : 'audio/wav';
if (!mime) throw new Error(`unknown audio type for ${file}; use one of ${Object.keys(MIME_BY_EXT).join(' ')}`);
const bytes = file ? readFileSync(file) : toneWav(440, 2);
const question = file
  ? 'Describe the attached audio: the speaker\'s tone of voice if anyone speaks, and the background sounds and where it was likely recorded.'
  : 'What is in the attached audio? Answer with exactly one word: silence, tone, speech, music or noise.';

const gemini = VENDORS.find((v) => v.id === 'gemini')!;
const model = process.env.GEMINI_MODEL ?? gemini.model;
const entry = {
  kind: 'coo', baseUrl: process.env.GEMINI_BASE_URL ?? siteOf(gemini, 'intl').baseUrl, secret: 'GEMINI_API_KEY',
  spec: { model, thinking: false }, multimodal: true, options: { protocol: 'gemini' },
};
const handle = 'log:check-audio';
const instance = COO.create('gemini', entry as never, {
  stateDir: mkdtempSync(join(tmpdir(), 'gemini-audio-')), secret: () => key, keepThinking: () => true, log: nullLogger(),
  readBlob: (h: string) => (h === handle ? bytes : null),
} as never);

console.log(`accepts(${mime}) = ${COO.accepts!(entry as never, entry.spec as never, mime)}; sending ${bytes.length} bytes to ${model}`);
const ref = { handle, mime, name: file ? extname(file) : 'tone.wav', fallbackText: '[audio]' };
const context = [{ ...message('user', `${question}\n${blobLine(ref)}`), context: { blobs: [ref] } }];
const generation = await instance.client.respond({ model, input: context.map((r) => r.item) } as unknown as Request, { context });
const answer = generation.response.output.map((item) => (item.type === 'message' ? itemText(item as never) : '')).join('').trim();
const audioTokens = generation.attempts.at(-1)?.meters.details?.input_audio?.quantity ?? 0;
console.log(`model: ${answer}`);
console.log(`audio input tokens: ${audioTokens}`);

const heard = audioTokens > 0;
const recognized = file ? true : /\btone\b/i.test(answer);
if (!heard || !recognized) {
  console.error(`FAIL: ${!heard ? 'Gemini reported no audio input tokens' : 'the model did not recognize the tone'}`);
  process.exit(1);
}
console.log('PASS');
