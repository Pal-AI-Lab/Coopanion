import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const de: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} möchte deinen Computer benutzen: auf den Bildschirm schauen und Maus und Tastatur verwenden. Ist das diesmal okay?`,
    once: (who: string, minutes: number) => `${who} möchte deine Maus und Tastatur benutzen. Okay für die nächsten ${minutes} Minuten?`,
    acting: (who: string) => `${who} möchte deine Maus und Tastatur benutzen. Ist das diesmal okay?`,
    caption: 'Computersteuerung',
    yes: 'Ja',
    no: 'Nein',
  },

  preflight: {
    noDisplay: 'Die World Computersteuerung braucht unter Linux X11 (oder XWayland unter Wayland): DISPLAY ist nicht gesetzt.',
    unsupported: 'Die World Computersteuerung läuft nur unter Windows, macOS und Linux.',
  },

  console: {
    label: 'Computersteuerung',
    engine: 'Eingabe-Engine',
    screen: (w: number, h: number) => `Bildschirm ${w}×${h}`,
    onDemand: 'Startet bei Bedarf',
    exited: (code: number | null) => `Der Engine-Prozess wurde beendet (Exit-Code ${code})`,
    control: 'Steuerung',
    allowed: 'Erlaubt',
    viewOnly: 'Nur schauen',
    asking: 'Fragt',
    levels: { 'ask-each-turn': 'Jede Runde', 'ask-before-acting': 'Vor dem Handeln', 'ask-once': (minutes: number) => `Einmal pro ${minutes} Min.`, 'never-ask': 'Nie' },
    envPrompt: { title: 'Computersteuerungs-Umgebung', description: 'Screenshot-Koordinaten, die Regeln, um der Person nicht in die Quere zu kommen, und was erlaubt ist.' },
    vars: {
      'cua.os': 'Das System dieses Computers: Windows oder Mac',
      'cua.keys': 'Gängige Tastenkürzel auf diesem System',
      'cua.shot': 'Screenshot-Größe',
      'cua.control': 'Ob Maus und Tastatur benutzt werden dürfen',
      'cua.idle': 'Wie lange der Person der Vortritt gelassen wird (Sekunden)',
      'cua.permission': 'Wann die Person zuerst gefragt wird (laut der Einstellung permission)',
    },
  },

  config: {
    group: 'Computersteuerung',
    control: { title: 'Maus und Tastatur erlauben', description: 'Wenn aus, nur Screenshots und die Fensterliste.' },
    permission: { title: 'Wann du zuerst gefragt wirst', description: 'ask-each-turn: fragt jede Runde, bevor es auf den Bildschirm schaut oder handelt; ask-before-acting: Schauen ist frei, fragt jede Runde, bevor es Maus und Tastatur benutzt; ask-once: Schauen ist frei, fragt einmal, bevor es Maus und Tastatur benutzt, und ein Ja gilt für „Wie lange ein Ja gilt“; never-ask: fragt nie.' },
    grantMinutes: { title: 'Wie lange ein Ja gilt', suffix: 'Min.', description: 'Nur für ask-once.' },
    userIdleMs: { title: 'Dir den Vortritt lassen für', description: 'Nachdem du Maus oder Tastatur benutzt hast, wartet es, bis sie so lange unberührt waren.' },
    maxYieldWaitMs: { title: 'Längste Wartezeit auf dich' },
    maxWidth: { title: 'Maximale Screenshot-Breite' },
    maxHeight: { title: 'Maximale Screenshot-Höhe' },
    quality: { title: 'Screenshot-Qualität' },
    afterAction: { title: 'Screenshot nach jeder Aktion' },
    settleMs: { title: 'Wartezeit vor dem Screenshot' },
  },
};

export default de;
