/**
 * Spelling rules (rules.ts) of the languages written in Latin or Cyrillic letters, and where each puts the stress
 * of a word the rules leave unmarked. English reads its dictionary first (index.ts); its rules here read the words
 * the dictionary lacks.
 */
import { applyRules, type Ph, type RuleSet } from './rules.ts';
import { isVowel } from './ipa.ts';

const EN: RuleSet = {
  vowels: 'aeiouy',
  rules: [
    ['tion', 'ʃ ə n'], ['sion', 'ʒ ə n'], ['ture', 't ʃ ə'], ['igh', 'aɪ'], ['ough', 'ɔ'], ['augh', 'ɔ'], ['eigh', 'eɪ'],
    ['ee', 'i'], ['ea', 'i'], ['oo', 'u'], ['ou', 'aʊ'], ['ow', 'oʊ'], ['oa', 'oʊ'], ['ai', 'eɪ'], ['ay', 'eɪ'], ['oi', 'ɔɪ'], ['oy', 'ɔɪ'],
    ['au', 'ɔ'], ['aw', 'ɔ'], ['ew', 'j u'], ['ie(#', 'i'],
    ['ch', 'tʃ'], ['sh', 'ʃ'], ['th', 'θ'], ['ph', 'f'], ['wh', 'w'], ['ck', 'k'], ['ng(#', 'ŋ'], ['qu', 'k w'], ['#)kn', 'n'], ['#)wr', 'ɹ'],
    ['c([eiy]', 's'], ['c', 'k'], ['g([eiy]', 'dʒ'], ['g', 'ɡ'], ['x', 'k s'], ['j', 'dʒ'], ['y(A', 'j'], ['C)y(#', 'i'], ['y', 'ɪ'],
    ['a(Ce#', 'eɪ'], ['i(Ce#', 'aɪ'], ['o(Ce#', 'oʊ'], ['u(Ce#', 'j u'], ['e(Ce#', 'i'], ['AC)e(#', ''], ['AC)es(#', 'z'],
    ['a', 'æ'], ['e', 'ɛ'], ['i', 'ɪ'], ['o', 'ɑ'], ['u', 'ʌ'],
    ['b', 'b'], ['d', 'd'], ['f', 'f'], ['h', 'h'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['r', 'ɹ'], ['s', 's'],
    ['t', 't'], ['v', 'v'], ['w', 'w'], ['z', 'z'],
  ],
};

const ES: RuleSet = {
  vowels: 'aeiouáéíóúü',
  rules: [
    ['ch', 'tʃ'], ['ll', 'ʝ'], ['ñ', 'ɲ'], ['rr', 'r'], ['#)r', 'r'], ['r', 'ɾ'], ['qu([eiéí]', 'k'], ['gu([eiéí]', 'ɡ'], ['gü', 'ɡ w'],
    ['c([eiéí]', 's'], ['c', 'k'], ['z', 's'], ['g([eiéí]', 'x'], ['g', 'ɡ'], ['j', 'x'], ['h', ''], ['v', 'b'], ['x', 'k s'], ['y(#', 'i'], ['y', 'ʝ'],
    ['á', 'ˈ a'], ['é', 'ˈ e'], ['í', 'ˈ i'], ['ó', 'ˈ o'], ['ú', 'ˈ u'], ['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'], ['ü', 'u'],
    ['b', 'b'], ['d', 'd'], ['f', 'f'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['s', 's'], ['t', 't'], ['w', 'w'],
  ],
};

const IT: RuleSet = {
  vowels: 'aeiouàèéìíòóùú',
  rules: [
    ['ci([aouàòóù]', 'tʃ'], ['c([eièéì]', 'tʃ'], ['ch', 'k'], ['c', 'k'], ['gi([aouàòóù]', 'dʒ'], ['g([eièéì]', 'dʒ'], ['gh', 'ɡ'], ['gn', 'ɲ'],
    ['gli', 'ʎ'], ['g', 'ɡ'], ['sci([aouàòóù]', 'ʃ'], ['sc([eièéì]', 'ʃ'], ['qu', 'k w'], ['z', 'ts'], ['h', ''], ['r', 'r'], ['j', 'j'],
    ['à', 'ˈ a'], ['è', 'ˈ ɛ'], ['é', 'ˈ e'], ['ì', 'ˈ i'], ['í', 'ˈ i'], ['ò', 'ˈ ɔ'], ['ó', 'ˈ o'], ['ù', 'ˈ u'], ['ú', 'ˈ u'],
    ['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'],
    ['b', 'b'], ['d', 'd'], ['f', 'f'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['s', 's'], ['t', 't'], ['v', 'v'], ['w', 'w'],
    ['x', 'k s'], ['y', 'i'],
  ],
};

const PT: RuleSet = {
  vowels: 'aeiouáàâãéêíóôõú',
  rules: [
    ['lh', 'ʎ'], ['nh', 'ɲ'], ['ch', 'ʃ'], ['ão', 'ɐ̃'], ['ãe', 'ɐ̃'], ['õe', 'õ'], ['ã', 'ɐ̃'], ['õ', 'õ'], ['ç', 's'],
    ['c([eiéêí]', 's'], ['c', 'k'], ['qu([eiéêí]', 'k'], ['qu', 'k w'], ['gu([eiéêí]', 'ɡ'], ['g([eiéêí]', 'ʒ'], ['g', 'ɡ'], ['j', 'ʒ'],
    ['#)r', 'h'], ['rr', 'h'], ['r(#', 'h'], ['r', 'ɾ'], ['A)s(A', 'z'], ['x', 'ʃ'], ['h', ''], ['l(#', 'w'],
    ['d(i', 'dʒ'], ['d(es?#', 'dʒ'], ['t(i', 'tʃ'], ['t(es?#', 'tʃ'],
    ['am(#', 'ɐ̃'], ['an(C', 'ɐ̃'], ['em(#', 'ẽ'], ['en(C', 'ẽ'], ['im(#', 'ĩ'], ['in(C', 'ĩ'], ['om(#', 'õ'], ['on(C', 'õ'],
    ['um(#', 'ũ'], ['un(C', 'ũ'], ['e(s?#', 'i'], ['o(s?#', 'u'],
    ['á', 'ˈ a'], ['à', 'a'], ['â', 'ˈ ɐ'], ['é', 'ˈ ɛ'], ['ê', 'ˈ e'], ['í', 'ˈ i'], ['ó', 'ˈ ɔ'], ['ô', 'ˈ o'], ['ú', 'ˈ u'],
    ['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'],
    ['b', 'b'], ['d', 'd'], ['f', 'f'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['s', 's'], ['t', 't'], ['v', 'v'],
    ['w', 'w'], ['y', 'i'], ['z', 'z'],
  ],
};

const DE: RuleSet = {
  vowels: 'aeiouäöüy',
  rules: [
    ['tsch', 'tʃ'], ['sch', 'ʃ'], ['#)sp', 'ʃ p'], ['#)st', 'ʃ t'], ['chs', 'k s'], ['[aou])ch', 'x'], ['au)ch', 'x'], ['ch', 'ç'],
    ['ck', 'k'], ['qu', 'k v'], ['ph', 'f'], ['pf', 'pf'], ['th', 't'], ['tz', 'ts'], ['z', 'ts'], ['ß', 's'], ['v', 'f'], ['w', 'v'], ['j', 'j'],
    ['#)s(A', 'z'], ['A)s(A', 'z'], ['ei', 'aɪ'], ['ai', 'aɪ'], ['ey', 'aɪ'], ['ay', 'aɪ'], ['ie', 'iː'], ['eu', 'ɔʏ'], ['äu', 'ɔʏ'], ['au', 'aʊ'],
    ['ä', 'ɛ'], ['ö', 'ø'], ['ü', 'y'], ['y', 'y'], ['er(#', 'ɐ'], ['e(#', 'ə'], ['e(n#', 'ə'], ['A)h(C', ''], ['A)h(#', ''], ['h', 'h'],
    ['ig(#', 'ɪ ç'], ['b(#', 'p'], ['d(#', 't'], ['g(#', 'k'], ['g', 'ɡ'], ['A)r(#', 'ɐ'], ['r', 'ʁ'],
    ['a', 'a'], ['e', 'e'], ['i', 'ɪ'], ['o', 'o'], ['u', 'u'],
    ['b', 'b'], ['c', 'k'], ['d', 'd'], ['f', 'f'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['s', 's'], ['t', 't'], ['x', 'k s'],
  ],
};

const FR: RuleSet = {
  vowels: 'aeiouyàâäéèêëîïôöùûüÿœæ',
  rules: [
    ['eaux(#', 'o'], ['eau', 'o'], ['aux(#', 'o'], ['au', 'o'], ['oin', 'w ɛ̃'], ['oi', 'w a'], ['oy', 'w a j'], ['ou', 'u'], ['où', 'u'], ['oû', 'u'],
    ['aill', 'a j'], ['eill', 'ɛ j'], ['ouill', 'u j'], ['A)ill', 'j'], ['ill(e', 'i j'],
    ['ai', 'ɛ'], ['aî', 'ɛ'], ['ei', 'ɛ'], ['ay', 'ɛ j'], ['œu', 'ø'], ['eu', 'ø'], ['œ', 'œ'],
    ['ien([^aeiouyn]', 'j ɛ̃'], ['ien(#', 'j ɛ̃'],
    ['an([^aeiouyhnm]', 'ɑ̃'], ['an(#', 'ɑ̃'], ['am([^aeiouyhnm]', 'ɑ̃'], ['am(#', 'ɑ̃'], ['en([^aeiouyhnm]', 'ɑ̃'], ['en(#', 'ɑ̃'],
    ['em([^aeiouyhnm]', 'ɑ̃'], ['em(#', 'ɑ̃'], ['on([^aeiouyhnm]', 'ɔ̃'], ['on(#', 'ɔ̃'], ['om([^aeiouyhnm]', 'ɔ̃'], ['om(#', 'ɔ̃'],
    ['ain([^aeiouyhnm]', 'ɛ̃'], ['ain(#', 'ɛ̃'], ['ein([^aeiouyhnm]', 'ɛ̃'], ['ein(#', 'ɛ̃'], ['in([^aeiouyhnm]', 'ɛ̃'], ['in(#', 'ɛ̃'],
    ['im([^aeiouyhnm]', 'ɛ̃'], ['im(#', 'ɛ̃'], ['un([^aeiouyhnm]', 'œ̃'], ['un(#', 'œ̃'], ['um(#', 'œ̃'],
    ['tion', 's j ɔ̃'], ['ui', 'ɥ i'], ['ch', 'ʃ'], ['gn', 'ɲ'], ['qu', 'k'], ['gu([eiyéèê]', 'ɡ'], ['ç', 's'], ['c([eiyéèê]', 's'], ['c', 'k'],
    ['g([eiyéèê]', 'ʒ'], ['g', 'ɡ'], ['j', 'ʒ'], ['ph', 'f'], ['th', 't'], ['h', ''], ['A)s(A', 'z'], ['x(#', ''], ['x', 'k s'], ['r', 'ʁ'], ['w', 'w'],
    ['#C)e(#', 'ə'], ['qu)e(#', 'ə'], ['e(#', ''], ['e(s#', ''], ['er(#', 'e'], ['ez(#', 'e'], ['et(#', 'ɛ'],
    ['d(#', ''], ['t(#', ''], ['s(#', ''], ['z(#', ''], ['p(#', ''], ['g(#', ''],
    ['é', 'e'], ['è', 'ɛ'], ['ê', 'ɛ'], ['ë', 'ɛ'], ['e(CC', 'ɛ'], ['e', 'ə'], ['a', 'a'], ['à', 'a'], ['â', 'a'], ['i', 'i'], ['î', 'i'], ['ï', 'i'],
    ['o', 'o'], ['ô', 'o'], ['u', 'y'], ['û', 'y'], ['ù', 'y'], ['y', 'i'],
    ['b', 'b'], ['d', 'd'], ['f', 'f'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['s', 's'], ['t', 't'], ['v', 'v'], ['z', 'z'],
  ],
};

const RU: RuleSet = {
  vowels: 'аеёиоуыэюя',
  rules: [
    ['#)е', 'j e'], ['[аеёиоуыэюяьъ])е', 'j e'], ['е', 'ʲ e'], ['#)ё', 'j o'], ['[аеёиоуыэюяьъ])ё', 'j o'], ['ё', 'ʲ o'],
    ['#)ю', 'j u'], ['[аеёиоуыэюяьъ])ю', 'j u'], ['ю', 'ʲ u'], ['#)я', 'j a'], ['[аеёиоуыэюяьъ])я', 'j a'], ['я', 'ʲ a'],
    ['а', 'a'], ['о', 'o'], ['у', 'u'], ['ы', 'ɨ'], ['э', 'e'], ['и', 'i'],
    ['б', 'b'], ['в', 'v'], ['г', 'ɡ'], ['д', 'd'], ['ж', 'ʐ'], ['з', 'z'], ['й', 'j'], ['к', 'k'], ['л', 'l'], ['м', 'm'], ['н', 'n'],
    ['п', 'p'], ['р', 'r'], ['с', 's'], ['т', 't'], ['ф', 'f'], ['х', 'x'], ['ц', 'ts'], ['ч', 'tɕ'], ['ш', 'ʂ'], ['щ', 'ɕː'], ['ь(A', 'ʲ'],
    ['ь', ''], ['ъ', ''],
  ],
};

/** Which vowel of a word without a marked stress carries it. */
type StressRule = (vowels: number, phs: readonly Ph[]) => number | null;
const PENULT: StressRule = (n) => (n > 1 ? n - 2 : 0);
const STRESS: Record<string, StressRule> = {
  en: () => 0,
  de: () => 0,
  fr: (n) => n - 1,
  it: PENULT,
  // Spanish: the last syllable when the word ends in a consonant other than n or s
  es: (n, phs) => { const last = phs.at(-1)?.p ?? ''; return isVowel(last) || last === 'n' || last === 's' ? PENULT(n, phs) : n - 1; },
  // Portuguese: the last syllable when the word ends in r, l, z, i, u or a nasal vowel
  pt: (n, phs) => (/^(ɾ|h|w|z|i|u)$|̃/.test(phs.at(-1)?.p ?? '') ? n - 1 : PENULT(n, phs)),
  ru: () => null,
};

export const RULES: Record<string, RuleSet> = { en: EN, es: ES, it: IT, pt: PT, de: DE, fr: FR, ru: RU };

/** Languages whose unstressed i and u next to another vowel are glides: before it j and w, after it a diphthong. */
const GLIDING = new Set(['es', 'it', 'pt']);

function glides(phs: Ph[]): Ph[] {
  const out: Ph[] = [];
  for (let i = 0; i < phs.length; i++) {
    const { p, at } = phs[i]!;
    const weak = (p === 'i' || p === 'u') && phs[i - 1]?.p !== 'ˈ';
    const prev = out.at(-1), next = phs[i + 1];
    if (weak && next && isVowel(next.p)) { out.push({ p: p === 'i' ? 'j' : 'w', at }); continue; }
    if (weak && prev && isVowel(prev.p) && prev.p.length === 1) { prev.p += p; continue; }
    out.push({ p, at });
  }
  return out;
}

/** `word` (lower case) in `lang` (a key of RULES) to phonemes, its stress marked. */
export function spell(word: string, lang: string): Ph[] {
  let phs = applyRules(word, RULES[lang] ?? EN);
  if (GLIDING.has(lang)) phs = glides(phs);
  if (phs.some((p) => p.p === 'ˈ')) return phs;
  const vowels = phs.map((p, i) => (isVowel(p.p) ? i : -1)).filter((i) => i >= 0);
  const k = (STRESS[lang] ?? STRESS.en!)(vowels.length, phs);
  if (k === null || vowels[k] === undefined) return phs;
  const at = vowels[k]!;
  return [...phs.slice(0, at), { p: 'ˈ', at: phs[at]!.at }, ...phs.slice(at)];
}
