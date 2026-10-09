/**
 * Tool declarations; `CuaWorld.tools()` binds the handlers. Coordinates are screenshot pixels.
 * Descriptions are English whatever the model-text language.
 */
import type { ToolDef } from 'cortico/core/types.ts';

const shot = { type: 'boolean', description: 'Attach a screenshot afterwards; defaults to the configuration (attach). When doing several steps in a row, ask for one on the last step only.' };
const xy = {
  x: { type: 'integer', minimum: 0, description: 'Horizontal position, in pixels of the latest screenshot' },
  y: { type: 'integer', minimum: 0, description: 'Vertical position, in pixels of the latest screenshot' },
};

export const CUA_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'cua_screenshot',
    tags: ['read', 'snapshot'],
    description: 'Capture the main screen. Returns the scaled image (with the mouse pointer drawn on it), the screen and screenshot sizes, the pointer position and the title of the foreground window.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cua_click',
    tags: ['act'],
    description: 'Move the mouse to (x, y) and click.',
    parameters: {
      type: 'object',
      properties: {
        ...xy,
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Default left' },
        clicks: { type: 'integer', minimum: 1, maximum: 3, description: '1 single click (default), 2 double click, 3 triple click' },
        screenshot: shot,
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'cua_move',
    tags: ['act'],
    description: 'Only move the mouse to (x, y), without clicking; for hovering to bring up a tooltip or a menu.',
    parameters: { type: 'object', properties: { ...xy, screenshot: shot }, required: ['x', 'y'] },
  },
  {
    name: 'cua_drag',
    tags: ['act'],
    description: 'Hold the left button down, drag from `from` to `to`, and release.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2, description: '[x, y] start' },
        to: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2, description: '[x, y] end' },
        screenshot: shot,
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'cua_scroll',
    tags: ['act'],
    description: 'Move the mouse to (x, y) and turn the wheel. Positive down scrolls down, negative up; positive right scrolls right. Units are wheel notches.',
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
    description: 'Type text at the current input focus (any language, whatever state the input method is in); \\n presses Enter once. Click where the text goes first.',
    parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 }, screenshot: shot }, required: ['text'] },
  },
  {
    name: 'cua_key',
    tags: ['act'],
    description: 'Press a key or a key combination. Join keys pressed together with +, and separate keys pressed one after another with spaces: "ctrl+s", "alt+f4", "ctrl+a delete", "enter", "win".',
    parameters: { type: 'object', properties: { keys: { type: 'string' }, screenshot: shot }, required: ['keys'] },
  },
  {
    name: 'cua_windows',
    tags: ['read'],
    description: 'List the visible top-level windows: title, position (screenshot coordinates), whether minimized, and which one is in the foreground.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cua_focus',
    tags: ['act'],
    description: 'Bring a window to the foreground (restoring it first if minimized). window is a handle from cua_windows, or part of its title.',
    parameters: { type: 'object', properties: { window: { type: 'string' }, screenshot: shot }, required: ['window'] },
  },
  {
    name: 'cua_wait',
    tags: ['read'],
    description: 'Wait a number of seconds (30 at most) for the screen to load, then take a screenshot. Waiting needs no permission from the person; while looking at the screen is not yet allowed this turn, it waits without a screenshot.',
    parameters: { type: 'object', properties: { seconds: { type: 'number', minimum: 0, maximum: 30 } }, required: ['seconds'] },
  },
];
