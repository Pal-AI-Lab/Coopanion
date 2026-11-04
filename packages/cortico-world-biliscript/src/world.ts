/**
 * Bilibili video dialogue → script. A job runs `python/biliscript_worker.py` (yt-dlp download,
 * faster-whisper recognition, pyannote.audio diarization, word-level alignment) in a child process,
 * then has a model name speakers and correct the text (`writer.mode`: the deployment's active endpoint,
 * a separately configured one, or none, leaving names to the bot). Jobs run one at
 * a time; their records live in `<dataDir>/biliscript/jobs.json`, their files in
 * `<dataDir>/biliscript/<id>/` (transcript.json from the worker, script.json and script.md here).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Charge } from 'cortico/core/generation.ts';
import type { LLMUsage, ToolDef, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts';
import type { Language } from 'cortico/core/language.ts';
import { nowIso } from 'cortico/core/util.ts';
import {
  BILISCRIPT_DEFAULTS,
  BILISCRIPT_ID,
  BILISCRIPT_SECRETS,
  biliScriptConfigGroup,
  type BiliScriptConfigSection,
} from './config.ts';
import { modelLanguage, modelText, type JobLine, type ModelLanguage, type SetupFacts } from './model-text.ts';
import {
  clock,
  displayName,
  formatLine,
  lineCounts,
  renderMarkdown,
  scriptFromTranscript,
  type Script,
  type WorkerTranscript,
} from './script.ts';
import { uiText } from './strings.ts';
import { isShortLink, parseVideoRef, resolveShortLink } from './video.ts';
import { openDeploymentModel } from './deployment-model.ts';
import { createChatClient, nameSpeakers, polishLines, type ChatClient } from './writer.ts';

const WORKER_FILE = fileURLToPath(new URL('../python/biliscript_worker.py', import.meta.url));
const ENV_PROMPT_FILES: Record<ModelLanguage, string> = {
  zh: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
  en: fileURLToPath(new URL('./ENV_PROMPT.en.md', import.meta.url)),
};
const REQUIRED_MODULES = ['yt-dlp', 'faster-whisper', 'torch'];
/** Lines of the script quoted in the finished event. */
const PREVIEW_LINES = 20;
const PREVIEW_MAX_CHARS = 2_000;
const READ_DEFAULT_LIMIT = 80;
const READ_MAX_LIMIT = 300;
const STDERR_TAIL_CHARS = 1_500;

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobRecord {
  id: number;
  input: string;
  ref: string;
  page: number;
  url: string;
  speakers: { num?: number; min?: number; max?: number };
  state: JobState;
  stage?: string;
  progress?: { done: number; total: number };
  title?: string;
  createdAt: string;
  finishedAt?: string;
  error?: { stage: string; message: string };
  /** Device each worker step ran on, as the worker reported it. */
  devices?: { asr?: string; diarization?: string };
  /** Fallbacks the worker took, in English. */
  notices?: string[];
}

interface JobsFile {
  nextId: number;
  jobs: JobRecord[];
}

type SetupState = { kind: 'checking' } | { kind: 'ok'; facts: SetupFacts } | { kind: 'error'; message: string };

export interface BiliScriptWorldOptions {
  /** `worlds.biliscript`, read live. */
  cfg: BiliScriptConfigSection;
  timezone: string;
  dataDir: string;
  /** Deployment directory; its config.json names the endpoint `deployment` mode uses. */
  botDir: string;
  repoRoot: string;
  secret(name: string): string;
  /** Command and leading arguments that run the worker; the subcommand follows. Default: the configured Python on the bundled worker. */
  workerCommand?: () => { command: string; args: string[] };
  /** Directories holding endpoint directories for `deployment` mode; default: Cortico's providers root, then `<botDir>/providers`. */
  providersDirs?: readonly string[];
  language?: ModelLanguage;
}

