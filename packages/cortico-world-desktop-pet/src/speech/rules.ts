/**
 * Spelling to phonemes by rules, the way eSpeak NG's `<lang>_rules` work: a rule reads one group of letters in
 * its left and right context and gives the phonemes they stand for. At each letter the longest group that has a
 * rule matching there wins; among rules of the same group the first listed that matches. A rule is written
 * `left)group(right`, either context optional:
 *
 * - `#` the word's edge, `A` a vowel letter, `C` a consonant letter, `[...]` one of those letters, any other letter itself.
 * - The phonemes are IPA, one per space-separated token; `ˈ` before a vowel marks it stressed; no token = silent.
 *
 * A consonant letter written twice reads once unless a rule takes the pair.
 */

/** A phoneme with the index (in the word) of the first letter it came from. */
export interface Ph { p: string; at: number }

export interface RuleSet {
  vowels: string;
  rules: ReadonlyArray<readonly [pattern: string, phonemes: string]>;
}

interface Compiled { group: string; re: RegExp; out: string[] }

const cache = new WeakMap<RuleSet, { byFirst: Map<string, Compiled[]>; vowels: Set<string> }>();

function compile(set: RuleSet) {
  let hit = cache.get(set);
  if (hit) return hit;
  const v = escapeClass(set.vowels);
  const ctx = (s: string, left: boolean) => s.replace(/\[[^\]]*\]|./gu, (t) =>
    t === '#' ? (left ? '^' : '$') : t === 'A' ? `[${v}]` : t === 'C' ? `[^${v}\\P{L}]` : t.startsWith('[') ? t : escapeChar(t));
  const byFirst = new Map<string, Compiled[]>();
  for (const [pattern, phonemes] of set.rules) {
    const m = /^(?:(.*)\))?([^()]+)(?:\((.*))?$/u.exec(pattern);
    if (!m) throw new Error(`bad rule ${pattern}`);
    const [, left = '', group = '', right = ''] = m;
    const re = new RegExp(`${left ? `(?<=${ctx(left, true)})` : ''}${escapeChar(group)}${right ? `(?=${ctx(right, false)})` : ''}`, 'uy');
    const first = group[0]!;
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first)!.push({ group, re, out: phonemes.split(' ').filter(Boolean) });
  }
  // longest group first; a stable sort keeps the listed order within a length
  for (const list of byFirst.values()) list.sort((a, b) => b.group.length - a.group.length);
  hit = { byFirst, vowels: new Set(set.vowels) };
  cache.set(set, hit);
  return hit;
}

const escapeChar = (s: string) => s.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
const escapeClass = (s: string) => s.replace(/[\\\]^-]/g, '\\$&');

/** `word` (lower case) to phonemes. A letter no rule reads is skipped. */
export function applyRules(word: string, set: RuleSet): Ph[] {
  const { byFirst, vowels } = compile(set);
  const out: Ph[] = [];
  let i = 0, prev = '';
  while (i < word.length) {
    const ch = word[i]!;
    if (ch === prev && !vowels.has(ch) && /\p{L}/u.test(ch)) { i++; prev = ''; continue; }
    let done = false;
    for (const r of byFirst.get(ch) ?? []) {
      r.re.lastIndex = i;
      if (!r.re.test(word)) continue;
      for (const p of r.out) out.push({ p, at: i });
      prev = r.group.length === 1 ? ch : '';
      i += r.group.length;
      done = true;
      break;
    }
    if (!done) { i++; prev = ''; }
  }
  return out;
}
