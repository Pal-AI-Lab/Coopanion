/**
 * IPA phonemes to syllables. One syllable per vowel: its initial is the consonant before it (after a stop, a
 * liquid keeps the stop: `pl`, `tr`), a glide (`j`, `w`, a palatalized consonant) between them is its glide, and a
 * nasal after it that no vowel follows is its coda. Other consonants after a vowel are not spoken.
 */
import type { Ph } from './rules.ts';
import type { Coda, Nucleus, Syllable } from './syllable.ts';

const TILDE = '̃';
/** Marks that do not change which initial or nucleus a phoneme takes: length, aspiration, tenseness, ties. */
const MARKS = /[ːˑʰ͈̞̝̹̜̩̯͜͡‍]/g;

/** A consonant as the initial it sounds nearest; a glide-making one has `glide`. */
const CONSONANTS: Record<string, { c: string; glide?: 'i' | 'u' }> = {
  p: { c: 'p' }, b: { c: 'b' }, t: { c: 't' }, d: { c: 'd' }, k: { c: 'k' }, ɡ: { c: 'g' }, g: { c: 'g' }, q: { c: 'k' }, ʔ: { c: '' },
  f: { c: 'f' }, ɸ: { c: 'f' }, v: { c: 'w' }, β: { c: 'w' }, ʋ: { c: 'w' }, θ: { c: 's' }, ð: { c: 'd' }, s: { c: 's' }, z: { c: 'z' },
  ʃ: { c: 'sh' }, ʂ: { c: 'sh' }, ʒ: { c: 'r' }, ʐ: { c: 'r' }, ɕ: { c: 'x' }, ʑ: { c: 'x' }, ç: { c: 'x' }, x: { c: 'h' }, χ: { c: 'h' },
  h: { c: 'h' }, ɦ: { c: 'h' }, ʁ: { c: 'h' }, ʀ: { c: 'l' }, m: { c: 'm' }, n: { c: 'n' }, ŋ: { c: 'n' }, l: { c: 'l' }, ɫ: { c: 'l' },
  ɭ: { c: 'l' }, r: { c: 'l' }, ɾ: { c: 'l' }, ɹ: { c: 'r' }, tʃ: { c: 'ch' }, dʒ: { c: 'zh' }, ts: { c: 'c' }, dz: { c: 'z' },
  tɕ: { c: 'q' }, dʑ: { c: 'j' }, pf: { c: 'f' }, ɲ: { c: 'n', glide: 'i' }, ʎ: { c: 'l', glide: 'i' },
};
const GLIDES: Record<string, 'i' | 'u'> = { j: 'i', ʝ: 'i', ɥ: 'i', ʲ: 'i', w: 'u', ɰ: 'u' };
const LIQUIDS = new Set(['l', 'r', 'h']);
const NASAL_CODA: Record<string, Coda> = { n: 'n', m: 'n', ŋ: 'ng', ɴ: 'ng', N: 'n' };

