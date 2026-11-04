/**
 * What the bot reads from this World (events, receipts, environment prompt values), in Chinese and
 * in English; `en: typeof zh` keeps the keys and signatures the same. The language follows the
 * process language (`systemLanguage()`): Chinese for zh and zh-Hant, English otherwise.
 * Transcript text goes into these lines as recognized.
 */
import { baseLanguage, systemLanguage } from 'cortico/core/language.ts';

export type ModelLanguage = 'zh' | 'en';

/** What `biliscript_worker.py check` reports. */
export interface SetupFacts {
  python: string;
  modules: Record<string, string | null>;
  /** First GPU nvidia-smi lists; null without one. */
  gpu: string | null;
  asrDevice: 'cuda' | 'cpu';
  diarizationDevice: 'cuda' | 'cpu';
  /** Why a present GPU goes unused, in English. */
  problems: string[];
}

export interface JobLine {
  id: number;
  state: string;
  stage?: string;
  percent?: number;
  title?: string;
  ref: string;
  page: number;
  error?: string;
}

const zh = {
  queued: (id: number, ahead: number) =>
    `#${id} 已排队${ahead > 0 ? `,前面还有 ${ahead} 个任务` : ',马上开始'}。完成时推送 biliscript.finished,失败时推送 biliscript.failed。`,
  badVideo: (input: string) => `「${input}」里没有 BV 号、av 号或 B 站视频链接。`,
  shortLinkFailed: (input: string, reason: string) => `短链接 ${input} 解析失败:${reason}`,
  noJob: (id: number) => `没有 #${id} 这个任务。`,
  notDone: (id: number, state: string) => `#${id} 还没有剧本(状态:${state})。`,
  noJobs: '还没有任务。',
  jobLine: (j: JobLine) =>
    `#${j.id} ${j.title ? `《${j.title}》` : j.ref}${j.page > 1 ? ` P${j.page}` : ''}:${STATE_ZH[j.state] ?? j.state}` +
    (j.stage ? `,${STAGE_ZH[j.stage] ?? j.stage}${j.percent !== undefined ? ` ${j.percent}%` : ''}` : '') +
    (j.error ? `。${j.error}` : ''),
  cancelled: (id: number) => `#${id} 已取消。`,
  cannotCancel: (id: number, state: string) => `#${id} 已经${STATE_ZH[state] ?? state},无法取消。`,
  readHeader: (id: number, from: number, to: number, total: number) => `#${id} 第 ${from}-${to} 句,共 ${total} 句:`,
  readEnd: (id: number, total: number) => `#${id} 共 ${total} 句,没有更多了。`,
  readMore: (next: number) => `(下一页从第 ${next} 句开始)`,
  unknownSpeakers: (labels: string) => `不认识的说话人标签:${labels}。`,
  named: (id: number, cast: string, file: string) => `#${id} 的人物已更新:${cast}。剧本:${file}`,
  finished: (id: number, title: string, page: number, duration: string, lines: number, speakers: number) =>
    `#${id}《${title}》${page > 1 ? ` P${page}` : ''} 转写完成:时长 ${duration},${lines} 句,${speakers} 位说话人。`,
  cast: '人物',
  linesOf: (n: number) => `${n} 句`,
  unnamed: '未命名',
  namedBy: (model: string) => `由 ${model} 根据台词命名`,
  polished: (n: number, model: string) => `${model} 修订了 ${n} 句的文字,识别原文在 script.json。`,
  polishFailures: (list: string) => `部分修订请求失败,这些句子保留识别原文:${list}`,
  writerFailed: (reason: string) => `命名模型调用失败,说话人保持标签:${reason}`,
  writerUnset: '人物命名设为 endpoint,但模型服务地址或模型名没有配置,说话人保持标签。',
  files: (md: string) => `剧本文件:${md}`,
  opening: (n: number, total: number) => (n < total ? `开头 ${n} 句:` : '全部台词:'),
  failed: (id: number, ref: string, stage: string, message: string) =>
    `#${id} ${ref} 在${STAGE_ZH[stage] ?? stage}阶段失败:${message}`,
  devices: (asr: string, diarization: string | null) =>
    `运行设备:语音识别 ${asr}${diarization ? `,说话人区分 ${diarization}` : ''}。`,
  workerExited: (code: number | null, tail: string) => `转写进程退出(代码 ${code ?? '无'}),没有给出结果。${tail ? `最后的输出:\n${tail}` : ''}`,
  restarted: '进程重启时任务被中断。',
  pythonNotFound: (cmd: string, reason: string) => `无法启动 Python(${cmd}):${reason}`,
  setupChecking: '正在检查 Python 环境。',
  setupOk: (f: SetupFacts) =>
    `Python ${f.python},${Object.entries(f.modules).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(',')}。` +
    `语音识别在${DEVICE_ZH(f.asrDevice, f.gpu)}上运行,说话人区分在${DEVICE_ZH(f.diarizationDevice, f.gpu)}上运行` +
    `${f.asrDevice === 'cpu' ? ',CPU 上转写一个视频要比视频本身长得多' : ''}。` +
    (f.problems.length ? `检查发现:${f.problems.join(';')}。` : ''),
  setupMissing: (f: SetupFacts, missing: string[]) =>
    `Python ${f.python} 缺少 ${missing.join('、')},转写会失败,需要操作者在这个 Python 里安装 python/requirements.txt。`,
  setupFailed: (reason: string) => `Python 环境检查失败:${reason}。转写会失败,需要操作者在设置里修改 Python 路径。`,
  writerBot: '转写完成后说话人只有 S1、S2 这样的标签,人物名由你判断。',
  writerDeployment: '转写完成后,这个 World 用你当前所用的模型推断人物名、修订错字,依据写在事件里;你可以覆盖它给的名字。',
  writerEndpoint: (model: string) => `转写完成后由 ${model} 推断人物名并修订错字;你可以覆盖它给的名字。`,
};

