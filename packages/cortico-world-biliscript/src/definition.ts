import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { BILISCRIPT_DEFAULTS, BILISCRIPT_ID, type BiliScriptConfigSection } from './config.ts';
import { BILISCRIPT_TOOL_DECLS, BiliScriptWorld } from './world.ts';

export const BILISCRIPT: WorldDefinition<BiliScriptConfigSection> = {
  id: BILISCRIPT_ID,
  label: 'Bilibili Script',
  defaults: () => structuredClone(BILISCRIPT_DEFAULTS),
  create: (ctx) =>
    new BiliScriptWorld({
      cfg: ctx.cfg,
      timezone: ctx.timezone,
      dataDir: ctx.dataDir,
      botDir: ctx.botDir,
      repoRoot: ctx.repoRoot,
      secret: (name) => ctx.secret(name),
    }),
  describe: {
    tools: describeTools(BILISCRIPT_TOOL_DECLS, {
      biliscript_transcribe: {
        zh: '把一个 B 站视频的对话转写成区分说话人的剧本,在后台排队进行。',
        en: 'Transcribes the dialogue of a bilibili video into a script with speakers separated, queued in the background.',
      },
      biliscript_jobs: { zh: '列出转写任务的状态与进度。', en: 'Lists transcription jobs with state and progress.' },
      biliscript_read: { zh: '分页读取剧本台词。', en: 'Reads script lines page by page.' },
      biliscript_name_speakers: {
        zh: '给说话人标签起人物名并重写剧本文件。',
        en: 'Gives speaker labels character names and rewrites the script file.',
      },
      biliscript_cancel: { zh: '取消排队中或进行中的任务。', en: 'Cancels a queued or running job.' },
    }),
    events: [
      {
        type: 'biliscript.finished',
        description: { zh: '一个转写任务完成,附人物表与开头几句。', en: 'A transcription job finished, with the cast and the opening lines.' },
        trigger: 'flush',
      },
      {
        type: 'biliscript.failed',
        description: { zh: '一个转写任务失败,附失败阶段与原因。', en: 'A transcription job failed, with the stage and the reason.' },
        trigger: 'flush',
      },
    ],
  },
};
