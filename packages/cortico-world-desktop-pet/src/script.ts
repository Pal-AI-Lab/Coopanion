/**
 * Speech scripts for the pet's bubble. Markers name expressions and motions:
 *
 * - `【a, b】` blocking: runs the words, then starts a new bubble with the text after it.
 * - `<a, b>` inline: runs the words when typing reaches that point, without a new bubble.
 *
 * Words are English ids or their Chinese names (`VOCAB`); unknown words are dropped and
 * reported back. An inline marker longer than `INLINE_TAG_MAX` or spanning a line is text.
 */

export interface VocabEntry {
  id: string;
  kind: 'expression' | 'motion';
  zh: string[];
  note: string;
}

export const VOCAB: readonly VocabEntry[] = [
  { id: 'neutral', kind: 'expression', zh: ['平静'], note: '默认的脸' },
  { id: 'happy', kind: 'expression', zh: ['开心', '高兴'], note: '眼睛弯成 ^ ^' },
  { id: 'wink', kind: 'expression', zh: ['眨眼'], note: '一只眼 ^' },
  { id: 'love', kind: 'expression', zh: ['喜欢', '爱心'], note: '眼睛变心形,冒小心心' },
  { id: 'shy', kind: 'expression', zh: ['害羞', '偷看'], note: '脸红低头躲开,过一会儿偷偷抬眼看你' },
  { id: 'surprised', kind: 'expression', zh: ['惊讶', '吃惊'], note: '眼睛放大,头顶感叹号' },
  { id: 'angry', kind: 'expression', zh: ['生气'], note: '皱眉,头顶怒气符号,身体发抖' },
  { id: 'sad', kind: 'expression', zh: ['难过', '伤心', '委屈', '失落'], note: '八字眉,低头看地,垂头丧气,掉眼泪' },
  { id: 'sleepy', kind: 'expression', zh: ['犯困', '困'], note: '眯眼打哈欠' },
  { id: 'thinking', kind: 'expression', zh: ['思考', '想想'], note: '眼睛往上看,头顶冒圈' },
  { id: 'smug', kind: 'expression', zh: ['得意', '嘚瑟'], note: '眯眼斜看,嘴角带笑' },
  { id: 'pout', kind: 'expression', zh: ['嘟嘴', '哼'], note: '嘴嘟起来,脸红,扭头不看你' },
  { id: 'worried', kind: 'expression', zh: ['担心', '着急'], note: '八字眉,冒冷汗' },
  { id: 'determined', kind: 'expression', zh: ['认真', '坚定'], note: '眼神压低,一脸认真' },
  { id: 'flustered', kind: 'expression', zh: ['慌张', '窘'], note: '眼睛变成 > <,满脸通红冒汗' },
  { id: 'scared', kind: 'expression', zh: ['害怕', '吓到'], note: '眼睛瞪大,冒汗,身体发抖' },
  { id: 'excited', kind: 'expression', zh: ['期待', '星星眼'], note: '眼睛里闪着星星' },
  { id: 'cry', kind: 'expression', zh: ['大哭', '哭'], note: '闭眼大哭,眼泪直流' },
  { id: 'confused', kind: 'expression', zh: ['疑惑', '问号'], note: '一脸不解,头顶问号' },
  { id: 'disgusted', kind: 'expression', zh: ['嫌弃', '无语'], note: '半眯眼斜看,身子往后仰,额头三道黑线' },
  { id: 'nervous', kind: 'expression', zh: ['紧张', '忐忑'], note: '眼神乱瞟,冒汗,身子绷紧,时不时抖一下' },
  { id: 'stand', kind: 'motion', zh: ['站起', '站'], note: '站起来(坐着、睡着时)' },
  { id: 'jump', kind: 'motion', zh: ['跳', '跳起来'], note: '原地起跳' },
  { id: 'hop', kind: 'motion', zh: ['小跳', '蹦'], note: '小小蹦一下' },
  { id: 'look', kind: 'motion', zh: ['张望', '看看'], note: '左右张望' },
  { id: 'turn', kind: 'motion', zh: ['转身'], note: '转向另一边' },
  { id: 'nod', kind: 'motion', zh: ['点头'], note: '点两下头' },
  { id: 'shake', kind: 'motion', zh: ['摇头'], note: '摇头' },
  { id: 'spin', kind: 'motion', zh: ['转圈'], note: '原地转一圈' },
  { id: 'sit', kind: 'motion', zh: ['坐下', '坐'], note: '坐下,一直坐着直到下个动作' },
  { id: 'sleep', kind: 'motion', zh: ['睡觉', '睡'], note: '坐着打盹,一直睡到下个动作' },
  { id: 'dizzy', kind: 'motion', zh: ['晕', '转晕'], note: '头晕眼花几秒' },
  { id: 'walk', kind: 'motion', zh: ['走走', '散步'], note: '随便走一段' },
  { id: 'run', kind: 'motion', zh: ['跑', '跑起来'], note: '跑到屏幕另一头' },
  { id: 'wave', kind: 'motion', zh: ['招手', '打招呼'], note: '笑着打招呼' },
  { id: 'bow', kind: 'motion', zh: ['鞠躬'], note: '闭眼鞠一躬' },
  { id: 'shiver', kind: 'motion', zh: ['发抖', '哆嗦'], note: '缩着身子抖一会儿' },
  { id: 'flap', kind: 'motion', zh: ['扑腾', '激动'], note: '开心地蹦起来扑腾' },
  { id: 'dance', kind: 'motion', zh: ['跳舞', '摇摆'], note: '原地踩着节拍摇摆三秒,冒音符' },
  { id: 'flinch', kind: 'motion', zh: ['后缩', '吓一跳'], note: '吓得往后一缩,马上恢复' },
  { id: 'peek', kind: 'motion', zh: ['探头', '瞅瞅'], note: '身子往前探,盯着前方看两秒' },
];

