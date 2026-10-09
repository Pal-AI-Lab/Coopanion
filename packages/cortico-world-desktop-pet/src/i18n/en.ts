/**
 * English: the text this World shows people. The keys are zh.ts's; a language other than zh-Hant
 * reads the top-level keys its file leaves out from here. Bubbles, the menu and voice hints follow the
 * app language; the console's settings, panels, chat page and prompt notes follow the console
 * request's language. Text the bot reads is not here (model-text.ts).
 */
import type { PetText } from './index.ts';

const en: PetText = {
  /** What events and bubbles call the person while no name is set. */
  defaultUser: 'Pal',

  /** The pet's menu and bubbles. */
  menu: {
    /** The power button's name when the app gives none. */
    quit: 'Quit',
    /** The question in the menu header after the power button is clicked. */
    quitPrompt: (label: string) => `${label}?`,
  },

  /** Status bubble: a tool call without its own description. */
  busy: 'Working',

  /** Voice input: the microphone button's state in the menu, and the notes in the introduction and on the settings page. */
  voice: {
    starting: 'Speech recognition is starting',
    notRunning: 'Speech recognition is not running',
    modelMissing: (mb: number) => `The speech model is not downloaded yet (about ${mb} MB): download it on the Voice input page`,
    badKey: (hotkey: string) => `Unknown key "${hotkey}"`,
    /** The talk key cannot be read, so the microphone listens all the time for now. */
    fallback: (problem: string) => `The talk key is unavailable, so I listen all the time for now: ${problem}`,
    always: 'Always listening: just talk',
    /** The talk key switches listening on and off; `label` is the full key name with its presses ("Double-press Left Alt"). */
    toggleTaps: (label: string, taps: number) => `${label} to start listening, ${taps === 2 ? 'double' : 'triple'}-press again to stop`,
    toggle: (key: string) => `Press ${key} to start listening, press it again to stop`,
    holdTaps: (key: string, taps: number) => `Tap ${key} ${taps === 2 ? 'once' : 'twice'}, then hold it and talk; let go to send`,
    hold: (key: string) => `Hold ${key} and talk; let go to send`,
    /** A line in the Voice input page's results for a sentence that was not recognized. */
    failedLine: (error: string) => `[failed] ${error}`,
  },

  /** Names of the talk keys, by their Windows key names; the Mac set goes over them. */
  keys: {
    LeftCtrl: 'Left Ctrl', RightCtrl: 'Right Ctrl', LeftAlt: 'Left Alt', RightAlt: 'Right Alt', LeftShift: 'Left Shift', RightShift: 'Right Shift',
    RightWin: 'Right Win', Backquote: '`', Mouse3: 'Middle mouse button', Mouse4: 'Mouse button 4', Mouse5: 'Mouse button 5',
  },
  macKeys: {
    Ctrl: 'Control', LeftCtrl: 'Left Control', RightCtrl: 'Right Control',
    Alt: 'Option', LeftAlt: 'Left Option', RightAlt: 'Right Option', Win: 'Command', RightWin: 'Right Command',
  },
  /** Repeated presses, put before the key name: "Double-press Left Alt". */
  taps: (taps: number, keys: string) => `${taps === 2 ? 'Double' : 'Triple'}-press ${keys}`,

  /** Why the talk key cannot be read. */
  hotkey: {
    cannotRead: (why: string) => `Cannot read the keyboard: ${why}`,
    macNoKey: 'A Mac keyboard has no such key; pick another talk key',
    macPermission: 'No Input Monitoring permission: turn Coopanion on under System Settings → Privacy & Security → Input Monitoring, then restart it. If it is on already, remove Coopanion from the list with "−" and add it back: an updated version does not inherit the old permission',
    linuxNoKey: 'Linux cannot read this key (mouse side buttons do not work); pick another talk key',
    linuxNoDisplay: 'The talk key needs X11 (or XWayland) on Linux: DISPLAY is not set',
    linuxNoX11: 'The talk key cannot connect to the X11 display',
    unsupported: 'The talk key works on Windows, macOS and Linux only',
  },

  /** Windows' own speech recognizer. */
  system: {
    name: (culture: string) => (culture ? `Windows Speech Recognition (${culture})` : 'Windows Speech Recognition'),
    noSpeech: 'The System.Speech component does not load',
    noRecognizer: (language: string) => `Windows has no speech recognizer${language === 'auto' ? '' : ` for "${language}"`}: add Speech recognition for the language under Windows Settings → Time & language → Language`,
    windowsOnly: 'Windows Speech Recognition is only on Windows',
    startFailed: (why: string) => `Failed to start: ${why}`,
    exited: 'The speech recognition process exited',
    exitedCode: (code: number | null) => `The speech recognition process exited (exit code ${code})`,
    notReady: 'Windows Speech Recognition did not become ready in time',
    notRunning: 'Windows Speech Recognition is not running',
    timeout: (ms: number) => `Recognition timed out (${ms} ms)`,
    stopped: 'Windows Speech Recognition has stopped',
  },

  /** The speech models sherpa-onnx runs. */
  sherpa: {
    incomplete: 'Some speech model files are missing: download it again',
    noRuntime: (platform: string) => `sherpa-onnx has no runtime for this platform (${platform})`,
    loadFailed: (why: string) => `The speech model failed to load: ${why}`,
    notLoaded: 'The speech model is not loaded',
  },

  /** Downloading the window runtime and the speech model. */
  store: {
    noBuild: (platform: string) => `No prebuilt package for ${platform}`,
    downloading: (file: string) => `Downloading ${file}`,
    unpacking: 'Unpacking',
    downloadingModel: 'Downloading the speech model',
    downloadingFrom: (file: string, host: string) => `Downloading ${file} (${host})`,
    verifying: (file: string) => `Verifying ${file}`,
    mismatch: (sum: string) => `Checksum mismatch: ${sum}…`,
    failed: (file: string, why: string) => `${file} failed to download (${why})`,
    exitCode: (cmd: string, code: number | null, out: string) => `${cmd} exit code ${code}: ${out}`,
  },

  /** Why a pack's figure.json cannot be read; field names as written there. */
  packs: {
    noManifest: (file: string) => `No ${file}`,
    badJson: (file: string, why: string) => `${file} is not valid JSON: ${why}`,
    notInteger: (key: string, got: string) => `${key} must be an integer, not ${got}`,
    tooNew: (key: string, v: number, now: number) => `${key} is ${v}; this version reads up to ${now}: update the app first`,
    tooOld: (key: string, v: number, oldest: number) => `${key} ${v} is a test format from before ${oldest} and cannot be read`,
    badId: (got: string) => `Invalid id: ${got}`,
    noName: 'name is missing',
    noAbout: 'about is missing',
    badEntry: 'entry or export is invalid',
    badModel: 'The model path is invalid',
    badThumb: 'The thumb path is invalid',
    badAxis: (got: string) => `Invalid entry in axes: ${got}`,
    badOption: (axis: string, got: string) => `Invalid option in axes.${axis}: ${got}`,
    badPreset: (got: string) => `Invalid entry in presets: ${got}`,
    presetMissing: (preset: string, axis: string) => `presets.${preset} picks no option for ${axis}`,
    badPresetThumb: (preset: string) => `The presets.${preset}.thumb path is invalid`,
    vocabNotArray: 'vocab must be an array',
    badWordId: (got: string) => `Invalid id in vocab: ${got}`,
    unknownKind: (id: string, kind: string) => `vocab.${id}.kind is ${kind}, which this version does not know; the bot does not get this word`,
    namesNotArray: (id: string, lang: string) => `vocab.${id}.names.${lang} must be an array`,
    badWordName: (id: string, got: string) => `Invalid name in vocab.${id}: ${got}`,
    nameTaken: (name: string) => `${name} names more than one word in vocab`,
    noWordAbout: (id: string) => `vocab.${id}.about is missing`,
    badSeconds: (id: string) => `vocab.${id}.seconds must be a positive number`,
    soundsNotObject: 'sounds must be an object',
    badSoundName: (got: string) => `Invalid name in sounds: ${got}`,
    badSoundFile: (name: string) => `sounds.${name}.file must be a file in the pack`,
    badVolume: (name: string) => `sounds.${name}.volume must be 0–1`,
    soundType: (name: string, file: string) => `${file} of sounds.${name} is not an .ogg, .mp3 or .wav this version plays; the sound stays silent`,
    soundKind: (name: string, kind: string, kinds: readonly string[]) => `sounds.${name}.kind is ${kind}; this version knows ${kinds.join(', ')} only, so the sound stays silent`,
    soundMissing: (name: string, file: string) => `${file} of sounds.${name} does not exist; the sound stays silent`,
    badWalk: (got: string) => `can.walk is ${got}, which this version does not know; taken as able to walk`,
    idTaken: (id: string, builtin: boolean) => `id ${id} is taken by ${builtin ? 'a built-in figure' : 'another pack'}`,
  },

  /** Importing packs on the dressing page. */
  importing: {
    badZip: (why: string) => `Not a readable zip: ${why}`,
    tooBig: (mb: number) => `Over ${mb} MB unpacked`,
    truncated: 'The upload is incomplete',
    badPath: (path: string) => `A path cannot be used: ${path}`,
    builtinId: (id: string) => `id ${id} belongs to a built-in figure; change the id to import it`,
    duplicateId: (id: string) => `id ${id} is the same as another pack in this import`,
    unpackFailed: (why: string) => `Could not unpack: ${why}`,
    expired: 'This import has expired; choose the files again',
    noneChosen: 'No pack is chosen',
    zipOrFolder: 'Only a zip or folders can be imported',
    overLimit: (mb: number) => `Over ${mb} MB`,
  },

  /** The bubble in which the pet asks the person's consent to a change of settings: the question, its three buttons, and how each change is said */
  consent: {
    question: (items: string[]) => `Can I ${items.join(', ')}?`,
    /** OK / Always OK (these items are not asked about again) / No thanks */
    choices: ['OK', 'Always OK', 'No thanks'] as [yes: string, always: string, no: string],
    list: (items: string[]) => items.join(', '),
    pick: (axis: string, option: string) => `${axis}: ${option}`,
    figure: (to: string) => `switch to ${to}`,
    scheme: (figure: string, look: string) => `put on a different ${figure} look (${look})`,
    roam: { free: 'Often', calm: 'Now and then', off: 'Stay put' } as Record<'free' | 'calm' | 'off', string>,
    roamTo: (to: string) => `set my walking to "${to}"`,
    snore: (seconds: number) => (seconds === 0 ? 'snore until I wake' : `snore for ${seconds} s each time I sleep`),
    sound: (on: boolean) => (on ? 'turn sounds on' : 'turn sounds off'),
    scale: (from: number, to: number) => `change my size from ${from}× to ${to}×`,
    theme: { dark: 'switch to the night look', light: 'switch to the day look' } as Record<'dark' | 'light', string>,
    hover: (list: string) => `change the hover buttons to ${list}`,
    actions: { chat: 'Type', voice: 'Voice input', roam: 'Walking', theme: 'Night mode', sound: 'Sounds', dress: 'Dress up', hide: 'Hide pet' } as Record<string, string>,
    user: (to: string) => `call you "${to}"`,
  },

  /** Why the World fails to start when every page port is taken. */
  portsTaken: (from: number, to: number, why: string) => `Ports ${from}–${to} are all taken: ${why}`,

  /** The console: the World page's lamps, links, panels and prompt notes. */
  console: {
    label: 'Desktop pet',
    window: 'Pet window',
    connected: 'Page connected',
    notOpen: 'Not open',
    voice: 'Speech recognition',
    notStarted: 'Not started',
    viewInBrowser: 'View the pet in the browser',
    dress: 'Dress up',
    panels: {
      pet: { title: 'Desktop pet', description: 'The window, the dress and the window runtime.' },
      voice: { title: 'Voice input', description: 'Recognition engine, input level and what was heard.' },
      chat: { title: 'Chat', description: 'The chat page: type and send images, and see what it said and did.' },
    },
    envPrompt: { title: 'Desktop pet environment', description: "Describes the pet's body, its four tools and its input events." },
    vars: {
      'pet.user': 'What the bot calls the person',
      'pet.vocab': "The current figure's expressions and motions",
      'pet.voice': 'Whether voice input is on or off',
      'pet.body': 'What the current figure looks like',
      'pet.dress': 'The figures and dress pet_set can pick',
      'pet.self': 'Self-adjustment: which settings change directly, which wait for consent, or that none can change',
      'pet.chat': 'A note on the chat page when the app has one; empty otherwise',
      'pet.reply': 'A line telling the bot which language to talk in when the app language is neither Simplified Chinese nor English; empty otherwise',
    },
    noImage: 'No such image',
    noGuide: 'This app has no introduction',
    unknownMethod: (name: string) => `Unknown method ${name}`,
  },

  /** The console's settings (the World page and settings in advanced mode). */
  config: {
    group: 'Desktop pet',
    soundGroup: 'Sounds',
    asrGroup: 'Voice input',
    user: { title: 'What to call you', description: (max: number) => `The name voice, typing and touch events call you by, up to ${max} characters. Empty uses the default name.` },
    roam: { title: 'Walking', description: 'free walks about often; calm stays put most of the time; off moves only when asked.' },
    theme: { title: 'Night or day', description: 'dark is night: a light body and dark bubbles; light is day: a dark body and light bubbles.' },
    rememberPosition: { title: 'Remember position', description: 'Saves how far across the screen the pet stands when the app quits, and starts there next time; with several screens it always starts on the main one.' },
    hoverButtons: { title: 'Hover buttons', description: (max: number, ids: string) => `Buttons beside the pet while the pointer rests on it, up to ${max}, separated by commas: ${ids}.` },
    doubleClickChat: { title: 'Double-click to type', description: 'Double-clicking the pet opens the typing box.' },
    statusBubble: { title: 'Status bubble', description: 'Shows what the pet is doing while it thinks, looks through its memory or uses the computer, file names included.' },
    selfAdjust: { title: 'Self-adjustment', description: 'off: it cannot change its settings or keep quiet for a while. default: figure, dress, walking and snoring change directly; size, sounds, theme, hover buttons and what it calls you wait for your consent. any: everything changes directly. custom: as ticked on the Habits page; ticked items change directly, the rest wait for your consent.' },
    windowEnabled: { title: 'Open the pet window at start' },
    scale: { title: 'Size' },
    frameRate: { title: 'Frame rate', description: 'Frames a second while the pet walks, is carried or jumps; 0 follows the display. Above the display\'s refresh rate the display\'s rate applies. The Habits page offers 60, 120, 144 and Unlimited.' },
    lockFrameRate: { title: 'Always draw at the frame rate', description: 'Draws the pet at the frame rate at rest too. When off, it drops to 30 frames a second while standing, sitting or asleep.' },
    hideWhenFullscreen: { title: 'Hide during full screen', description: 'When on, the pet hides while the window in front fills the screen it is on (a game, a full-screen video, a browser in full screen) and comes back when full screen ends; a maximized window does not count. When off, it always stays on top.' },
    electronFile: { title: 'Electron executable', description: 'Empty uses CORTICO_DESKTOP_PET_HOST, then the runtime installed from the panel.' },
    port: { title: 'Page port', description: 'Moves up to the next free port when taken.' },
    touchEnabled: { title: 'Touches become events', description: 'Pokes, petting, and being picked up and thrown.' },
    touchWakeOn: { title: 'Response mode', description: 'poke: only a click wakes; petting and carrying go with the next wake. all: every touch wakes. none: every touch goes with the next wake. Touches after a touch woke the bot, until that turn ends, go with the next wake. custom: the touches ticked on the Habits page wake.' },
    sound: { title: 'All sounds', description: "The sound button in the pet's menu flips this." },
    sounds: {
      move: { title: 'Moving', description: 'Walking, running, jumping, landing, being thrown, nodding, shaking, spinning, dizziness, shivering, dancing, looking about.' },
      touch: { title: 'Touch', description: 'Being picked up, swung, petted, poked.' },
      face: { title: 'Faces', description: 'Happy, wink, love, surprised, angry, sad, shy, yawning.' },
      snore: { title: 'Snoring', description: '' },
      talk: { title: 'Talking', description: 'The babble as bubble text appears, and choice cards popping up.' },
      ui: { title: 'Buttons and cues', description: 'Button clicks, bubbles opening, picks, and listening starting and ending.' },
    },
    snoreSeconds: { title: 'Snore for', suffix: 's', description: "In each sleep the pet goes quiet after snoring this long; the z's keep floating. 0 = snore until waking." },
    asrEnabled: { title: 'Voice input' },
    asrEngine: { title: 'Recognition engine', description: "funasr runs FunASR's SenseVoiceSmall, for Chinese, English, Japanese, Korean and Cantonese, after a one-time download of about 240 MB; whisper runs OpenAI's Whisper small, for French, German, Spanish, Portuguese, Italian, Russian and about 90 more languages, after a one-time download of about 360 MB, and shows the text once a sentence ends; both recognize on this computer. system uses Windows' own speech recognition, with nothing to download and lower accuracy (Windows only). Empty picks by the app language: funasr for Chinese, English, Japanese and Korean, whisper for the rest." },
    asrLanguage: { title: 'Language', description: 'An ISO 639-1 code, or auto to let the model tell; empty follows the app language. FunASR takes zh, en, ja, ko and yue, Whisper about a hundred codes such as fr, de, es, pt, it and ru; a code the model does not take reads as auto.' },
    asrThreads: { title: 'CPU threads', description: 'Threads FunASR and Whisper use for one recognition; 0 = 2.' },
    asrSimplified: { title: 'Convert to Simplified', description: 'Turns Traditional characters in what was heard into Simplified while the app language is Simplified Chinese.' },
    thresholdDb: { title: 'Speech threshold' },
    silenceMs: { title: 'Silence that ends a sentence' },
    maxUtteranceMs: { title: 'Longest sentence' },
  },

  /** The console's Desktop pet and Voice input panels. */
  panel: {
    pet: 'Desktop pet',
    window: 'Pet window',
    openWindow: 'Open window',
    closeWindow: 'Close window',
    runtime: 'Window runtime',
    install: 'Install',
    viewInBrowser: 'View in browser',
    dress: 'Dress up',
    dressHint: 'Changes are saved at once and reach the pet window',
    connected: 'Connected',
    starting: 'Starting',
    cannotOpen: 'Cannot open',
    notOpen: 'Not open',
    external: 'Using an external program',
    installed: 'Installed',
    downloading: (progress: string) => `Downloading ${progress}`,
    installFailed: 'Install failed',
    notInstalled: 'Not installed',
    noBuild: 'No prebuilt package for this platform',
    electronSize: 'Electron 44.4.4, about 150 MB',

    voice: 'Voice input',
    enable: 'Turn on voice input',
    enabledHint: 'On: the microphone stays open, and what you say goes to the pet as set below',
    disabledHint: 'Off: the microphone stays closed, and the settings below wait',
    engine: 'Recognition engine',
    funasr: 'FunASR (on this computer)',
    system: 'Windows built-in',
    whisper: 'Whisper (on this computer)',
    systemHint: 'Nothing to download, fair accuracy; switch to FunASR or Whisper for better results',
    funasrHint: 'SenseVoiceSmall on this computer, for Chinese, English, Japanese, Korean and Cantonese; download the model once and keep it',
    whisperHint: 'Whisper small on this computer, for French, German, Spanish, Portuguese, Italian, Russian and more; the text appears once a sentence ends; download the model once and keep it',
    server: 'Recognition service',
    start: 'Start',
    stop: 'Stop',
    ready: 'Ready',
    error: 'Error',
    stopped: 'Stopped',
    model: 'Speech model',
    download: 'Download',
    retry: 'Retry',
    downloadFailed: 'Download failed',
    downloaded: 'Downloaded',
    notDownloaded: 'Not downloaded',
    modelSource: (size: string) => `About ${size}, downloaded from ModelScope`,
    mic: 'Microphone',
    micStates: { on: 'Listening', off: 'Not listening', denied: 'Denied', error: 'Error' },
    defaultDevice: 'System default',
    missingDevice: 'The device picked before (not found now)',
    micN: (n: number) => `Microphone ${n}`,
    mode: 'How it listens',
    modes: { hold: 'While the talk key is held', toggle: 'The talk key switches it on and off', always: 'All the time' },
    /** How the talk key is pressed, for holding and for switching, by the number of presses. */
    presses: {
      2: { hold: 'Double-press and hold', toggle: 'Double-press to start and again to stop' },
      1: { hold: 'Just hold', toggle: 'Press to start, press again to stop' },
      3: { hold: 'Triple-press and hold', toggle: 'Triple-press to start and again to stop' },
    },
    talkKey: (label: string) => `Talk key: ${label}`,
    capture: 'Press the new talk key: a key combination or a mouse side button… (Esc cancels)',
    listening: 'Listening',
    waitingKey: 'Waiting for the talk key',
    keyProblem: (problem: string) => `${problem}; listening all the time instead`,
    results: 'What was heard',
    resultsHint: 'Struck-through lines were too short or likely hallucinated, and were not sent',
  },

  /** Why the chat page's message was turned back, and its notices. */
  chat: {
    badImages: 'The images are not in a form this page sends',
    tooManyImages: (max: number) => `At most ${max} images at a time`,
    badMime: (mime: string) => `Unsupported image type ${mime}`,
    emptyImage: 'One of the images is empty',
    bigImage: (mb: number) => `Each image must be under ${mb} MB`,
    offline: 'Not connected yet',
    notSent: 'Could not send it',
    tooLate: 'That one has already been delivered and cannot be taken back.',
  },
};

export default en;
