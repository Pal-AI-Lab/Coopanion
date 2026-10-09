import type { Translation } from 'cortico/core/language.ts';
import type { CoreText } from './index.ts';

const MAC = process.platform === 'darwin';

const de: Translation<CoreText> = {
  settings: {
    language: { title: 'Sprache', description: 'Das Einstellungsfenster sowie die Sprechblasen und das Menü des Haustiers verwenden diese Sprache, und Coo spricht in ihr mit dir. Gilt sofort.' },
    telemetry: { title: 'Anonyme Nutzungsstatistik', description: 'Sendet Nutzungszahlen und Einstellungen, nie Unterhaltungen, um Coopanion zu verbessern. Die Felder stehen in docs/TELEMETRY.md.' },
    roundsSoft: { title: 'Abschluss-Erinnerung', suffix: 'Anfragen', description: 'Nach so vielen Modellanfragen in einem Aufwachen wird Coo erinnert, das Laufende abzuschließen und die Runde zu beenden.' },
    roundsHard: { title: 'Anfragen pro Aufwachen', suffix: 'Anfragen', description: 'Höchstzahl der Modellanfragen in einem Aufwachen; ist sie erreicht, endet die Runde.' },
  },

  failure: {
    text: (n: number, status: number, reason: string) => `Meine letzten ${n} Anfragen an das Modell sind fehlgeschlagen. Fehler${status ? ` ${status}` : ''}: ${reason}. Prüf den Modellnamen und den API Key auf der Seite Start in den Einstellungen; dort kannst du die Verbindung testen.`,
    open: 'Einstellungen öffnen',
    ok: 'OK',
  },

  update: {
    downloading: (v: string) => `Version ${v} ist da und wird im Hintergrund heruntergeladen; ich sag dir Bescheid, wenn sie bereit ist. Wenn der Download hängt, kannst du sie selbst von GitHub holen.`,
    ready: (v: string) => `Version ${v} ist heruntergeladen. Jetzt neu starten und aktualisieren? Sonst wird sie installiert, wenn du die App das nächste Mal beendest.`,
    failed: (v: string, why: string) => `Version ${v} wurde nicht heruntergeladen: ${why}. Du kannst sie selbst von GitHub holen.`,
    ok: 'OK', github: 'Von GitHub herunterladen', install: 'Neu starten und aktualisieren', later: 'Später', gotIt: 'OK',
  },

  quit: 'App beenden',
  cuaYes: 'Ja',
  cuaNo: 'Diesmal nicht',

  status: {
    read: 'Liest', browse: 'Stöbert', memory: 'Gedächtnis', find: 'Sucht', search: 'Durchsucht', write: 'Schreibt', edit: 'Bearbeitet', append: 'Ergänzt',
    delete: 'Löscht', save: 'Speichert', screen: 'Schaut auf den Bildschirm', windows: 'Schaut auf die offenen Fenster', rightClick: 'Rechtsklickt', doubleClick: 'Doppelklickt', click: 'Klickt',
    move: 'Bewegt die Maus', drag: 'Zieht', scroll: 'Scrollt', focus: 'Wechselt das Fenster', type: 'Tippt', key: 'Drückt', wait: 'Wartet',
    alarmSet: 'Stellt einen Wecker', alarmList: 'Prüft die Wecker', alarmCancel: 'Löscht einen Wecker',
    quoted: (text: string) => `„${text}“`,
    seconds: (n: number) => `${n} s`,
    minutesLater: (n: number) => `in ${n} Min.`,
  },

  scheme: {
    name: (figure: string, preset: string) => `${figure} · ${preset}`,
    note: (figure: string, preset: string) => `Wird angelegt, wenn das Haustier zu „${preset}“ von ${figure} wechselt`,
  },

  guide: {
    sources: [['Steam', 'steam'], ['YouTube', 'youtube'], ['Reddit', 'reddit'], ['X', 'x'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['GitHub', 'github'], ['Freunde', 'friend'], ['Woanders', 'other'], ['Sag ich lieber nicht', 'skip']],
    hello: 'Hi! Ich bin Coo und wohne jetzt unten am Rand deines Bildschirms. Coo...',
    helloReply: 'Hi, Coo!',
    askName: 'Wie soll ich dich nennen?',
    nameSend: 'Nenn mich so',
    gotName: (name: string) => `${name}, gemerkt!`,
    askSource: 'Wie hast du von mir erfahren?',
    sourceThanks: 'Ach so. Coo...',
    askRoam: 'Soll ich meistens ruhig oder lebhaft sein? Klick eine Karte an, um zu sehen, was ich dann mache.',
    roam: {
      off: { label: 'Bleibt stehen', level: 'Niedrig', line: 'Dann bleibe ich stehen und bewege mich, wenn du mich rufst.' },
      calm: { label: 'Ab und zu', level: 'Mittel', line: 'Ich mache ab und zu einen Spaziergang und bleibe meistens, wo ich bin.' },
      free: { label: 'Oft', level: 'Hoch', line: 'Ich kann überall herumflitzen. Coo...!' },
    },
    roamOk: 'So',
    roamDone: 'Okay, so mache ich es.',
    wakeTitle: 'Reaktionsmodus',
    askWake: 'Reaktionsmodus: Wenn du mich anstupst, streichelst oder hochhebst, wann soll ich reagieren?',
    wake: {
      none: { label: 'Ruhig', note: 'Berührungen werden gemerkt und beantwortet, wenn du Coo das nächste Mal ansprichst' },
      poke: { label: 'Standard', note: 'Reagiert nur, wenn du Coo anstupst' },
      all: { label: 'Aktiv', note: 'Reagiert auf jede Berührung' },
    },

    askVendor: (first: string) => `Um mit dir zu chatten, muss ich mich mit einem Modell verbinden. Welchen Dienst soll ich nutzen? Wenn du unsicher bist, nimm ${first}.`,
    vendorOk: 'Diesen nehmen',
    moreVendors: 'Mehr…',
    pickModel: (model: string) => `Standardmäßig nehme ich ${model}: Es ist günstig und kann Bilder lesen. Für ein anderes Modell gib stattdessen seinen Namen ein.`,
    modelOk: 'Dieses nehmen',
    askKey: (name: string) => `Füg hier deinen API Key für ${name} ein. Abgerechnet wird nach Nutzung, also behalte die Tokens im Blick.`,
    keySend: 'Verbinden',
    keyLink: (name: string) => `Noch keinen Schlüssel? Hol dir einen bei ${name}`,
    keyLater: 'Später',
    connecting: 'Verbinde…',
    keyOk: (name: string, model: string) => `Mit ${name} verbunden${model ? ` (${model})` : ''}! Jetzt kann ich reden. Coo...`,
    keyFail: (why: string) => `Das hat nicht geklappt: ${why}. Ist der Schlüssel vollständig, und ist auf dem Konto noch Guthaben? Füg ihn noch einmal ein.`,
    keyAlready: (connection: string) => `Ein Modell ist schon verbunden (${connection}). Ganz einfach. Coo...`,
    keySkipped: 'Kein Problem; ich rede, sobald du ihn eingetragen hast. Ich frage später noch mal.',

    askModel: (name: string, mb: number) => `Um zu verstehen, was du sagst, muss ich ein Spracherkennungsmodell herunterladen (${name}, etwa ${mb} MB). Jetzt herunterladen?`,
    download: 'Herunterladen',
    notNow: 'Jetzt nicht',
    downloading: 'Lade das Sprachmodell herunter. Coo...',
    downloaded: 'Fertig! Jetzt verstehe ich, was du sagst.',
    downloadFail: (why: string) => `Der Download ist fehlgeschlagen: ${why}. Du kannst es auf der Seite Spracheingabe in den Einstellungen noch einmal versuchen.`,
    modelLater: 'Okay. Mit einem Klick auf der Seite Spracheingabe in den Einstellungen lädst du es später herunter.',
    talk: (hint: string) => `So redest du mit mir: ${hint}. `,
    talkOff: 'Die Spracheingabe ist gerade aus; du kannst sie auf der Seite Spracheingabe in den Einstellungen einschalten. ',
    talkType: 'Du kannst auch mit dem Mauszeiger auf mir bleiben und auf die Sprechblasen-Schaltfläche neben mir klicken, um zu tippen.',
    gotIt: 'Verstanden',
    buttons: 'Bleib mit dem Mauszeiger auf mir, dann erscheinen ein paar Schaltflächen neben mir; ein Rechtsklick auf mich öffnet das Menü mit Pause, Einstellungen und Beenden.',
    ok: 'OK',
    persona: 'Wie ich bin und wie ich rede, steht auf der Seite System-Prompt im Einstellungsfenster. Um mich zu ändern, bearbeite es dort, oder sag es mir einfach, dann ändere ich es selbst.',
    personaMark: 'System-Prompt',
    personaOk: 'Alles klar',
    finish: MAC
      ? 'Alles bereit! Mein Symbol ist auch in der Menüleiste; klick darauf, um Einstellungen zu ändern.'
      : process.platform === 'linux'
        ? 'Alles bereit! Um Einstellungen zu ändern, öffne mit einem Rechtsklick auf mich das Menü; wenn mein Symbol im Infobereich ist, geht auch ein Klick darauf.'
        : 'Alles bereit! Mein Symbol ist auch im Infobereich unten rechts in der Taskleiste; klick darauf, um Einstellungen zu ändern.',
    go: 'Los geht’s',
    dress: 'Zieh mich erst um',
    closed: 'Okay, hören wir hier auf. Um meine Einführung noch mal zu hören, öffne die Einstellungen und klick auf der Seite Start auf „Einführung“.',

    askFirst: 'Ich bin noch mit keinem Modell verbunden; sobald du einen API Key einträgst, kann ich reden. Welchen Dienst soll ich nutzen?',
    askAgain: 'Immer noch kein Modell verbunden; trag einen API Key ein, dann kann ich dir Gesellschaft leisten. Welchen Dienst soll ich nutzen?',
    askLater: 'Später',
    noModel: 'Kein Modell verbunden. Jetzt eins verbinden?',
    noModelGo: 'Verbinden',
    noModelLater: 'Später',
  },
};

export default de;
