/**
 * Tool declarations; `Cua.tools()` binds the handlers. Coordinates are pixels of the latest screenshot,
 * on the display it shows.
 * Descriptions are English whatever the model-text language.
 */
import type { ToolDef } from 'cortico/core/types.ts';

const shot = { type: 'boolean', description: 'Attach a screenshot afterwards; defaults to the configuration (attach). Leave it out only for a step whose result you do not need to see; after a step that may open a window or dialog, look before typing.' };
const xy = {
  x: { type: 'integer', minimum: 0, description: 'Horizontal position, in pixels of the latest screenshot' },
  y: { type: 'integer', minimum: 0, description: 'Vertical position, in pixels of the latest screenshot' },
};

/** While computer use is off: the way to its switch. */
export const CUA_OFF_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'pet_cua_open_settings',
    tags: ['act'],
    description: 'Computer use is off. Open the settings window at its switch, where the person reads what turning it on risks and can turn it on. Only after the person has agreed to open it.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

export const CUA_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'pet_cua_screenshot',
    tags: ['read', 'snapshot'],
    description: 'Capture one display. Returns the scaled image (with the mouse pointer drawn on it), its size and the display\'s, the other displays, the pointer position and the title of the foreground window. Later coordinates are pixels of this screenshot.',
    parameters: {
      type: 'object',
      properties: { display: { type: 'integer', minimum: 1, description: 'Display number, 1 = leftmost; omitted: the display looked at last, at first the one holding the foreground window' } },
      required: [],
    },
  },
  {
    name: 'pet_cua_zoom',
    tags: ['read', 'snapshot'],
    description: 'Capture a region of the latest screenshot\'s display again from the screen, for small text or icons the scaled screenshot blurs; the region is unscaled while no larger than the screenshot size limit. The region is given in screenshot pixels; the zoomed image is for reading only.',
    parameters: {
      type: 'object',
      properties: {
        ...xy,
        width: { type: 'integer', minimum: 1, description: 'Width in screenshot pixels' },
        height: { type: 'integer', minimum: 1, description: 'Height in screenshot pixels' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'pet_cua_click',
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
    name: 'pet_cua_move',
    tags: ['act'],
    description: 'Only move the mouse to (x, y), without clicking; for hovering to bring up a tooltip or a menu.',
    parameters: { type: 'object', properties: { ...xy, screenshot: shot }, required: ['x', 'y'] },
  },
  {
    name: 'pet_cua_drag',
    tags: ['act'],
    description: 'Hold the left button down, drag from `from` to `to`, and release. Both points are on the display of the latest screenshot.',
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
    name: 'pet_cua_scroll',
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
    name: 'pet_cua_type',
    tags: ['act'],
    description: 'Type text at the current input focus (any language, whatever state the input method is in); \\n presses Enter once. Click where the text goes first.',
    parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 }, screenshot: shot }, required: ['text'] },
  },
  {
    name: 'pet_cua_key',
    tags: ['act'],
    description: 'Press a key or a key combination. Join keys pressed together with +, and separate keys pressed one after another with spaces: "ctrl+s", "alt+f4", "ctrl+a delete", "enter", "win".',
    parameters: { type: 'object', properties: { keys: { type: 'string' }, screenshot: shot }, required: ['keys'] },
  },
  {
    name: 'pet_cua_windows',
    tags: ['read'],
    description: 'List the visible top-level windows: title, which display each is on (with its position in screenshot coordinates when that is the display of the latest screenshot), whether minimized, and which one is in the foreground.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pet_cua_focus',
    tags: ['act'],
    description: 'Bring a window to the foreground (restoring it first if minimized). window is a handle from pet_cua_windows, or part of its title.',
    parameters: { type: 'object', properties: { window: { type: 'string' }, screenshot: shot }, required: ['window'] },
  },
  {
    name: 'pet_cua_wait',
    tags: ['read'],
    description: 'Wait a number of seconds (30 at most) for the screen to load, then take a screenshot. Waiting needs no permission from the person; while looking at the screen is not yet allowed this turn, it waits without a screenshot.',
    parameters: { type: 'object', properties: { seconds: { type: 'number', minimum: 0, maximum: 30 } }, required: ['seconds'] },
  },
];
