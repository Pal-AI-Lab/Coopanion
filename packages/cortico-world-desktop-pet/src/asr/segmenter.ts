/**
 * 把连续的麦克风流切成一句一句,再把识别结果打包成一条投递。
 *
 * 两级都是纯逻辑(不碰声卡、不碰网络),因为这两处的判据全是可调参数,而参数调
 * 得对不对只有拿录音的形状去验才说得清。
 *
 * **切分**(Segmenter):能量门限 + 起说时长 + 收尾静音 的状态机。语音识别的输入
 * 单位是"一句",而声卡给的是每 20ms 一帧;中间这一层决定"哪一段值得送去识别"。
 * 门限之前那几帧要带上(preRoll)——人开口的第一个字总是先于能量越线的那一刻。
 *
 * 静音这一侧是**两级门限**,分开的是两件不同的事:
 *
 * - `dispatchSilenceMs`(短,送去转写):停这么久就把手上这段交出去。转写在显卡档
 *   要 ~200ms 且与音频长短几乎无关(0.5s 音频 157ms / 7s 音频 285ms,本机 large-v3
 *   实测),所以早交出去 = 那 200ms 挪进静音窗里跑,而不是排在它后面。
 * - `silenceMs`(长,这一段真的说完了):在它到点之前,`settleRemainingMs` 一直报"还
 *   没完",打包层据此继续持有。人在窗口里接着说,后半段照旧接上,两半并成一条——
 *   所以短门限不会把句子切碎,它只把**转写**提前,不把**发车**提前。
 *
 * Packer 按 minChars 过滤识别结果，在上游完成收音、转写和收尾静音后拼接投递。
 */

import { joinSpeech, type TranscribeResult } from './result.ts';

/** 一句:16-bit 单声道 PCM,附上它在流里的位置 */
export interface Utterance {
  pcm: Int16Array;
  /** 相对于采集开始的毫秒数 */
  startMs: number;
  durationMs: number;
  /** 因为说得太长被强切的,而不是自然收尾的 */
  forced: boolean;
  /** 边说边识别的引擎已经在听这一句:它的识别结果,不必再整句送一遍 */
  result?: Promise<TranscribeResult>;
}

/**
 * 边说边识别的引擎从这里接音频:一句开头(连同门限之前那几帧)、之后的每一帧、这一句收尾。
 * 切句的判据不变,它只是早一点拿到同样的帧。
 */
export interface SegmentSink {
  begin(frames: Int16Array[]): void;
  frame(frame: Int16Array): void;
  /** `kept` 为 false:太短、不算一句。返回的结果挂到这一句的 `result` 上 */
  end(kept: boolean): Promise<TranscribeResult> | undefined;
}

export interface SegmentConfig {
  /** 判为"有人在说"的电平门槛(dBFS)。安静房间的底噪常在 -60 上下 */
  thresholdDb: number;
  /** 连续超过门槛多久才算开口(ms):咳嗽、键盘、鼠标点击挡在这一关 */
  minSpeechMs: number;
  /**
   * 静音多久就把手上这段送去转写(ms)。短于 `silenceMs` 的那一级门限:交得早,
   * 转写就跑在静音窗里而不是排在它后面。人接着说的话后半段照旧接上,由打包层并回
   * 一条,所以这里给短不会把句子切成两半。给到 `silenceMs` 及以上就退回单级门限。
   */
  dispatchSilenceMs: number;
  /** 说完之后静音多久算一句结束(ms):打包层据此决定发不发车 */
  silenceMs: number;
  /** 一句最长多久强切(ms):她不能等一个人讲完五分钟才听见第一个字 */
  maxUtteranceMs: number;
  /** 触发点往前多带一段(ms) */
  preRollMs: number;
  /** 短于这个的片段直接丢(ms):门限抖动出来的碎片不值得送去识别 */
  minUtteranceMs: number;
}

/** 一帧的均方根电平(dBFS);全零帧记 -100 而不是 -Infinity */
export function rmsDb(frame: Int16Array): number {
  if (frame.length === 0) return -100;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] / 32768;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / frame.length);
  return rms <= 1e-5 ? -100 : Math.max(-100, 20 * Math.log10(rms));
}

function concat(frames: Int16Array[]): Int16Array {
  let total = 0;
  for (const f of frames) total += f.length;
  const out = new Int16Array(total);
  let at = 0;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}

export class Segmenter {
  private cfg: SegmentConfig;
  private readonly frameMs: number;
  /** 门限之前的那几帧,长度按 preRollMs 截 */
  private preRoll: Int16Array[] = [];
  private collected: Int16Array[] = [];
  private speaking = false;
  private aboveMs = 0;
  private belowMs = 0;
  private elapsedMs = 0;
  private startMs = 0;
  private lastDb = -100;
  private sink: SegmentSink | null = null;

  constructor(cfg: SegmentConfig, frameMs: number) {
    this.cfg = cfg;
    this.frameMs = frameMs;
  }

  /** 边说边识别的引擎;null = 只在收尾时交整句 */
  setSink(sink: SegmentSink | null): void {
    this.sink = sink;
  }

  /** 热改:门槛与时长随时可调,不打断正在收的这一句 */
  configure(cfg: SegmentConfig): void {
    this.cfg = cfg;
  }

