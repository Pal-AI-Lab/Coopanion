/** Tool declarations; `DesktopPetWorld.tools()` binds the handlers. */
import type { ToolDef } from 'cortico/core/types.ts';
import { SCALE_MAX, SCALE_MIN } from './config.ts';

export const DESKTOP_PET_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'pet_say',
    tags: ['speak'],
    description: '在桌宠头顶冒出对话气泡说话。表情和动作写成标记放进 script:【】先做动作再换一个新气泡,<> 打字到那里时做。回执报告大约显示多久;窗口没连接时失败。',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: '要说的话,可夹带【表情,动作】与 <表情> 标记。一个气泡一两句。不想说话就不要调用。' },
      },
      required: ['script'],
    },
  },
  {
    name: 'pet_ask',
    tags: ['speak'],
    description: '冒出一个提问气泡,下面列出最多 3 个选项,默认再加一格让对方自己写。立即返回;对方的回答以 [回答] 事件送达,关掉不答也会送达。新的 pet_say 或 pet_ask 会替换还没回答的提问。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '问题,一句话。' },
        options: { type: 'array', items: { type: 'string' }, maxItems: 3, description: '1–3 个简短选项,每个不超过 40 字。' },
        allowOwnAnswer: { type: 'boolean', description: '是否提供自己写回答的输入格,默认 true。' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'pet_walk_to',
    tags: ['act'],
    description: '沿屏幕底边走(或跑)到某个位置,走到或被打断后返回,最多等 30 秒。',
    parameters: {
      type: 'object',
      properties: {
        to: { description: '目标:0–1 的数字(桌宠所在那块屏幕的宽度比例,0 最左、1 最右),或 left / center / right / cursor(鼠标所在的横向位置)。', anyOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'string', enum: ['left', 'center', 'right', 'cursor'] }] },
        run: { type: 'boolean', description: 'true 跑过去,默认走过去。' },
      },
      required: ['to'],
    },
  },
  {
    name: 'pet_set',
    tags: ['act'],
    description: '改你自己的外观和习惯。figure、scheme、roam、snoreSeconds 直接生效;sound、scale、theme、hoverButtons、user 会先在气泡里问对方,对方同意才改,回执等对方回答后才返回。可选的值见环境说明。只给要改的项。',
    parameters: {
      type: 'object',
      properties: {
        figure: { type: 'string', description: '形象:coo,或已装形象的 id。换成形象包时不给 scheme 就用它的第一套。' },
        scheme: { type: 'string', description: '当前(或这次换上的)形象的打扮:预设 id,或各项选项按顺序用 - 连起来(Coo 是配色-头顶-耳侧-眼镜-颈饰)。' },
        roam: { type: 'string', enum: ['free', 'calm', 'off'], description: '平时走动:free 常走动,calm 多待着,off 不乱动。' },
        snoreSeconds: { type: 'integer', minimum: 0, maximum: 3600, description: '每次睡着打多少秒呼噜,0 一直打到醒。' },
        sound: { type: 'boolean', description: '音效开关(先问对方)。' },
        scale: { type: 'number', minimum: SCALE_MIN, maximum: SCALE_MAX, description: '在屏幕上的大小,1 是默认(先问对方)。' },
        theme: { type: 'string', enum: ['dark', 'light'], description: 'dark 夜间(浅色身体),light 白天(深色身体)(先问对方)。' },
        hoverButtons: { type: 'array', items: { type: 'string', enum: ['chat', 'voice', 'roam', 'theme', 'sound', 'dress', 'hide'] }, maxItems: 6, description: '鼠标停在你身上时旁边的按钮(先问对方)。' },
        user: { type: 'string', maxLength: 20, description: '你对对方的称呼(先问对方)。' },
      },
    },
  },
  {
    name: 'pet_quiet',
    tags: ['act'],
    description: '临时安静一会儿:默认关掉音效、站着不乱走,到时间自动恢复,设置不变。对方这期间自己改了音效或走动,就按对方的来并提前结束。minutes 给 0 立即结束。',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', minimum: 0, maximum: 1440, description: '安静多少分钟。' },
        sound: { type: 'boolean', description: '这期间要不要音效,默认 false。' },
        roam: { type: 'string', enum: ['off', 'calm'], description: '这期间的走动,默认 off。' },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'pet_act',
    tags: ['act'],
    description: '不说话,依次做一串表情或动作(当前形象的词表见环境说明)。立即返回;标着「保持到下一个动作」的会一直保持。',
    parameters: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6, description: '表情或动作的词,按顺序执行。' },
      },
      required: ['actions'],
    },
  },
];
