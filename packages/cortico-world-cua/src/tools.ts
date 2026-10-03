/** Tool declarations; `CuaWorld.tools()` binds the handlers. Coordinates are screenshot pixels. */
import type { ToolDef } from 'cortico/core/types.ts';

const shot = { type: 'boolean', description: '做完后是否附一张截图;缺省按配置(默认附)。连着做几步时可以只在最后一步要截图。' };
const xy = {
  x: { type: 'integer', minimum: 0, description: '横坐标,最近一张截图的像素' },
  y: { type: 'integer', minimum: 0, description: '纵坐标,最近一张截图的像素' },
};

export const CUA_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'cua_screenshot',
    tags: ['read', 'snapshot'],
    description: '截取主屏幕,返回缩放后的图片(画上了鼠标指针)、屏幕与截图尺寸、指针位置和前台窗口标题。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cua_click',
    tags: ['act'],
    description: '把鼠标移到 (x, y) 并点击。',
    parameters: {
      type: 'object',
      properties: {
        ...xy,
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: '默认 left' },
        clicks: { type: 'integer', minimum: 1, maximum: 3, description: '1 单击(默认),2 双击,3 三击' },
        screenshot: shot,
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'cua_move',
    tags: ['act'],
    description: '只移动鼠标到 (x, y),不点击;用于悬停出提示或菜单。',
    parameters: { type: 'object', properties: { ...xy, screenshot: shot }, required: ['x', 'y'] },
  },
  {
    name: 'cua_drag',
    tags: ['act'],
    description: '按住左键从 from 拖到 to 再松开。',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2, description: '[x, y] 起点' },
        to: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2, description: '[x, y] 终点' },
        screenshot: shot,
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'cua_scroll',
    tags: ['act'],
    description: '把鼠标移到 (x, y) 转动滚轮。down 为正向下、为负向上;right 为正向右。单位是滚轮格。',
    parameters: {
      type: 'object',
      properties: {
        ...xy,
        down: { type: 'integer', minimum: -30, maximum: 30 },
        right: { type: 'integer', minimum: -30, maximum: 30 },
        screenshot: shot,
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'cua_type',
    tags: ['act'],
    description: '在当前输入焦点处打字(任何语言,与输入法状态无关);\\n 会按一次回车。先点击要输入的地方。',
    parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 }, screenshot: shot }, required: ['text'] },
  },
  {
    name: 'cua_key',
    tags: ['act'],
    description: '按键或组合键。用 + 连接同时按的键,用空格分隔先后:"ctrl+s"、"alt+f4"、"ctrl+a delete"、"enter"、"win"。',
    parameters: { type: 'object', properties: { keys: { type: 'string' }, screenshot: shot }, required: ['keys'] },
  },
  {
    name: 'cua_windows',
    tags: ['read'],
    description: '列出可见的顶层窗口:标题、位置(截图坐标)、是否最小化、哪个在前台。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cua_focus',
    tags: ['act'],
    description: '把一个窗口切到前台(最小化的先还原)。window 是 cua_windows 给的句柄,或标题里的一段文字。',
    parameters: { type: 'object', properties: { window: { type: 'string' }, screenshot: shot }, required: ['window'] },
  },
  {
    name: 'cua_wait',
    tags: ['read'],
    description: '等待若干秒(最多 30)让界面加载,然后截图。等待不用使用者同意;这一轮还没允许看屏幕时只等不截图。',
    parameters: { type: 'object', properties: { seconds: { type: 'number', minimum: 0, maximum: 30 } }, required: ['seconds'] },
  },
];
