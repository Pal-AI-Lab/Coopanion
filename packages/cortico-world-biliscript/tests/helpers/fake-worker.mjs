// Stands in for python/biliscript_worker.py: same subcommands and output lines, no models.
// FAKE_WORKER_MODE: ok (default) | error | hang | silent-exit.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const [cmd, jobFile] = process.argv.slice(2);
const mode = process.env.FAKE_WORKER_MODE ?? 'ok';

if (cmd === 'check') {
  emit({
    kind: 'check',
    python: '3.11.0',
    modules: { 'yt-dlp': '1', 'faster-whisper': '1', 'pyannote.audio': '3', torch: '2' },
    cuda: true,
    gpu: 'Test GPU',
    asrDevice: 'cuda',
    diarizationDevice: 'cpu',
    problems: ['torch 2.0 is a CPU-only build; speaker separation runs on the CPU'],
  });
  process.exit(0);
}
const job = JSON.parse(readFileSync(jobFile, 'utf8'));
emit({ kind: 'stage', stage: 'download' });
if (mode === 'error') {
  emit({ kind: 'error', code: 'download', message: 'HTTP Error 412' });
  process.exit(1);
}
if (mode === 'silent-exit') {
  process.stderr.write('Traceback: boom\n');
  process.exit(3);
}
if (mode === 'hang') {
  emit({ kind: 'stage', stage: 'asr' });
  setInterval(() => {}, 1000);
} else {
  const video = { title: '测试视频', uploader: 'UP', durationSec: 75, webpageUrl: job.url, id: 'BV1xx411c7mD' };
  emit({ kind: 'video', video });
  emit({ kind: 'stage', stage: 'asr' });
  emit({ kind: 'device', stage: 'asr', device: 'cuda' });
  emit({ kind: 'notice', stage: 'asr', message: 'GPU transcription failed (RuntimeError: test); ran on the CPU' });
  emit({ kind: 'device', stage: 'asr', device: 'cpu' });
  emit({ kind: 'progress', stage: 'asr', done: 40, total: 75 });
  emit({ kind: 'stage', stage: 'diarization' });
  const transcript = {
    video,
    language: 'zh',
    durationSec: 75,
    asrModel: job.asr.model,
    diarizationModel: job.diarization.model,
    speakers: ['S1', 'S2'],
    lines: [
      { start: 1, end: 3, speaker: 'S1', text: '大家好,我是老王。' },
      { start: 4, end: 6, speaker: 'S2', text: '王老师好,今天聊什么?' },
      { start: 7, end: 9, speaker: 'S1', text: '聊聊机器学习。' },
    ],
  };
  const file = join(job.outDir, 'transcript.json');
  writeFileSync(file, JSON.stringify(transcript));
  writeFileSync(join(job.outDir, 'seen-env.json'), JSON.stringify({ hf: process.env.HF_TOKEN ?? null, cookie: process.env.BILISCRIPT_COOKIE ?? null, job }));
  emit({ kind: 'done', transcript: file });
}