const BY_WORD = new Map<string, VocabEntry>();
for (const v of VOCAB) {
  BY_WORD.set(v.id, v);
  for (const z of v.zh) BY_WORD.set(z, v);
}

/** English id for a vocabulary word, or null. */
export function vocabId(word: string): string | null {
  return BY_WORD.get(word.trim().toLowerCase())?.id ?? BY_WORD.get(word.trim())?.id ?? null;
}

export interface Anchor {
  /** Character offset in the beat's text. */
  at: number;
  actions: string[];
}

export interface Beat {
  actions: string[];
  text: string;
  anchors: Anchor[];
}

export interface ParsedScript {
  beats: Beat[];
  dropped: string[];
}

export const INLINE_TAG_MAX = 32;

function words(inner: string, dropped: string[]): string[] {
  const out: string[] = [];
  for (const w of inner.split(/[,，、\s]+/)) {
    if (!w) continue;
    const id = vocabId(w);
    if (id) out.push(id);
    else dropped.push(w);
  }
  return out;
}

export function parseScript(script: string): ParsedScript {
  const dropped: string[] = [];
  const beats: Beat[] = [];
  let cur: Beat = { actions: [], text: '', anchors: [] };
  let i = 0;
  while (i < script.length) {
    const ch = script[i];
    if (ch === '【') {
      const end = script.indexOf('】', i + 1);
      if (end < 0) { cur.text += script.slice(i); break; }
      const acts = words(script.slice(i + 1, end), dropped);
      if (cur.text.trim() || cur.actions.length || cur.anchors.length) beats.push(cur);
      cur = { actions: acts, text: '', anchors: [] };
      i = end + 1;
      continue;
    }
    if (ch === '<' || ch === '＜') {
      const close = ch === '<' ? '>' : '＞';
      const end = script.indexOf(close, i + 1);
      const inner = end < 0 ? '' : script.slice(i + 1, end);
      if (end < 0 || inner.length > INLINE_TAG_MAX || /\n/.test(inner)) { cur.text += ch; i++; continue; }
      const acts = words(inner, dropped);
      if (acts.length) cur.anchors.push({ at: cur.text.length, actions: acts });
      i = end + 1;
      continue;
    }
    cur.text += ch;
    i++;
  }
  if (cur.text.trim() || cur.actions.length || cur.anchors.length) beats.push(cur);
  for (const b of beats) {
    const lead = b.text.length - b.text.trimStart().length;
    b.text = b.text.trim();
    for (const a of b.anchors) a.at = Math.max(0, Math.min(b.text.length, a.at - lead));
  }
  return { beats, dropped };
}

/** Seconds a script stays on screen: typing at ~20 chars/s, plus reading time per bubble. */
export function estimateSeconds(beats: readonly Beat[]): number {
  let s = 0;
  for (const b of beats) {
    if (b.actions.length) s += .5;
    if (b.text) s += b.text.length / 20 + 1.6 + b.text.length * .07;
  }
  return Math.round(s * 10) / 10;
}

/** Validates an action list for `pet_act`, splitting known ids from unknown words. */
export function parseActions(list: readonly unknown[]): { actions: string[]; dropped: string[] } {
  const actions: string[] = [];
  const dropped: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') { dropped.push(String(raw)); continue; }
    const id = vocabId(raw);
    if (id) actions.push(id);
    else dropped.push(raw);
  }
  return { actions, dropped };
}

export function vocabTable(): string {
  const rows = (kind: VocabEntry['kind']) => VOCAB.filter((v) => v.kind === kind)
    .map((v) => `| ${v.id} | ${v.zh.join(' / ')} | ${v.note} |`).join('\n');
  return `表情(持续几秒后回到平常的脸):\n\n| 词 | 中文 | 样子 |\n|---|---|---|\n${rows('expression')}\n\n`
    + `动作:\n\n| 词 | 中文 | 样子 |\n|---|---|---|\n${rows('motion')}`;
}
