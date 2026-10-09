/**
 * English: the text this World shows people. The keys are zh.ts's; a language other than zh-Hant
 * reads the top-level keys its file leaves out from here. The permission question and the system dialog follow
 * the app language; the console's settings, status and prompt notes follow the console request's
 * language. Text the bot reads, the engine's errors included, is not here (model-text.ts).
 */
import type { CuaText } from './index.ts';

const en: CuaText = {
  /** Asking before using the computer; `who` is the bot's name. */
  ask: {
    eachTurn: (who: string) => `${who} wants to use your computer: look at the screen and use the mouse and keyboard. OK this time?`,
    once: (who: string, minutes: number) => `${who} wants to use your mouse and keyboard. OK for the next ${minutes} minutes?`,
    acting: (who: string) => `${who} wants to use your mouse and keyboard. OK this time?`,
    /** The system dialog's title and its two buttons, used while no pet page is there. */
    caption: 'Computer use',
    yes: 'Yes',
    no: 'No',
  },

  /** Checks before the World starts. */
  preflight: {
    noDisplay: 'The computer use World needs X11 on Linux (or XWayland under Wayland): DISPLAY is not set.',
    unsupported: 'The computer use World runs on Windows, macOS and Linux only.',
  },

  /** The console: the World page's lamp, badges and prompt notes. */
  console: {
    label: 'Computer use',
    engine: 'Input engine',
    screen: (w: number, h: number) => `Screen ${w}×${h}`,
    onDemand: 'Starts when needed',
    exited: (code: number | null) => `The engine process exited (exit code ${code})`,
    control: 'Control',
    allowed: 'Allowed',
    viewOnly: 'Look only',
    asking: 'Asks',
    levels: { 'ask-each-turn': 'Every turn', 'ask-before-acting': 'Before acting', 'ask-once': (minutes: number) => `Once per ${minutes} min`, 'never-ask': 'Never' },
    envPrompt: { title: 'Computer use environment', description: 'Screenshot coordinates, the rules for staying out of the person\'s way, and what may be done.' },
    vars: {
      'cua.os': 'This computer\'s system: Windows or Mac',
      'cua.keys': 'Common shortcuts on this system',
      'cua.shot': 'Screenshot size',
      'cua.control': 'Whether the mouse and keyboard may be used',
      'cua.idle': 'How long to stay out of the way (seconds)',
      'cua.permission': 'When to ask the person first (from the permission setting)',
    },
  },

  /** The console's settings. */
  config: {
    group: 'Computer use',
    control: { title: 'Allow mouse and keyboard', description: 'When off, only screenshots and the window list.' },
    permission: { title: 'When to ask you first', description: 'ask-each-turn: before looking at the screen or acting, every turn; ask-before-acting: looking is free, asks before using the mouse and keyboard every turn; ask-once: looking is free, asks once before using the mouse and keyboard, and a yes holds for "How long a yes holds"; never-ask: never asks.' },
    grantMinutes: { title: 'How long a yes holds', suffix: 'min', description: 'For ask-once only.' },
    userIdleMs: { title: 'Stay out of the way for', description: 'After you use the mouse or keyboard, it waits until they have been still this long.' },
    maxYieldWaitMs: { title: 'Longest wait for you' },
    maxWidth: { title: 'Screenshot max width' },
    maxHeight: { title: 'Screenshot max height' },
    quality: { title: 'Screenshot quality' },
    afterAction: { title: 'Screenshot after each action' },
    settleMs: { title: 'Wait before the screenshot' },
  },
};

export default en;