const DEVICE_ZH = (device: 'cuda' | 'cpu', gpu: string | null): string =>
  device === 'cuda' ? ` GPU(${gpu ?? 'CUDA'})` : ' CPU ';

const STATE_ZH: Record<string, string> = { queued: '排队中', running: '进行中', done: '完成', failed: '失败', cancelled: '取消' };
const STAGE_ZH: Record<string, string> = {
  start: '启动', download: '下载音频', decode: '解码', asr: '语音识别', diarization: '区分说话人', align: '对齐',
  naming: '人物命名', polish: '修订文字',
};

const en: typeof zh = {
  queued: (id, ahead) =>
    `#${id} queued${ahead > 0 ? ` behind ${ahead} job${ahead > 1 ? 's' : ''}` : '; starting now'}. biliscript.finished arrives when it completes, biliscript.failed if it fails.`,
  badVideo: (input) => `"${input}" holds no BV id, av id or bilibili video link.`,
  shortLinkFailed: (input, reason) => `Could not resolve the short link ${input}: ${reason}`,
  noJob: (id) => `There is no job #${id}.`,
  notDone: (id, state) => `#${id} has no script yet (state: ${state}).`,
  noJobs: 'No jobs yet.',
  jobLine: (j) =>
    `#${j.id} ${j.title ? `"${j.title}"` : j.ref}${j.page > 1 ? ` P${j.page}` : ''}: ${j.state}` +
    (j.stage ? `, ${j.stage}${j.percent !== undefined ? ` ${j.percent}%` : ''}` : '') +
    (j.error ? `. ${j.error}` : ''),
  cancelled: (id) => `#${id} cancelled.`,
  cannotCancel: (id, state) => `#${id} is already ${state} and cannot be cancelled.`,
  readHeader: (id, from, to, total) => `#${id} lines ${from}-${to} of ${total}:`,
  readEnd: (id, total) => `#${id} has ${total} lines; there are no more.`,
  readMore: (next) => `(next page starts at line ${next})`,
  unknownSpeakers: (labels) => `Unknown speaker labels: ${labels}.`,
  named: (id, cast, file) => `Cast of #${id} updated: ${cast}. Script: ${file}`,
  finished: (id, title, page, duration, lines, speakers) =>
    `#${id} "${title}"${page > 1 ? ` P${page}` : ''} transcribed: ${duration}, ${lines} lines, ${speakers} speaker${speakers === 1 ? '' : 's'}.`,
  cast: 'Cast',
  linesOf: (n) => `${n} lines`,
  unnamed: 'unnamed',
  namedBy: (model) => `named by ${model} from the dialogue`,
  polished: (n, model) => `${model} corrected the text of ${n} lines; the recognized text is in script.json.`,
  polishFailures: (list) => `Some correction requests failed; those lines keep the recognized text: ${list}`,
  writerFailed: (reason) => `The naming model failed; speakers keep their labels: ${reason}`,
  writerUnset: 'Character naming is set to endpoint but the model service URL or model is not configured; speakers keep their labels.',
  files: (md) => `Script file: ${md}`,
  opening: (n, total) => (n < total ? `First ${n} lines:` : 'All lines:'),
  failed: (id, ref, stage, message) => `#${id} ${ref} failed during ${stage}: ${message}`,
  devices: (asr, diarization) => `Devices: speech recognition ${asr}${diarization ? `, speaker separation ${diarization}` : ''}.`,
  workerExited: (code, tail) => `The transcription process exited (code ${code ?? 'none'}) without a result.${tail ? ` Last output:\n${tail}` : ''}`,
  restarted: 'The job was interrupted by a process restart.',
  pythonNotFound: (cmd, reason) => `Cannot start Python (${cmd}): ${reason}`,
  setupChecking: 'The Python environment is being checked.',
  setupOk: (f) =>
    `Python ${f.python}, ${Object.entries(f.modules).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}. ` +
    `Speech recognition runs on ${f.asrDevice === 'cuda' ? `the GPU (${f.gpu ?? 'CUDA'})` : 'the CPU'}, ` +
    `speaker separation on ${f.diarizationDevice === 'cuda' ? `the GPU (${f.gpu ?? 'CUDA'})` : 'the CPU'}` +
    `${f.asrDevice === 'cpu' ? '; on the CPU a video takes much longer to transcribe than it lasts' : ''}.` +
    (f.problems.length ? ` The check found: ${f.problems.join('; ')}.` : ''),
  setupMissing: (f, missing) =>
    `Python ${f.python} lacks ${missing.join(', ')}; transcription will fail until the operator installs python/requirements.txt into this Python.`,
  setupFailed: (reason) => `The Python environment check failed: ${reason}. Transcription will fail until the operator fixes the Python path in the settings.`,
  writerBot: 'Finished scripts label speakers S1, S2, ...; naming the characters is up to you.',
  writerDeployment:
    'Finished scripts get character names and text corrections from the model you are running on, with its evidence in the event; you can override its names.',
  writerEndpoint: (model) => `Finished scripts get character names and text corrections from ${model}; you can override its names.`,
};

export function modelLanguage(): ModelLanguage {
  return baseLanguage(systemLanguage());
}

export function modelText(language: ModelLanguage = modelLanguage()): typeof zh {
  return language === 'zh' ? zh : en;
}
