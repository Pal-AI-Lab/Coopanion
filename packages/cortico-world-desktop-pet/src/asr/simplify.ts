/**
 * Converts recognition output to Simplified Chinese when `asr.simplified` is enabled and the app language is zh.
 * Characters with a distinct Traditional form are already Simplified and stay unchanged: converting
 * them with t2s would turn 什么 into 什幺. The `t` dictionary changes glyphs without replacing vocabulary.
 */
import * as OpenCC from 'opencc-js';

type Converter = (text: string) => string;

let t2s: Converter | null = null;
let s2t: Converter | null = null;
/** 逐字结论按字缓存:一句话里重复的字很多,转换器调用不便宜 */
const memo = new Map<string, string>();

function converters(): { t2s: Converter; s2t: Converter } {
  t2s ??= OpenCC.Converter({ from: 't', to: 'cn' });
  s2t ??= OpenCC.Converter({ from: 'cn', to: 't' });
  return { t2s, s2t };
}

function simplifyChar(ch: string): string {
  const hit = memo.get(ch);
  if (hit !== undefined) return hit;
  const { t2s: toS, s2t: toT } = converters();
  // 有另一个繁体形 = 它自己已经是简体,别动它
  const out = toT(ch) !== ch ? ch : toS(ch);
  memo.set(ch, out);
  return out;
}

export function toSimplified(text: string): string {
  if (!text) return text;
  // 全 ASCII 的句子没有可转的字,省掉一次遍历
  if (/^[\x00-\x7f]*$/.test(text)) return text;
  let out = '';
  for (const ch of text) out += simplifyChar(ch);
  return out;
}
