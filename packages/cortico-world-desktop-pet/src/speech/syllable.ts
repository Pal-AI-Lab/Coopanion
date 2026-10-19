/**
 * Syllables as the speech bank holds them: every language's syllable (from its IPA, ipa.ts) is spoken as one
 * toneless Mandarin syllable of web/speech/zh.json, spelled from pinyin's pieces: an initial (`b`..`s` or none),
 * a glide (`i`, `u` or none), a nucleus and a nasal coda.
 */

/** A vowel nucleus, by pinyin final: `e` is a central vowel (ə, ʌ), `ei` a front mid one (e, ɛ), `v` is ü. */
export type Nucleus = 'a' | 'ai' | 'ao' | 'e' | 'ei' | 'i' | 'o' | 'ou' | 'u' | 'v';
export type Glide = '' | 'i' | 'u';
export type Coda = '' | 'n' | 'ng';

/** A syllable to speak: `at` is the index of the character whose reveal starts it. */
export interface Syllable {
  at: number;
  initial: string;
  glide: Glide;
  nucleus: Nucleus;
  coda: Coda;
  stress: boolean;
}

const RHYME: Record<Nucleus, Record<Coda, string>> = {
  // a diphthong keeps its glide over a nasal after it: I'm is ai, not an
  a: { '': 'a', n: 'an', ng: 'ang' }, ai: { '': 'ai', n: 'ai', ng: 'ai' }, ao: { '': 'ao', n: 'ao', ng: 'ao' },
  e: { '': 'e', n: 'en', ng: 'eng' }, ei: { '': 'ei', n: 'en', ng: 'eng' }, i: { '': 'i', n: 'in', ng: 'ing' },
  o: { '': 'o', n: 'ong', ng: 'ong' }, ou: { '': 'ou', n: 'ou', ng: 'ou' }, u: { '': 'u', n: 'un', ng: 'ong' },
  v: { '': 'v', n: 'vn', ng: 'iong' },
};
/** A rhyme after a glide, in pinyin's spelling after an initial. */
const AFTER_I: Record<string, string> = {
  a: 'ia', an: 'ian', ang: 'iang', ao: 'iao', ai: 'ia', e: 'ie', ei: 'ie', en: 'in', eng: 'ing', o: 'iu', ou: 'iu', ong: 'iong',
  u: 'iu', un: 'in', i: 'i', in: 'in', ing: 'ing', v: 'v', vn: 'vn', iong: 'iong',
};
const AFTER_U: Record<string, string> = {
  a: 'ua', an: 'uan', ang: 'uang', ai: 'uai', ao: 'uo', e: 'uo', ei: 'ui', en: 'un', eng: 'ong', o: 'uo', ou: 'uo', ong: 'ong',
  i: 'ui', in: 'un', ing: 'ong', u: 'u', un: 'un', v: 'v', vn: 'vn', iong: 'iong',
};
/** Initials that cannot take an i-final, and the palatal one each sounds like before i. */
const PALATAL: Record<string, string> = { k: 'q', g: 'j', h: 'x', s: 'x', sh: 'x', z: 'j', zh: 'j', c: 'q', ch: 'q' };

/** A final with no initial, as pinyin writes it. */
function bare(f: string): string {
  if (f === 'i' || f === 'in' || f === 'ing') return 'y' + f;
  if (f === 'u') return 'wu';
  if (f === 'v') return 'yu';
  if (f === 'vn') return 'yun';
  if (f === 'iu') return 'you';
  if (f === 'ui') return 'wei';
  if (f === 'un') return 'wen';
  if (f === 'ong') return 'weng';
  if (f.startsWith('i')) return 'y' + f.slice(1);
  if (f.startsWith('u')) return 'w' + f.slice(1);
  return f;
}

/** The bank syllable nearest `s`; `has` says which syllables the bank holds. */
export function bankKey(s: Pick<Syllable, 'initial' | 'glide' | 'nucleus' | 'coda'>, has: (key: string) => boolean): string | null {
  const rhyme = RHYME[s.nucleus][s.coda];
  let c = s.initial, glide = s.glide;
  // w and y are glides in pinyin, not initials
  if ((c === 'w' || c === 'y') && !glide) { glide = c === 'w' ? 'u' : 'i'; c = ''; }
  let f = glide === 'i' ? AFTER_I[rhyme] ?? rhyme : glide === 'u' ? AFTER_U[rhyme] ?? rhyme : rhyme;
  if (f.startsWith('i') && PALATAL[c]) c = PALATAL[c]!;
  // ü is written u after j, q, x; after any other initial but n and l it is u
  if (f.startsWith('v') && c && c !== 'n' && c !== 'l') f = 'u' + f.slice(1);
  // j, q, x take only i- and ü-finals
  if ((c === 'j' || c === 'q' || c === 'x') && !f.startsWith('i') && !f.startsWith('u')) f = AFTER_I[f] ?? 'i' + f;
  const join = (i: string, fin: string) => (i ? i + fin : bare(fin));
  const plain = RHYME[s.nucleus][''];
  // nearest first: the same rhyme (ko as kuo, de as dei), then the same coda after another vowel (bong as beng),
  // then the vowel alone
  const nasal = s.coda ? [RHYME.e[s.coda], RHYME.a[s.coda], RHYME.u[s.coda]] : [];
  const tries = [join(c, f), join(c, rhyme), c && join(c, 'u' + plain), c && join(c, plain + 'i'), ...nasal.map((r) => c && join(c, r)),
    join(c, plain), c && join(c, 'e'), c && join(c, 'u'), c && join(c, 'a'), bare(f), bare(rhyme), 'a'];
  return tries.find((k) => k && has(k)) ?? null;
}