  /** 最近一帧的电平(dBFS);面板的电平条读它 */
  get level(): number {
    return this.lastDb;
  }

  /** 此刻是否正在收一句 */
  get active(): boolean {
    return this.speaking;
  }

  /**
   * 距"这一段真的说完了"还差多少毫秒;0 = 已经过了收尾静音,或此刻无话可等。
   *
   * 短门限把音频交出去之后,人还有 `silenceMs - dispatchSilenceMs` 的窗口可以接着说。
   * 打包层拿这个数决定继续持有还是发车——**转写提前,发车不提前**,靠的就是这一条。
   * 起说判定中(能量已越线、还不够 `minSpeechMs`)同样算"没说完":那 180ms 里既不
   * `active` 也没在攒静音,不报出来就会在这个缝里把前半句先送走。
   */
  get settleRemainingMs(): number {
    if (this.speaking) return 0; // 还在说,由 active 挡着
    if (this.aboveMs > 0) return Math.max(0, this.cfg.minSpeechMs - this.aboveMs);
    if (this.belowMs === 0) return 0;
    return Math.max(0, this.cfg.silenceMs - this.belowMs);
  }

  /** 喂一帧,拿回这一帧结束时切出来的句子(通常是空的) */
  push(frame: Int16Array): Utterance[] {
    const db = rmsDb(frame);
    this.lastDb = db;
    this.elapsedMs += this.frameMs;
    const loud = db >= this.cfg.thresholdDb;
    const out: Utterance[] = [];

    if (!this.speaking) {
      this.preRoll.push(frame);
      const keep = Math.max(1, Math.ceil(this.cfg.preRollMs / this.frameMs));
      while (this.preRoll.length > keep) this.preRoll.shift();
      this.aboveMs = loud ? this.aboveMs + this.frameMs : 0;
      // 交出去之后这条静音接着数:长门限没到之前,打包层还得替这一段留着位子。
      // 封顶在长门限上,免得安静一整天把这个数攒成天文数字。
      this.belowMs = loud ? 0 : Math.min(this.belowMs + this.frameMs, this.cfg.silenceMs);
      if (this.aboveMs >= this.cfg.minSpeechMs) {
        this.speaking = true;
        this.belowMs = 0;
        this.collected = [...this.preRoll];
        this.startMs = this.elapsedMs - this.collected.length * this.frameMs;
        this.preRoll = [];
        this.sink?.begin(this.collected);
      }
      return out;
    }

    this.collected.push(frame);
    this.sink?.frame(frame);
    this.belowMs = loud ? 0 : this.belowMs + this.frameMs;
    const heldMs = this.collected.length * this.frameMs;
    // 短门限交货;长门限那一半留给 settleRemainingMs,不在这里挡。给反了(短的比长的
    // 还长)就退回单级,以长的为准。
    const dispatchMs = Math.min(this.cfg.dispatchSilenceMs, this.cfg.silenceMs);
    if (this.belowMs >= dispatchMs) {
      // belowMs 不清零:这条静音还要接着数到 silenceMs
      const done = this.finish(false);
      if (done) out.push(done);
    } else if (heldMs >= this.cfg.maxUtteranceMs) {
      // 强切之后照旧在"说话中":人还没停,下一段接着收
      const done = this.finish(true);
      if (done) out.push(done);
      this.speaking = true;
      this.collected = [];
      this.startMs = this.elapsedMs;
      this.belowMs = 0;
      this.sink?.begin([]);
    }
    return out;
  }

  /** 停止采集时把手上这半句交出来(够长的话) */
  flush(): Utterance | null {
    const tail = this.speaking ? this.finish(false) : null;
    // 不收音了就没有"还没说完"这回事:留着计数会让打包层永远等一个不再来的帧
    this.aboveMs = 0;
    this.belowMs = 0;
    return tail;
  }

  private finish(forced: boolean): Utterance | null {
    const frames = this.collected;
    this.collected = [];
    this.speaking = false;
    this.aboveMs = 0;
    const durationMs = frames.length * this.frameMs;
    const kept = durationMs >= this.cfg.minUtteranceMs;
    const result = this.sink?.end(kept);
    if (!kept) return null;
    return { pcm: concat(frames), startMs: this.startMs, durationMs, forced, ...(result ? { result } : {}) };
  }
}

// ---------------------------------------------------------------------------

export interface PackConfig {
  /** 少于这么多字的识别结果丢掉:噪声与语气词识别出来常是一两个字 */
  minChars: number;
}

/** 上游仍在收音、转写或等待收尾静音时持有识别结果；结束后将它们拼成一条。 */
export class Packer {
  private readonly cfg: PackConfig;
  private pieces: string[] = [];

  constructor(cfg: PackConfig) {
    this.cfg = cfg;
  }

  get pending(): boolean {
    return this.pieces.length > 0;
  }

  /** 太短的直接丢,返回 false 表示这句没被收下 */
  add(text: string): boolean {
    const t = text.trim();
    if (t.length < this.cfg.minChars) return false;
    this.pieces.push(t);
    return true;
  }

  due(hold = false): string | null {
    return hold ? null : this.take();
  }

  /** 停止采集或立即投递时取走已收下的结果。 */
  take(): string | null {
    if (this.pieces.length === 0) return null;
    const text = joinSpeech(this.pieces);
    this.pieces = [];
    return text;
  }
}
