/**
 * The syllables a bubble's text is spoken as, for the pet page's speech (web/speech.js). Text goes to IPA the way
 * eSpeak NG does it, by dictionary and spelling rules per language, and each IPA syllable is played as the bank
 * syllable nearest it (syllable.ts):
 *
 * - Han characters: Mandarin, by each character's most common reading and tone (data/zh.json); Japanese
 *   instead in a sentence with kana, or when the app speaks Japanese.
 * - Kana and kanji: japanese.ts; Hangul: korean.ts; Cyrillic letters: Russian rules (lang.ts).
 * - Latin letters: the rules of the app language when it is written in them, English otherwise; English words
 *   by the CMU Pronouncing Dictionary first (data/en.tsv.gz).
 * - Digits: their Mandarin names.
 *
 * The dictionaries load the first time a text needs them.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { readTextFile } from 'cortico/core/util.ts';
import { ipaSyllables } from './ipa.ts';
import { japanesePhonemes, isKana, isKanji, type JapaneseReadings } from './japanese.ts';
import { JUKUJIKUN } from './jukujikun.ts';
import { hangulPhonemes } from './korean.ts';
import { spell } from './lang.ts';
import type { Ph } from './rules.ts';
import { bankKey, type Syllable } from './syllable.ts';

/**
 * One unit the page plays: `at` is the UTF-16 index of the character whose reveal starts it, `key` a bank syllable,
 * `tone` 1-5 for a Mandarin syllable (0 none), `stress` a stressed syllable, `weak` one the voice may drop when
 * behind; `pos` of `of` places it in its phrase, `end` is the marks that close the phrase.
 */
export interface SpeechUnit {
  at: number; key: string; tone: number; stress: boolean; weak: boolean; pos: number; of: number; end: string;
}

