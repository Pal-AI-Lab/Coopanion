/** Tool declarations; `DesktopPetWorld.tools()` binds the handlers. */
import type { ToolDef } from 'cortico/core/types.ts';

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
    name: 'pet_act',
    tags: ['act'],
    description: '不说话,依次做一串表情或动作(词表见环境说明)。立即返回;sit 和 sleep 会一直保持到下一个动作。',
    parameters: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6, description: '表情或动作的词,按顺序执行。' },
      },
      required: ['actions'],
    },
  },
];
