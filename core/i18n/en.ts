/**
 * English: text of the Core process that people read: the introduction in the pet's bubble, the notes
 * on failed requests and updates, Coopanion's own settings, and what the status bubble says. The keys
 * are zh.ts's; a language other than zh-Hant reads the top-level keys its file leaves out from here.
 */
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const en: CoreText = {
  /** Coopanion's own settings, on the Habits page and in the advanced settings. */
  settings: {
    language: { title: 'Language', description: 'The settings window and the pet\'s bubbles and menu use this language, and Coo talks to you in it. Takes effect at once.' },
    telemetry: { title: 'Anonymous usage statistics', description: 'Sends usage counts and settings, never conversations, to help improve Coopanion. The fields are listed in docs/TELEMETRY.md.' },
    roundsSoft: { title: 'Wrap-up reminder', suffix: 'requests', description: 'After this many model requests in one wake-up, Coo is reminded to finish what it is doing and end the turn.' },
    roundsHard: { title: 'Requests per wake-up', suffix: 'requests', description: 'The most model requests in one wake-up; the turn ends when it is reached.' },
  },

  /** What the pet's bubble says after several model requests in a row failed. */
  failure: {
    text: (n: number, status: number, reason: string) => `My last ${n} requests to the model failed. Error${status ? ` ${status}` : ''}: ${reason}. Check the model name and API key on the Start page in settings, where you can test the connection.`,
    open: 'Open settings',
    ok: 'OK',
  },

  /** The steps of an automatic update, said in the pet's bubble. */
  update: {
    downloading: (v: string) => `Version ${v} is out and downloading in the background; I'll tell you when it's ready. If the download stalls, you can get it from GitHub yourself.`,
    ready: (v: string) => `Version ${v} is downloaded. Restart to update now? Otherwise it installs the next time you quit the app.`,
    failed: (v: string, why: string) => `Version ${v} did not download: ${why}. You can get it from GitHub yourself.`,
    ok: 'OK', github: 'Download from GitHub', install: 'Restart and update', later: 'Later', gotIt: 'OK',
  },

  /** The power button in the pet menu's header. */
  quit: 'Quit app',
  /** The two buttons in the bubble when computer use asks for permission. */
  cuaYes: 'Yes',
  cuaNo: 'Not this time',

  /** The status bubble: the tool Coo is using. */
  status: {
    read: 'Reading', browse: 'Browsing', memory: 'memory', find: 'Looking for', search: 'Searching', write: 'Writing', edit: 'Editing', append: 'Adding to',
    delete: 'Deleting', save: 'Saving', screen: 'Looking at the screen', windows: 'Looking at the open windows', rightClick: 'Right-clicking', doubleClick: 'Double-clicking', click: 'Clicking',
    move: 'Moving the mouse', drag: 'Dragging', scroll: 'Scrolling', focus: 'Switching windows', type: 'Typing', key: 'Pressing', wait: 'Waiting',
    alarmSet: 'Setting an alarm', alarmList: 'Checking alarms', alarmCancel: 'Cancelling an alarm',
    /** The words being searched for. */
    quoted: (text: string) => `"${text}"`,
    seconds: (n: number) => `${n} s`,
    minutesLater: (n: number) => `in ${n} min`,
  },

  /** The settings window's colour schemes that follow the pet's figure, on the Appearance page. */
  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `Put on when the pet changes to ${figure}'s "${preset}"`,
  },

  /** The introduction: what Coo says in its bubble, step by step, on the first start. */
  guide: {
    /** Answers to "Where did you hear about me?" and the ids the statistics report (docs/TELEMETRY.md); the last one skips. */
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['A friend', 'friend'], ['Somewhere else', 'other'], ['I\'d rather not say', 'skip']],
    hello: 'Hi! I\'m Coo, and I live along the bottom of your screen now. Coo...',
    helloReply: 'Hi, Coo!',
    askName: 'What should I call you?',
    nameSend: 'Call me that',
    gotName: (name: string) => `${name}, got it!`,
    askSource: 'Where did you hear about me?',
    sourceThanks: 'Oh, I see. Coo...',
    askRoam: 'Should I keep quiet or be lively most of the time? Click one to see what I\'d do.',
    /** Three cards: the name, how lively, and what Coo says when it is picked. */
    roam: {
      off: { label: 'Stay put', level: 'Low', line: 'Then I\'ll stand still and move when you call me.' },
      calm: { label: 'Now and then', level: 'Medium', line: 'I\'ll take a stroll now and then and stay put most of the time.' },
      free: { label: 'Often', level: 'High', line: 'I can run all over the place. Coo...!' },
    },
    roamOk: 'Like that',
    roamDone: 'OK, that\'s how I\'ll be.',

    askVendor: (first: string) => `To chat with you I need to connect to a model. Which service should I use? If you're not sure, pick ${first}.`,
    vendorOk: 'Use this one',
    moreVendors: 'More…',
    pickModel: (model: string) => `By default I'll use ${model}: it's cheap and can read images. To use another model, type its name instead.`,
    modelOk: 'Use this one',
    askKey: (name: string) => `Paste your ${name} API key here. It's billed by usage, so keep an eye on the tokens.`,
    keySend: 'Connect',
    keyLink: (name: string) => `No key yet? Get one from ${name}`,
    keyLater: 'Later',
    connecting: 'Connecting…',
    keyOk: (name: string, model: string) => `Connected to ${name}${model ? ` (${model})` : ''}! Now I can talk. Coo...`,
    keyFail: (why: string) => `That didn't connect: ${why}. Is the key complete, and is there credit left on the account? Try pasting it again.`,
    keyAlready: (connection: string) => `A model is connected already (${connection}). Easy. Coo...`,
    keySkipped: 'That\'s fine; I\'ll talk once you\'ve added it. I\'ll ask you again later.',

    askModel: (mb: number) => `To understand what you say, I need to download a speech recognition model (FunASR, about ${mb} MB). Download it now?`,
    download: 'Download',
    notNow: 'Not now',
    downloading: 'Downloading the speech model. Coo...',
    downloaded: 'Done! Now I can understand what you say.',
    downloadFail: (why: string) => `The download failed: ${why}. You can try again on the Voice input page in settings.`,
    modelLater: 'OK. One click on the Voice input page in settings downloads it later.',
    talk: (hint: string) => `To talk to me: ${hint}. `,
    talkOff: 'Voice input is off now; you can turn it on on the Voice input page in settings. ',
    talkType: 'You can also rest the pointer on me and click the bubble button beside me to type.',
    gotIt: 'Got it',
    buttons: 'Rest the pointer on me and a few buttons pop up beside me; right-click me for the menu, with pause, settings and quit.',
    ok: 'OK',
    persona: 'What I\'m like and how I talk is written on the System prompt page in the settings window. To change me, edit it there, or just tell me and I\'ll change it myself.',
    /** The word in the persona line drawn in the theme colour. */
    personaMark: 'System prompt',
    personaOk: 'Understood',
    finish: MAC
      ? 'All set! My icon is in the menu bar too; click it to change settings.'
      : process.platform === 'linux'
        ? 'All set! To change settings, right-click me for the menu; if my icon is in the tray, clicking it works too.'
        : 'All set! My icon is in the tray at the bottom right of the taskbar too; click it to change settings.',
    go: 'Let\'s go',
    dress: 'Dress me up first',
    closed: 'OK, let\'s stop here. To hear my introduction again, open settings and click "Guide" on the Start page.',

    askFirst: 'I\'m not connected to a model yet; I can talk once you add an API key. Which service should I use?',
    askAgain: 'Still no model connected; add an API key and I can keep you company. Which service should I use?',
    askLater: 'Later',
    noModel: 'No model is connected. Connect one now?',
    noModelGo: 'Connect',
    noModelLater: 'Later',
  },
};

export default en;