/** Every tool; `describe` and `tools()` both take it. */
export const BILISCRIPT_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'biliscript_transcribe',
    description:
      'Queue a bilibili video for transcription into a dialogue script with speakers separated. Returns the job number at once; the result arrives later as a biliscript.finished or biliscript.failed event.',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        video: { type: 'string', description: 'BV id, av id, video page URL or b23.tv short link.' },
        page: { type: 'integer', minimum: 1, description: 'Part number of a multi-part video. Default: the p in the URL, else 1.' },
        speakers: { type: 'integer', minimum: 1, maximum: 20, description: 'Exact number of speakers, when known. Improves separation.' },
        minSpeakers: { type: 'integer', minimum: 1, maximum: 20 },
        maxSpeakers: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['video'],
    },
  },
  {
    name: 'biliscript_jobs',
    description: 'List transcription jobs with their state, stage and progress, newest first.',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10.' } },
    },
  },
  {
    name: 'biliscript_read',
    description: 'Read lines of a finished script as "[time] Name: line", with the cast and its line counts.',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        job: { type: 'integer', description: 'Job number.' },
        from: { type: 'integer', minimum: 1, description: 'First line, from 1. Default 1.' },
        limit: { type: 'integer', minimum: 1, maximum: READ_MAX_LIMIT, description: `Default ${READ_DEFAULT_LIMIT}.` },
        speaker: { type: 'string', description: 'Only lines of this label (S1, S2, ...).' },
      },
      required: ['job'],
    },
  },
  {
    name: 'biliscript_name_speakers',
    description:
      'Give speaker labels character names and rewrite the script file. An empty string returns a label to unnamed. Labels not listed keep their names.',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        job: { type: 'integer' },
        names: {
          type: 'object',
          description: 'Label → name, e.g. {"S1": "Name", "S2": ""}.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['job', 'names'],
    },
  },
  {
    name: 'biliscript_cancel',
    description: 'Cancel a queued or running job.',
    tags: ['act'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { job: { type: 'integer' } },
      required: ['job'],
    },
  },
];

const intArg = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);

export class BiliScriptWorld implements World {
  readonly id = BILISCRIPT_ID;
  private host: WorldHost | null = null;
  private readonly root: string;
  private readonly jobsFile: string;
  private state: JobsFile = { nextId: 1, jobs: [] };
  private setup: SetupState = { kind: 'checking' };
  private running: { id: number; child: ChildProcess | null; abort: AbortController } | null = null;
  private pumping = false;
  private stopped = false;

  constructor(private readonly opts: BiliScriptWorldOptions) {
    this.root = join(opts.dataDir, BILISCRIPT_ID);
    this.jobsFile = join(this.root, 'jobs.json');
  }

  private get t() {
    return modelText(this.opts.language ?? modelLanguage());
  }

  private get cfg(): BiliScriptConfigSection {
    const c = this.opts.cfg;
    return {
      ...BILISCRIPT_DEFAULTS,
      ...c,
      asr: { ...BILISCRIPT_DEFAULTS.asr, ...c.asr },
      diarization: { ...BILISCRIPT_DEFAULTS.diarization, ...c.diarization },
      writer: { ...BILISCRIPT_DEFAULTS.writer, ...c.writer },
    };
  }

