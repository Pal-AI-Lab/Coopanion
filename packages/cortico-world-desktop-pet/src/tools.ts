/**
 * Tool declarations; `DesktopPetWorld.tools()` binds the handlers. Descriptions are English whatever the
 * model-text language; the character caps on what the person reads follow the app language (`capFor`).
 */
import type { ToolDef } from 'cortico/core/types.ts';
import { SCALE_MAX, SCALE_MIN, USER_MAX } from './config.ts';
import { capFor } from './i18n/index.ts';

/** Longest `pet_ask` option, in characters as seen, for Chinese, Japanese and Korean. */
export const ASK_OPTION_MAX = 40;

/** The declarations with the caps of the app language `language`. */
export const petToolDecls = (language = 'zh'): Array<Omit<ToolDef, 'handler'>> => [
  {
    name: 'pet_say',
    tags: ['speak'],
    description: 'Say something in a speech bubble above the pet. Expressions and motions go into the script as markers: 【…】 plays them first and then starts a new bubble; <…> plays them when the typing reaches that point. The receipt says roughly how long it stays on screen; fails when the pet window is not connected.',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'What to say, with optional 【expression, motion】 and <expression> markers. One or two sentences per bubble. Do not call this when you have nothing to say.' },
      },
      required: ['script'],
    },
  },
  {
    name: 'pet_ask',
    tags: ['speak'],
    description: 'Show a question bubble with up to 3 options under it, plus by default a box for the person to write their own answer. Returns at once; the answer arrives later as an event, and so does closing the question unanswered. A new pet_say or pet_ask replaces a question not yet answered.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question, one sentence.' },
        options: { type: 'array', items: { type: 'string' }, maxItems: 3, description: `1–3 short options, at most ${capFor(ASK_OPTION_MAX, language)} characters each; longer ones are cut.` },
        allowOwnAnswer: { type: 'boolean', description: 'Offer a box for writing an own answer; default true.' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'pet_walk_to',
    tags: ['act'],
    description: 'Walk (or run) along the bottom edge of the screen to a position. Returns on arrival or interruption, after 30 seconds at most.',
    parameters: {
      type: 'object',
      properties: {
        to: { description: 'Target: a number from 0 to 1 (a fraction of the width of the screen the pet is on, 0 leftmost, 1 rightmost), or left / center / right / cursor (the horizontal position of the mouse pointer).', anyOf: [{ type: 'number', minimum: 0, maximum: 1 }, { type: 'string', enum: ['left', 'center', 'right', 'cursor'] }] },
        run: { type: 'boolean', description: 'true to run; walks by default.' },
      },
      required: ['to'],
    },
  },
  {
    name: 'pet_set',
    tags: ['act'],
    description: 'Change your own looks and habits. figure, scheme, roam and snoreSeconds take effect at once; sound, scale, theme, hoverButtons and user are first asked of the person in a bubble and change only if they agree, and the receipt comes after their answer. The values to choose from are in the environment section. Give only the items to change.',
    parameters: {
      type: 'object',
      properties: {
        figure: { type: 'string', description: 'Figure: coo, or the id of an installed figure. Switching to a figure pack without a scheme puts on its first one.' },
        scheme: { type: 'string', description: 'The dress of the current figure (or of the one being switched to): a preset id, or one option per axis joined with - in axis order (for Coo: palette-head-side-glasses-neck).' },
        roam: { type: 'string', enum: ['free', 'calm', 'off'], description: 'Walking about: free walks often, calm mostly stays put, off does not wander.' },
        snoreSeconds: { type: 'integer', minimum: 0, maximum: 3600, description: 'Seconds of snoring each time you fall asleep; 0 snores until you wake.' },
        sound: { type: 'boolean', description: 'Sound effects on or off (asks the person first).' },
        scale: { type: 'number', minimum: SCALE_MIN, maximum: SCALE_MAX, description: 'Size on screen, 1 being the default (asks the person first).' },
        theme: { type: 'string', enum: ['dark', 'light'], description: 'dark is night (light body), light is day (dark body) (asks the person first).' },
        hoverButtons: { type: 'array', items: { type: 'string', enum: ['chat', 'voice', 'roam', 'theme', 'sound', 'dress', 'hide'] }, maxItems: 6, description: 'The buttons beside you while the mouse pointer rests on you (asks the person first).' },
        user: { type: 'string', maxLength: capFor(USER_MAX, language), description: `What you call the person, at most ${capFor(USER_MAX, language)} characters (asks the person first).` },
      },
    },
  },
  {
    name: 'pet_quiet',
    tags: ['act'],
    description: 'Keep quiet for a while: by default sound effects off and standing still, restored when the time is up; the settings stay as they are. If the person changes sound or walking themselves meanwhile, their choice holds and the quiet ends early. minutes 0 ends it now.',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', minimum: 0, maximum: 1440, description: 'Minutes of quiet.' },
        sound: { type: 'boolean', description: 'Sound effects during the quiet; default false.' },
        roam: { type: 'string', enum: ['off', 'calm'], description: 'Walking during the quiet; default off.' },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'pet_act',
    tags: ['act'],
    description: 'Play a sequence of expressions or motions without speaking (the current figure\'s vocabulary is in the environment section). Returns at once; words marked as held until the next action stay on.',
    parameters: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6, description: 'Expression or motion words, played in order.' },
      },
      required: ['actions'],
    },
  },
];
