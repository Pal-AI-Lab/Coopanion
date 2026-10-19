/**
 * Hangul to IPA: each syllable block's initial, vowel and final consonant. A final before a syllable that starts
 * with ㅇ moves over to start it (국어 ku-gʌ); finals are otherwise read as the seven final sounds.
 */
import type { Ph } from './rules.ts';

const INITIAL = ['k', 'k͈', 'n', 't', 't͈', 'ɾ', 'm', 'p', 'p͈', 's', 's͈', '', 'tɕ', 'tɕ͈', 'tɕʰ', 'kʰ', 'tʰ', 'pʰ', 'h'];
const MEDIAL = ['a', 'ɛ', 'j a', 'j ɛ', 'ʌ', 'e', 'j ʌ', 'j e', 'o', 'w a', 'w ɛ', 'w e', 'j o', 'u', 'w ʌ', 'w e', 'w i', 'j u', 'ɯ', 'ɰ i', 'i'];
/** Each final as said before a consonant or at the end. */
const FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ŋ', 't', 't', 'k', 't', 'p', 't'];
/** Each final as the start of a following ㅇ syllable; '' = it does not move (ㅇ, ㅎ). */
const LINKED = ['', 'ɡ', 'k͈', 'k s', 'n', 'n dʑ', 'n', 'd', 'ɾ', 'l ɡ', 'l m', 'l b', 'l s', 'l tʰ', 'l pʰ', 'ɾ', 'm', 'b', 'p s', 's', 's͈', '', 'dʑ', 'tɕʰ', 'kʰ', 'tʰ', 'pʰ', ''];
const SILENT_INITIAL = 11;

/** A run of Hangul syllables starting at `start` in the text. */
export function hangulPhonemes(run: string, start: number): Ph[] {
  const out: Ph[] = [];
  const blocks = [...run].map((ch) => ch.codePointAt(0)! - 0xac00);
  let carried = '';
  blocks.forEach((s, k) => {
    const at = start + k;
    if (s < 0 || s > 11171) return;
    const ini = Math.floor(s / 588), med = Math.floor((s % 588) / 28), fin = s % 28;
    const onset = carried || INITIAL[ini]!;
    carried = '';
    for (const p of [onset, ...MEDIAL[med]!.split(' ')]) if (p) out.push({ p, at });
    const next = blocks[k + 1];
    if (fin && next !== undefined && Math.floor(next / 588) === SILENT_INITIAL && LINKED[fin]) {
      const parts = LINKED[fin]!.split(' ');
      carried = parts.pop()!;
      for (const p of parts) out.push({ p, at });
    } else if (fin) out.push({ p: FINAL[fin]!, at });
  });
  return out;
}
