import type { Translation } from 'cortico/core/language.ts';
import type { CuaText } from './index.ts';

const de: Translation<CuaText> = {
  ask: {
    eachTurn: (who: string) => `${who} möchte deinen Computer benutzen: auf den Bildschirm schauen und Maus und Tastatur verwenden. Ist das diesmal okay?`,
    once: (who: string, minutes: number) => `${who} möchte deine Maus und Tastatur benutzen. Okay für die nächsten ${minutes} Minuten?`,
    acting: (who: string) => `${who} möchte deine Maus und Tastatur benutzen. Ist das diesmal okay?`,
    caption: 'Computersteuerung',
    yes: 'Ja',
    no: 'Diesmal nicht',
    risky: {
      keys: (who: string, keys: string) => `${who} möchte ${keys} drücken. Diese Tastenkombination kann Systemmenüs öffnen oder Programme starten. Ist das okay?`,
      typeInTerminal: (who: string, window: string, text: string) => `${who} möchte im Terminalfenster „${window}“ eingeben:\n${text}\nDie Eingabe kann als Befehl ausgeführt werden. Ist das okay?`,
      enterInTerminal: (who: string, window: string, keys: string) => `${who} möchte im Terminalfenster „${window}“ ${keys} drücken; der dort eingegebene Befehl wird ausgeführt. Ist das okay?`,
    },
  },

  preflight: {
    noDisplay: 'Die Computersteuerung braucht unter Linux X11 (oder XWayland unter Wayland): DISPLAY ist nicht gesetzt.',
    unsupported: 'Die Computersteuerung läuft nur unter Windows, macOS und Linux.',
  },

  console: {
    engine: 'Eingabe-Engine',
    screen: (w: number, h: number) => `Bildschirm ${w}×${h}`,
    onDemand: 'Startet bei Bedarf',
    exited: (code: number | null) => `Der Engine-Prozess wurde beendet (Exit-Code ${code})`,
    allowed: 'Erlaubt',
    viewOnly: 'Nur schauen',
    asking: 'Fragt',
    levels: { 'ask-each-turn': 'Jede Runde', 'ask-before-acting': 'Vor dem Handeln', 'ask-once': (minutes: number) => `Einmal pro ${minutes} Min.`, 'never-ask': 'Nie' },
  },

  config: {
    group: 'Computersteuerung',
    enabled: { title: 'Computersteuerung einschalten' },
    control: { title: 'Maus und Tastatur erlauben', description: 'Wenn aus, nur Screenshots und die Fensterliste.' },
    permission: { title: 'Wann du gefragt wirst', description: 'ask-each-turn: fragt jede Runde, bevor Coo auf den Bildschirm schaut oder handelt; ask-before-acting: Schauen ist frei, fragt jede Runde, bevor Coo Maus und Tastatur benutzt; ask-once: Schauen ist frei, fragt einmal, bevor Coo Maus und Tastatur benutzt, und ein Ja gilt so lange wie bei „Ein Ja gilt“ eingestellt; never-ask: fragt nie. Unabhängig von der Einstellung wird vor Tastenkombinationen, die Programme starten können, und vor Eingaben oder Enter in einem Terminalfenster jedes Mal einzeln gefragt.' },
    grantMinutes: { title: 'Ein Ja gilt', suffix: 'Min.', description: 'Nur für ask-once.' },
    userIdleMs: { title: 'Dir den Vortritt lassen für', description: 'Nachdem du Maus oder Tastatur benutzt hast, wartet Coo, bis sie so lange unberührt waren.' },
    maxYieldWaitMs: { title: 'Längste Wartezeit auf dich' },
    maxWidth: { title: 'Maximale Screenshot-Breite' },
    maxHeight: { title: 'Maximale Screenshot-Höhe' },
    quality: { title: 'Screenshot-Qualität' },
    afterAction: { title: 'Screenshot nach jeder Aktion' },
    settleMs: { title: 'Wartezeit vor dem Screenshot' },
  },
};

export default de;