/** A vowel (marks removed) as a nucleus; diphthongs first. */
const VOWELS: Array<[string, Nucleus]> = [
  ['aɪ', 'ai'], ['ai', 'ai'], ['äi', 'ai'], ['ɑɪ', 'ai'], ['aj', 'ai'], ['aʊ', 'ao'], ['au', 'ao'], ['ɑʊ', 'ao'], ['eɪ', 'ei'], ['ei', 'ei'],
  ['ɛɪ', 'ei'], ['oʊ', 'ou'], ['əʊ', 'ou'], ['ou', 'ou'], ['ɔɪ', 'ou'], ['ɔʏ', 'ou'], ['oi', 'ou'],
  ['a', 'a'], ['ä', 'a'], ['ɐ', 'a'], ['ɑ', 'a'], ['æ', 'a'], ['ɒ', 'a'], ['e', 'ei'], ['ɛ', 'ei'], ['ə', 'e'], ['ʌ', 'e'], ['ɜ', 'e'],
  ['ɝ', 'e'], ['ɚ', 'e'], ['ɘ', 'e'], ['ɤ', 'e'], ['ø', 'e'], ['œ', 'e'], ['ɵ', 'e'], ['i', 'i'], ['ɪ', 'i'], ['ɨ', 'i'],
  ['o', 'o'], ['ɔ', 'o'], ['u', 'u'], ['ʊ', 'u'], ['ɯ', 'u'], ['ʉ', 'u'], ['y', 'v'], ['ʏ', 'v'],
];
const VOWEL_CHARS = new Set('aäɐɑæɒeɛəʌɜɝɚɘɤøœɵiɪɨoɔuʊɯʉyʏ');
/** A nasal vowel's nucleus and coda: French vin and un sound nearest an, the others take -ng. */
const NASAL_VOWEL: Record<string, [Nucleus, Coda]> = {
  ɛ: ['a', 'n'], œ: ['a', 'n'], e: ['ei', 'n'], i: ['i', 'n'], u: ['u', 'n'], ɑ: ['a', 'ng'], a: ['a', 'ng'], ɐ: ['a', 'ng'],
  ɔ: ['o', 'ng'], o: ['o', 'ng'],
};

/** A phoneme without its length, aspiration and other marks; precomposed letters (ẽ, õ) split into letter and tilde. */
const bareOf = (p: string) => p.normalize('NFD').replace(MARKS, '');
export const isVowel = (p: string) => VOWEL_CHARS.has(bareOf(p)[0] ?? '');

function vowel(p: string): [Nucleus, Coda] {
  const bare = bareOf(p);
  if (bare.includes(TILDE)) {
    const base = bare.replace(TILDE, '')[0] ?? 'a';
    return NASAL_VOWEL[base] ?? ['a', 'ng'];
  }
  for (const [v, n] of VOWELS) if (bare.startsWith(v)) return [n, ''];
  return ['e', ''];
}

/** IPA phonemes (`ˈ` before a stressed vowel) to syllables. */
export function ipaSyllables(phs: readonly Ph[]): Syllable[] {
  const out: Syllable[] = [];
  let onset: { c: string; at: number } | null = null, glide: { g: 'i' | 'u'; at: number } | null = null, stress = false;
  // the next phoneme after `i` that is not a stress mark
  const after = (i: number) => { let j = i + 1; while (phs[j] && (phs[j]!.p === 'ˈ' || phs[j]!.p === 'ˌ')) j++; return j; };
  for (let i = 0; i < phs.length; i++) {
    const { p, at } = phs[i]!;
    if (p === 'ˈ') { stress = true; continue; }
    if (p === 'ˌ') continue;
    if (isVowel(p)) {
      let [nucleus, coda] = vowel(p);
      const n = after(i), next = phs[n] && bareOf(phs[n]!.p), beyond = phs[after(n)];
      if (!coda && next && NASAL_CODA[next] && !(beyond && isVowel(beyond.p))) { coda = NASAL_CODA[next]!; i = n; }
      out.push({ at: onset?.at ?? glide?.at ?? at, initial: onset?.c ?? '', glide: glide?.g ?? '', nucleus, coda, stress });
      onset = null; glide = null; stress = false;
      continue;
    }
    const bare = bareOf(p);
    if (GLIDES[bare] && (bare === 'ʲ' || (phs[after(i)] && isVowel(phs[after(i)]!.p)))) { glide = { g: GLIDES[bare]!, at: onset?.at ?? at }; continue; }
    const c = CONSONANTS[bare] ?? CONSONANTS[bare[0] ?? ''];
    if (!c) continue;
    // a stop followed by a liquid keeps the stop
    if (onset && onset.c && LIQUIDS.has(c.c) && !LIQUIDS.has(onset.c)) continue;
    onset = { c: c.c, at };
    glide = c.glide ? { g: c.glide, at } : null;
  }
  return out;
}