  // ---------------------------------------------------------------- lifecycle

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.stopped = false;
    mkdirSync(this.root, { recursive: true });
    this.load();
    let interrupted = false;
    for (const j of this.state.jobs) {
      if (j.state === 'running') {
        j.state = 'failed';
        j.error = { stage: j.stage ?? 'start', message: this.t.restarted };
        j.finishedAt = nowIso(this.opts.timezone);
        interrupted = true;
      }
    }
    if (interrupted) this.save();
    void this.checkSetup();
    void this.pump();
  }

  /** Kills the running worker and waits up to 5 s for it to exit. */
  async stop(): Promise<void> {
    this.stopped = true;
    const child = this.running?.child;
    this.running?.abort.abort();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    }
    this.host = null;
  }

  // ---------------------------------------------------------------- prompt and WebUI

  envPromptVars(): Record<string, string> {
    const t = this.t;
    const w = this.cfg.writer;
    const writer =
      w.mode === 'deployment'
        ? t.writerDeployment
        : w.mode === 'endpoint' && w.baseUrl && w.model
          ? t.writerEndpoint(w.model)
          : t.writerBot;
    return { 'biliscript.setup': this.setupText(), 'biliscript.writer': writer };
  }

  webUi(language: Language = 'zh'): WorldWebUiDecl {
    const u = uiText(language);
    const active = this.state.jobs.filter((j) => j.state === 'queued' || j.state === 'running').length;
    const setupBadge =
      this.setup.kind === 'checking'
        ? { label: 'Python', value: u.checking, tone: 'plain' as const }
        : this.setup.kind === 'error'
          ? { label: 'Python', value: u.pythonMissing, tone: 'off' as const }
          : this.missingModules().length
            ? { label: 'Python', value: u.modulesMissing(this.missingModules().join(', ')), tone: 'off' as const }
            : {
                label: 'Python',
                value: `${u.ready} · ${this.setup.facts.asrDevice === 'cuda' ? u.onGpu(this.setup.facts.gpu ?? 'CUDA') : u.onCpu}`,
                tone: 'on' as const,
              };
    return {
      label: u.label,
      badges: [setupBadge, { label: u.jobs, value: active, tone: 'plain' }],
      config: [biliScriptConfigGroup(language)],
      promptDocs: [
        {
          key: `worlds.${BILISCRIPT_ID}.envPrompt`,
          title: u.envPromptTitle,
          description: u.envPromptDesc,
          path: ENV_PROMPT_FILES[this.opts.language ?? modelLanguage()],
          role: 'envPrompt',
          vars: [
            { name: 'biliscript.setup', description: u.varSetup },
            { name: 'biliscript.writer', description: u.varWriter },
          ],
        },
      ],
      storage: [
        {
          key: `${BILISCRIPT_ID}-jobs`,
          label: u.storageLabel,
          kind: 'disk',
          location: this.root,
          danger: true,
          note: u.storageNote,
          stat: () => String(this.state.jobs.length),
          clear: () => {
            const n = this.state.jobs.length;
            this.running?.abort.abort();
            this.running?.child?.kill();
            for (const j of this.state.jobs) rmSync(this.jobDir(j.id), { recursive: true, force: true });
            this.state = { nextId: this.state.nextId, jobs: [] };
            this.save();
            return u.cleared(n);
          },
        },
      ],
    };
  }

  tools(): ToolDef[] {
    const [transcribe, jobs, read, name, cancel] = BILISCRIPT_TOOL_DECLS;
    return [
      { ...transcribe, handler: (a) => this.transcribe(a) },
      { ...jobs, handler: async (a) => this.listJobs(intArg(a.limit) ?? 10) },
      { ...read, handler: async (a) => this.read(a) },
      { ...name, handler: async (a) => this.nameSpeakersTool(a) },
      { ...cancel, handler: async (a) => this.cancel(intArg(a.job) ?? -1) },
    ];
  }

  // ---------------------------------------------------------------- tools

  private async transcribe(a: Record<string, unknown>): Promise<string | { text: string; failed: true }> {
    const t = this.t;
    const input = String(a.video ?? '').trim();
    let source = input;
    if (isShortLink(input)) {
      try {
        source = await resolveShortLink(input);
      } catch (err) {
        return { text: t.shortLinkFailed(input, err instanceof Error ? err.message : String(err)), failed: true };
      }
    }
    const ref = parseVideoRef(source, intArg(a.page));
    if (!ref) return { text: t.badVideo(input), failed: true };
    const job: JobRecord = {
      id: this.state.nextId++,
      input,
      ref: ref.id,
      page: ref.page,
      url: ref.url,
      speakers: { num: intArg(a.speakers), min: intArg(a.minSpeakers), max: intArg(a.maxSpeakers) },
      state: 'queued',
      createdAt: nowIso(this.opts.timezone),
    };
    const ahead = this.state.jobs.filter((j) => j.state === 'queued' || j.state === 'running').length;
    this.state.jobs.push(job);
    this.save();
    void this.pump();
    return t.queued(job.id, ahead);
  }

  private listJobs(limit: number): string {
    const jobs = [...this.state.jobs].reverse().slice(0, limit);
    if (!jobs.length) return `${this.t.noJobs}\n${this.setupText()}`;
    return jobs.map((j) => this.t.jobLine(this.jobLine(j))).join('\n');
  }

  private read(a: Record<string, unknown>): string | { text: string; failed: true } {
    const t = this.t;
    const loaded = this.loadScript(intArg(a.job) ?? -1);
    if (typeof loaded === 'string') return { text: loaded, failed: true };
    const { job, script } = loaded;
    const speaker = typeof a.speaker === 'string' && a.speaker ? a.speaker : null;
    const indexed = script.lines.map((l, i) => ({ l, n: i + 1 })).filter((x) => !speaker || x.l.speaker === speaker);
    const from = Math.max(1, intArg(a.from) ?? 1);
    const limit = Math.min(READ_MAX_LIMIT, Math.max(1, intArg(a.limit) ?? READ_DEFAULT_LIMIT));
    const page = indexed.filter((x) => x.n >= from).slice(0, limit);
    const cast = this.castLine(script);
    if (!page.length) return `${cast}\n${t.readEnd(job.id, script.lines.length)}`;
    const last = page[page.length - 1].n;
    const rest = indexed.find((x) => x.n > last);
    return [
      cast,
      t.readHeader(job.id, page[0].n, last, script.lines.length),
      ...page.map((x) => `${x.n}. ${formatLine(script, x.l)}`),
      ...(rest ? [t.readMore(rest.n)] : []),
    ].join('\n');
  }

  private nameSpeakersTool(a: Record<string, unknown>): string | { text: string; failed: true } {
    const t = this.t;
    const loaded = this.loadScript(intArg(a.job) ?? -1);
    if (typeof loaded === 'string') return { text: loaded, failed: true };
    const { job, script } = loaded;
    const names = (a.names && typeof a.names === 'object' ? a.names : {}) as Record<string, unknown>;
    const unknown = Object.keys(names).filter((k) => !script.speakers.includes(k));
    if (unknown.length) return { text: t.unknownSpeakers(unknown.join(', ')), failed: true };
    for (const [label, value] of Object.entries(names)) {
      const name = String(value ?? '').trim();
      if (name) {
        script.names[label] = name;
        script.nameSource[label] = 'bot';
      } else {
        delete script.names[label];
        delete script.nameSource[label];
      }
      delete script.evidence[label];
    }
    const md = this.writeScript(job.id, script);
    return t.named(job.id, this.castLine(script), md);
  }

  private cancel(id: number): string | { text: string; failed: true } {
    const t = this.t;
    const job = this.state.jobs.find((j) => j.id === id);
    if (!job) return { text: t.noJob(id), failed: true };
    if (job.state !== 'queued' && job.state !== 'running') return { text: t.cannotCancel(id, job.state), failed: true };
    if (this.running?.id === id) {
      this.running.abort.abort();
      this.running.child?.kill();
    }
    job.state = 'cancelled';
    job.finishedAt = nowIso(this.opts.timezone);
    this.save();
    return t.cancelled(id);
  }

  // ---------------------------------------------------------------- queue

  /** Runs queued jobs one after another until none is left. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.stopped && this.host) {
        const job = this.state.jobs.find((j) => j.state === 'queued');
        if (!job) break;
        await this.runJob(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runJob(job: JobRecord): Promise<void> {
    const abort = new AbortController();
    this.running = { id: job.id, child: null, abort };
    job.state = 'running';
    job.stage = 'start';
    this.save();
    const dir = this.jobDir(job.id);
    mkdirSync(dir, { recursive: true });
    try {
      const transcript = await this.runWorker(job, dir, abort);
      if (abort.signal.aborted) return;
      const script = scriptFromTranscript(transcript, job.ref, job.page);
      job.title = script.video.title;
      const notes = await this.applyWriter(job, script, abort.signal);
      if (abort.signal.aborted) return;
      const md = this.writeScript(job.id, script);
      job.state = 'done';
      job.stage = undefined;
      job.progress = undefined;
      job.finishedAt = nowIso(this.opts.timezone);
      this.save();
      await this.pushFinished(job, script, md, notes);
    } catch (err) {
      if (abort.signal.aborted || (job.state as JobState) === 'cancelled') return;
      job.state = 'failed';
      job.error = { stage: job.stage ?? 'start', message: err instanceof Error ? err.message : String(err) };
      job.finishedAt = nowIso(this.opts.timezone);
      this.save();
      await this.host?.pushEvent(
        {
          type: 'biliscript.failed',
          ts: nowIso(this.opts.timezone),
          source: this.id,
          origin: 'internal',
          senderKey: this.id,
          text: this.t.failed(job.id, job.ref, job.error.stage, job.error.message),
          meta: { job: job.id, stage: job.error.stage },
        },
        { trigger: 'flush' },
      );
    } finally {
      this.running = null;
    }
  }

  private workerCommand(): { command: string; args: string[] } {
    if (this.opts.workerCommand) return this.opts.workerCommand();
    const python = this.cfg.pythonPath.trim() || (process.platform === 'win32' ? 'python' : 'python3');
    return { command: python, args: ['-u', WORKER_FILE] };
  }

  private workerEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
    const hf = this.opts.secret(BILISCRIPT_SECRETS.hfToken).trim();
    if (hf) env.HF_TOKEN = hf;
    if (this.cfg.hfEndpoint.trim()) env.HF_ENDPOINT = this.cfg.hfEndpoint.trim();
    const cookie = this.opts.secret(BILISCRIPT_SECRETS.biliCookie).trim();
    if (cookie) env.BILISCRIPT_COOKIE = cookie;
    return env;
  }

  /** Spawns the worker for one job and resolves with its transcript. */
  private runWorker(job: JobRecord, dir: string, abort: AbortController): Promise<WorkerTranscript> {
    const cfg = this.cfg;
    const jobFile = join(dir, 'job.json');
    writeFileSync(
      jobFile,
      JSON.stringify(
        {
          url: job.url,
          outDir: dir,
          keepAudio: cfg.keepAudio,
          asr: cfg.asr,
          diarization: {
            enabled: cfg.diarization.enabled,
            model: cfg.diarization.model,
            device: cfg.asr.device,
            num_speakers: job.speakers.num,
            min_speakers: job.speakers.min,
            max_speakers: job.speakers.max,
          },
        },
        null,
        1,
      ),
    );
    const { command, args } = this.workerCommand();
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args, 'run', jobFile], { env: this.workerEnv(), windowsHide: true });
      if (this.running) this.running.child = child;
      let stdoutBuf = '';
      let stderr = '';
      let result: { transcript?: string; error?: string } = {};
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdoutBuf += chunk;
        let nl: number;
        while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          if (line) result = { ...result, ...this.onWorkerLine(job, line) };
        }
      });
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS * 4);
      });
      child.on('error', (err) => reject(new Error(this.t.pythonNotFound(command, err.message))));
      child.on('close', (code) => {
        if (existsSync(dir)) writeFileSync(join(dir, 'worker.log'), stderr);
        if (abort.signal.aborted) return reject(new Error('cancelled'));
        if (result.error) return reject(new Error(result.error));
        if (result.transcript && existsSync(result.transcript)) {
          try {
            return resolve(JSON.parse(readFileSync(result.transcript, 'utf8')) as WorkerTranscript);
          } catch (err) {
            return reject(err);
          }
        }
        reject(new Error(this.t.workerExited(code, stderr.trim().slice(-STDERR_TAIL_CHARS))));
      });
    });
  }

  /** Applies one NDJSON line of worker output to the job record. */
  private onWorkerLine(job: JobRecord, line: string): { transcript?: string; error?: string } {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return {};
    }
    switch (msg.kind) {
      case 'stage':
        job.stage = String(msg.stage);
        job.progress = undefined;
        this.save();
        return {};
      case 'progress':
        job.progress = { done: Number(msg.done) || 0, total: Number(msg.total) || 0 };
        return {};
      case 'video':
        job.title = String(msg.video?.title ?? '') || undefined;
        this.save();
        return {};
      case 'device':
        if (msg.stage === 'asr' || msg.stage === 'diarization') {
          job.devices = { ...job.devices, [msg.stage]: String(msg.device) };
          this.save();
        }
        return {};
      case 'notice':
        job.notices = [...(job.notices ?? []), String(msg.message)];
        this.save();
        return {};
      case 'done':
        return { transcript: String(msg.transcript) };
      case 'error':
        return { error: `${msg.code}: ${msg.message}` };
      default:
        return {};
    }
  }

  // ---------------------------------------------------------------- writer

  private reportUsage(usage: LLMUsage, model: string, charges?: readonly Charge[]): void {
    this.host?.reportUsage(usage, { model, label: BILISCRIPT_ID, ...(charges?.length ? { charges: [...charges] } : {}) });
  }

  /** The writer model for the configured mode: null in bot mode; throws with the reason when it cannot be opened. */
  private writerClient(): ChatClient | null {
    const w = this.cfg.writer;
    if (w.mode === 'deployment') {
      return openDeploymentModel({
        botDir: this.opts.botDir,
        repoRoot: this.opts.repoRoot,
        providersDirs: this.opts.providersDirs,
        log: this.host!.log,
        onUsage: (usage, model, charges) => this.reportUsage(usage, model, charges),
      });
    }
    if (w.mode !== 'endpoint') return null;
    if (!w.baseUrl.trim() || !w.model.trim()) throw new Error(this.t.writerUnset);
    const model = w.model.trim();
    return createChatClient({
      protocol: w.protocol,
      baseUrl: w.baseUrl.trim(),
      model,
      apiKey: this.opts.secret(BILISCRIPT_SECRETS.llmApiKey).trim(),
      maxTokens: w.maxTokens,
      timeoutMs: w.timeoutSec * 1000,
      onUsage: (usage) => this.reportUsage(usage, model),
    });
  }

  /** Names speakers and corrects text in place with the writer model. Returns notes for the finished event. */
  private async applyWriter(job: JobRecord, script: Script, signal: AbortSignal): Promise<string[]> {
    const t = this.t;
    if (!script.lines.length) return [];
    let client: ChatClient | null;
    try {
      client = this.writerClient();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return [reason === t.writerUnset ? reason : t.writerFailed(reason)];
    }
    if (!client) return [];
    const notes: string[] = [];
    job.stage = 'naming';
    this.save();
    try {
      const naming = await nameSpeakers(client, script.video, script.speakers, script.lines, signal);
      for (const [label, name] of Object.entries(naming.names)) {
        script.names[label] = name;
        script.nameSource[label] = 'model';
      }
      Object.assign(script.evidence, naming.evidence);
    } catch (err) {
      notes.push(t.writerFailed(err instanceof Error ? err.message : String(err)));
    }
    if (this.cfg.writer.polish && !signal.aborted) {
      job.stage = 'polish';
      this.save();
      const polished = await polishLines(client, script.video, script.lines, signal);
      let changed = 0;
      for (const [i, text] of polished.texts) {
        const l = script.lines[i];
        if (text !== l.text) {
          l.asrText = l.text;
          l.text = text;
          changed++;
        }
      }
      if (changed) notes.push(t.polished(changed, client.model));
      if (polished.failures.length) notes.push(t.polishFailures(polished.failures.join('; ')));
    }
    return notes;
  }

  // ---------------------------------------------------------------- events

  private async pushFinished(job: JobRecord, script: Script, md: string, notes: string[]): Promise<void> {
    const t = this.t;
    const duration = clock(script.video.durationSec ?? script.lines.at(-1)?.end ?? 0);
    const preview: string[] = [];
    let size = 0;
    for (const l of script.lines.slice(0, PREVIEW_LINES)) {
      const row = formatLine(script, l);
      if (size + row.length > PREVIEW_MAX_CHARS) break;
      preview.push(row);
      size += row.length;
    }
    const text = [
      t.finished(job.id, script.video.title || job.ref, job.page, duration, script.lines.length, script.speakers.length),
      this.castLine(script),
      ...(job.devices?.asr ? [t.devices(job.devices.asr, job.devices.diarization ?? null)] : []),
      ...(job.notices ?? []),
      ...notes,
      t.files(md),
      t.opening(preview.length, script.lines.length),
      ...preview,
    ].join('\n');
    await this.host?.pushEvent(
      {
        type: 'biliscript.finished',
        ts: nowIso(this.opts.timezone),
        source: this.id,
        senderKey: this.id,
        text,
        meta: { job: job.id, ref: job.ref, page: job.page, lines: script.lines.length, speakers: script.speakers },
      },
      { trigger: 'flush' },
    );
  }

  private castLine(script: Script): string {
    const t = this.t;
    const counts = lineCounts(script);
    const entries = script.speakers.map((s) => {
      const name = script.names[s];
      const source = script.nameSource[s] === 'model' && script.evidence[s] ? `; ${script.evidence[s]}` : '';
      return name
        ? `${s}=${displayName(script, s)} (${t.linesOf(counts[s] ?? 0)}${source})`
        : `${s} (${t.linesOf(counts[s] ?? 0)}, ${t.unnamed})`;
    });
    return `${t.cast}: ${entries.join(', ')}`;
  }

  // ---------------------------------------------------------------- setup check

  private missingModules(): string[] {
    if (this.setup.kind !== 'ok') return [];
    const m = this.setup.facts.modules;
    const required = this.cfg.diarization.enabled ? [...REQUIRED_MODULES, 'pyannote.audio'] : REQUIRED_MODULES;
    return required.filter((name) => !m[name]);
  }

  private setupText(): string {
    const t = this.t;
    if (this.setup.kind === 'checking') return t.setupChecking;
    if (this.setup.kind === 'error') return t.setupFailed(this.setup.message);
    const missing = this.missingModules();
    return missing.length ? t.setupMissing(this.setup.facts, missing) : t.setupOk(this.setup.facts);
  }

  /** Runs `worker check` once; the result feeds the environment prompt and the WebUI badge. */
  async checkSetup(): Promise<void> {
    const { command, args } = this.workerCommand();
    this.setup = await new Promise<SetupState>((resolve) => {
      let out = '';
      let child: ChildProcess;
      try {
        child = spawn(command, [...args, 'check'], { env: this.workerEnv(), windowsHide: true });
      } catch (err) {
        return resolve({ kind: 'error', message: this.t.pythonNotFound(command, String(err)) });
      }
      const timer = setTimeout(() => child.kill(), 60_000);
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (c: string) => (out += c));
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ kind: 'error', message: this.t.pythonNotFound(command, err.message) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const line = out.split('\n').find((l) => l.includes('"check"'));
        try {
          const msg = JSON.parse(line ?? '');
          resolve({
            kind: 'ok',
            facts: {
              python: String(msg.python),
              modules: msg.modules ?? {},
              gpu: typeof msg.gpu === 'string' ? msg.gpu : null,
              asrDevice: msg.asrDevice === 'cuda' ? 'cuda' : 'cpu',
              diarizationDevice: msg.diarizationDevice === 'cuda' ? 'cuda' : 'cpu',
              problems: Array.isArray(msg.problems) ? msg.problems.map(String) : [],
            },
          });
        } catch {
          resolve({ kind: 'error', message: this.t.workerExited(code, out.trim().slice(-300)) });
        }
      });
    });
  }

  // ---------------------------------------------------------------- storage

  private jobDir(id: number): string {
    return join(this.root, String(id));
  }

  private load(): void {
    if (!existsSync(this.jobsFile)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.jobsFile, 'utf8')) as JobsFile;
      if (Array.isArray(parsed.jobs) && Number.isInteger(parsed.nextId)) this.state = parsed;
    } catch (err) {
      this.host?.log.warn('jobs.json unreadable; starting with an empty job list', { err });
    }
  }

  private save(): void {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(this.jobsFile, JSON.stringify(this.state, null, 1));
  }

  private loadScript(id: number): { job: JobRecord; script: Script } | string {
    const job = this.state.jobs.find((j) => j.id === id);
    if (!job) return this.t.noJob(id);
    const file = join(this.jobDir(id), 'script.json');
    if (job.state !== 'done' || !existsSync(file)) return this.t.notDone(id, job.state);
    return { job, script: JSON.parse(readFileSync(file, 'utf8')) as Script };
  }

  /** Writes script.json and script.md; returns the path of script.md. */
  private writeScript(id: number, script: Script): string {
    const dir = this.jobDir(id);
    const md = join(dir, 'script.md');
    writeFileSync(join(dir, 'script.json'), JSON.stringify(script, null, 1));
    writeFileSync(md, renderMarkdown(script));
    return md;
  }

  private jobLine(j: JobRecord): JobLine {
    const percent =
      j.state === 'running' && j.progress && j.progress.total > 0
        ? Math.min(100, Math.round((j.progress.done / j.progress.total) * 100))
        : undefined;
    return {
      id: j.id,
      state: j.state,
      stage: j.state === 'running' ? j.stage : undefined,
      percent,
      title: j.title,
      ref: j.ref,
      page: j.page,
      error: j.state === 'failed' ? j.error?.message : undefined,
    };
  }
}
