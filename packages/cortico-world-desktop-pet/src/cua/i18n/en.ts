/**
 * English: the text computer use shows people. The keys are zh.ts's; a language other than zh-Hant
 * reads the top-level keys its file leaves out from here. The permission question and the system dialog follow
 * the app language; the console's settings and lamp follow the console request's
 * language. Text the bot reads, the engine's errors included, is not here (model-text.ts).
 */
import type { CuaText } from './index.ts';

const en: CuaText = {
  /** Asking before using the computer; `who` is the bot's name. */
  ask: {
    eachTurn: (who: string) => `${who} wants to use your computer: look at the screen and use the mouse and keyboard. OK this time?`,
    once: (who: string, minutes: number) => `${who} wants to use your mouse and keyboard. OK for the next ${minutes} minutes?`,
    acting: (who: string) => `${who} wants to use your mouse and keyboard. OK this time?`,
    /** The two buttons, of the pet's bubble and of the system dialog; `caption` is the system dialog's title (shown while no pet page is there). */
    caption: 'Computer use',
    yes: 'Yes',
    no: 'Not this time',
    terminal: {
      type: (who: string, window: string, text: string, minutes: number) => `${who} wants to type into the terminal window "${window}":\n${text}\nWhat is typed may run as a command. After a yes, typing and keys in terminal windows and win+r are not asked about again for ${minutes} min. OK?`,
      key: (who: string, window: string, keys: string, minutes: number) => `${who} wants to press ${keys} in the terminal window "${window}". After a yes, typing and keys in terminal windows and win+r are not asked about again for ${minutes} min. OK?`,
      runBox: (who: string, keys: string, minutes: number) => `${who} wants to press ${keys} to open the Run box, which can start programs or run commands. After a yes, typing and keys in terminal windows and win+r are not asked about again for ${minutes} min. OK?`,
    },
  },

  /** Whether this system runs computer use. */
  preflight: {
    noDisplay: 'Computer use needs X11 on Linux (or XWayland under Wayland): DISPLAY is not set.',
    unsupported: 'Computer use runs on Windows, macOS and Linux only.',
  },

  /** The console: the input engine's lamp on the desktop-pet World page. */
  console: {
    engine: 'Input engine',
    screen: (w: number, h: number) => `Screen ${w}×${h}`,
    onDemand: 'Starts when needed',
    exited: (code: number | null) => `The engine process exited (exit code ${code})`,
    allowed: 'Allowed',
    viewOnly: 'Look only',
    asking: 'Asks',
    levels: { 'ask-each-turn': 'Every turn', 'ask-before-acting': 'Before acting', 'ask-once': (minutes: number) => `Once per ${minutes} min`, 'never-ask': 'Never' },
  },

  /** The console's settings. */
  config: {
    group: 'Computer use',
    enabled: { title: 'Turn on computer use' },
    control: { title: 'Allow the mouse and keyboard', description: 'When off, only screenshots and the window list.' },
    permission: { title: 'When to ask you', description: 'ask-each-turn: before looking at the screen or acting, every turn; ask-before-acting: looking is free, asks before using the mouse and keyboard every turn; ask-once: looking is free, asks once before using the mouse and keyboard, and a yes holds for "A yes lasts"; never-ask: never asks. Unless "Turn off asking before terminals and the Run box" is on, whatever the setting, typing or pressing keys in a terminal window and pressing win+r are asked about once on their own, and a yes holds for "A yes lasts".' },
    grantMinutes: { title: 'A yes lasts', suffix: 'min', description: 'For ask-once and for the separate question about terminal windows.' },
    skipTerminalAsk: { title: 'Turn off asking before terminals and the Run box', description: 'When on, typing or pressing keys in a terminal window and pressing win+r get no question of their own and are asked about as "When to ask you" says, like any other input. With never-ask, Coo can then run commands without asking you.' },
    userIdleMs: { title: 'Stay out of the way for', description: 'After you use the mouse or keyboard, Coo waits until they have been still this long.' },
    maxYieldWaitMs: { title: 'Longest wait for you' },
    maxWidth: { title: 'Screenshot max width' },
    maxHeight: { title: 'Screenshot max height' },
    quality: { title: 'Screenshot quality' },
    afterAction: { title: 'Screenshot after each action' },
    settleMs: { title: 'Wait before the screenshot' },
  },
};

export default en;