/** The app languages written in Latin letters, by the rules they read with. */
const LATIN_RULES: Record<string, string> = { fr: 'fr', de: 'de', 'es-419': 'es', 'pt-BR': 'pt', it: 'it' };
const WEAK = new Set('的了吗呢啊呀吧哦啦么着过');
const DIGITS = ['ling', 'yi', 'er', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu'];
const MARKS = /[,.!?;:…~，。！？；：、～]/;
const SENTENCE = /[。！？!?\n]/;
const ARPA: Record<string, string> = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', IH: 'ɪ', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'ɹ', S: 's',
  SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
/** Typing steps (1/20 s) a character takes in the bubble while speech is on, as TEXT_PAUSE and textSteps in web/speech.js. */
const TEXT_PAUSE: Record<string, number> = {
  ',': 5, '，': 5, '、': 5, ';': 6, '；': 6, ':': 6, '：': 6,
  '.': 9, '。': 9, '!': 9, '！': 9, '?': 9, '？': 9, '…': 4, '~': 3, '～': 3,
};
const LETTER_STEP = .4;
const ALPHABET = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\s'’-]/u;
export function speechTextSteps(ch: string): number {
  return TEXT_PAUSE[ch] ?? (ALPHABET.test(ch) ? LETTER_STEP : 1);
}

/** The longest Japanese dictionary word tried. */
const JA_LONGEST = 8;

type Item = { at: number; key: string; tone: number; stress: boolean; weak: boolean };

export class SpeechText {
  private bank: Set<string> | null = null;
  private zh: Map<string, [string, number]> | null = null;
  private en: Map<string, string> | null = null;
  private ja: JapaneseReadings | null = null;

  /** `dataDir`: src/speech/data; `bankFile`: the bank's manifest (web/speech/zh.json). */
  constructor(private readonly dataDir: string, private readonly bankFile: string) {}

  private has = (key: string) => {
    this.bank ??= new Set(Object.keys((JSON.parse(readTextFile(this.bankFile)) as { units: Record<string, unknown> }).units));
    return this.bank.has(key);
  };
  private tsv(name: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const line of gunzipSync(readFileSync(join(this.dataDir, name))).toString('utf8').split(/\r?\n/)) {
      const tab = line.indexOf('\t');
      if (tab > 0) map.set(line.slice(0, tab), line.slice(tab + 1));
    }
    return map;
  }
  private han(ch: string): [string, number] | undefined {
    if (!this.zh) {
      this.zh = new Map();
      const table = JSON.parse(readTextFile(join(this.dataDir, 'zh.json'))) as Record<string, string>;
      for (const [k, chars] of Object.entries(table)) for (const c of chars) this.zh.set(c, [k.slice(0, -1), Number(k.slice(-1))]);
    }
    return this.zh.get(ch);
  }

  /** Japanese readings: the Jōyō appendix's words, then IPADIC's (data/ja-ipadic.tsv.gz), then Unihan's per kanji (data/ja-unihan.tsv.gz). */
  private japanese(): JapaneseReadings {
    if (!this.ja) {
      const words = this.tsv('ja-ipadic.tsv.gz'), kanji = this.tsv('ja-unihan.tsv.gz');
      this.ja = {
        word: (w) => JUKUJIKUN[w] ?? words.get(w),
        longest: JA_LONGEST,
        kanji: (k) => {
          const v = kanji.get(k);
          if (v === undefined) return undefined;
          const [on = '', kun = ''] = v.split('|');
          return { on: on ? on.split(',') : [], kun: kun ? kun.split(',') : [] };
        },
      };
    }
    return this.ja;
  }

  private keyed(syllables: Syllable[], out: Item[]): void {
    for (const s of syllables) {
      const key = bankKey(s, this.has);
      if (key) out.push({ at: s.at, key, tone: 0, stress: s.stress, weak: false });
    }
  }

  /** An English word starting at `at` in the text: its dictionary pronunciation, else the spelling rules. */
  private english(word: string, at: number): Ph[] {
    this.en ??= this.tsv('en.tsv.gz');
    const arpa = this.en.get(word.toLowerCase());
    if (!arpa) return offset(spell(word.toLowerCase(), 'en'), at);
    const phones = arpa.split(' ');
    const out: Ph[] = [];
    phones.forEach((a, k) => {
      const where = at + Math.floor((k * word.length) / phones.length);
      const base = a.replace(/\d$/, '');
      if (a.endsWith('1')) out.push({ p: 'ˈ', at: where });
      // an unstressed AH is the schwa
      out.push({ p: base === 'AH' && a.endsWith('0') ? 'ə' : ARPA[base] ?? '', at: where });
    });
    return out.filter((p) => p.p);
  }

  /** The units `text` is spoken as, in `language` (the app's). */
  units(text: string, language: string): SpeechUnit[] {
    const items: Item[] = [];
    const latin = LATIN_RULES[language] ?? 'en';
    // Han characters read as Japanese: in a sentence with kana, or all of them when the app speaks Japanese
    const japaneseAt = new Set<number>();
    let from = 0;
    for (let i = 0; i <= text.length; i++) {
      if (i < text.length && !SENTENCE.test(text[i]!)) continue;
      const sentence = text.slice(from, i);
      if (language === 'ja' || [...sentence].some(isKana)) for (let k = from; k < i; k++) japaneseAt.add(k);
      from = i + 1;
    }
    let i = 0;
    while (i < text.length) {
      const ch = text[i]!;
      const runOf = (test: (c: string) => boolean) => { let j = i; while (j < text.length && test(text[j]!)) j++; return j; };
      if (isKana(ch) || (isKanji(ch) && japaneseAt.has(i))) {
        const j = runOf((c) => isKana(c) || isKanji(c));
        this.keyed(ipaSyllables(japanesePhonemes(text.slice(i, j), i, this.japanese())), items);
        i = j; continue;
      }
      if (isKanji(ch)) {
        const h = this.han(ch);
        if (h && this.has(h[0])) items.push({ at: i, key: h[0], tone: h[1], stress: false, weak: WEAK.has(ch) });
        i++; continue;
      }
      if (/[가-힣]/.test(ch)) {
        const j = runOf((c) => /[가-힣]/.test(c));
        this.keyed(ipaSyllables(hangulPhonemes(text.slice(i, j), i)), items);
        i = j; continue;
      }
      if (/\p{Script=Cyrillic}/u.test(ch)) {
        const j = runOf((c) => /\p{Script=Cyrillic}/u.test(c));
        this.keyed(ipaSyllables(offset(spell(text.slice(i, j).toLowerCase(), 'ru'), i)), items);
        i = j; continue;
      }
      if (/\p{Script=Latin}/u.test(ch)) {
        const j = runOf((c) => /[\p{Script=Latin}']/u.test(c));
        const word = text.slice(i, j).replace(/'+$/, '');
        this.keyed(ipaSyllables(latin === 'en' ? this.english(word, i) : offset(spell(word.toLowerCase(), latin), i)), items);
        i = j; continue;
      }
      if (/[0-9]/.test(ch)) items.push({ at: i, key: DIGITS[Number(ch)]!, tone: 0, stress: false, weak: false });
      i++;
    }
    return phrases(text, items);
  }
}

/** Rule phonemes count letters from the word's start; moved to the text's. */
function offset(phs: Ph[], start: number): Ph[] {
  return phs.map((p) => ({ p: p.p, at: p.at + start }));
}

/** Each unit's place in its phrase (the units between pause marks) and the marks that close it. */
function phrases(text: string, items: Item[]): SpeechUnit[] {
  items.sort((a, b) => a.at - b.at);
  const out: SpeechUnit[] = [];
  let start = 0;
  for (let u = 0; u <= items.length; u++) {
    const prev = u > 0 ? items[u - 1]!.at : -1, next = u < items.length ? items[u]!.at : text.length;
    const between = text.slice(prev + 1, next);
    if (u < items.length && !MARKS.test(between)) continue;
    const end = u === items.length ? (text.slice(prev + 1).match(/[.!?…~。！？～]+/)?.[0] ?? '。') : between.replace(/[^,.!?;:…~，。！？；：、～]/g, '');
    for (let k = start; k < u; k++) out.push({ ...items[k]!, pos: k - start, of: u - start, end });
    start = u;
  }
  return out;
}
