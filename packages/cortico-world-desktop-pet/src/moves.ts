/**
 * The targets `pet_move_to` takes. Every figure that walks has the default ones: a share of the width of
 * the screen the pet is on, or left / center / right / cursor. A pack may declare more (`moves` in its
 * figure.json, src/packs.ts): a call to one of them is checked against the declaration here, then goes to
 * the body as it is (`body.move` in web/figure-frame.js), which decides where that is and how it gets there.
 *
 * The tool's parameters stay the same whatever pack is on, so changing figures leaves the tool list as it is;
 * the bot learns a pack's targets from the environment prompt (`moveTable`) and how they changed from the
 * figure events and receipts (`moveChange`).
 */
import type { ModelLanguage } from './model-text.ts';
import { nameIn, type MoveParam, type MoveTarget } from './packs.ts';

/** Where the default targets are, as a share of the screen's width; `cursor` is the mouse pointer's x. */
const NAMED: Record<string, number | 'cursor'> = { left: .05, center: .5, right: .95, cursor: 'cursor' };

export type MoveOrder =
  /** A default target: the page walks the body there. */
  | { kind: 'walk'; to: number | 'cursor'; run: boolean }
  /** One of the pack's targets: what the body gets, the params named by their ids. */
  | { kind: 'move'; target: MoveTarget; to: string; run: boolean; params: Record<string, number> }
  /** `noTarget`: no `to`; `badTarget`: neither a default target nor one of the pack's; `badParams`: params the target does not take. */
  | { kind: 'noTarget' }
  | { kind: 'badTarget'; got: string }
  | { kind: 'badParams'; target: MoveTarget | null; got: string };

/** A `pet_move_to` call read against the targets `moves` of the pack on screen. */
export function readMove(args: Record<string, unknown>, moves: readonly MoveTarget[]): MoveOrder {
  const run = args.run === true;
  const { to, params } = args;
  const none = params === undefined || params === null || (Array.isArray(params) && params.length === 0);
  if (typeof to === 'number' && Number.isFinite(to)) return none ? { kind: 'walk', to: Math.max(0, Math.min(1, to)), run } : { kind: 'badParams', target: null, got: JSON.stringify(params) };
  if (typeof to !== 'string') return { kind: 'noTarget' };
  const n = Number(to);
  if (to in NAMED || (to.trim() !== '' && Number.isFinite(n))) {
    if (!none) return { kind: 'badParams', target: null, got: JSON.stringify(params) };
    return { kind: 'walk', to: to in NAMED ? NAMED[to]! : Math.max(0, Math.min(1, n)), run };
  }
  const target = moves.find((m) => m.id === to || Object.values(m.name).includes(to));
  if (!target) return { kind: 'badTarget', got: JSON.stringify(to) };
  const named = paramsOf(params, target.params);
  return named ? { kind: 'move', target, to: target.id, run, params: named } : { kind: 'badParams', target, got: JSON.stringify(params) };
}

/**
 * `raw` as the target's numbers by id, or null when it gives one the target does not take or one out of its range.
 * The tool takes them in the declared order; an object keyed by the ids is read too. Numbers left out stay out.
 */
function paramsOf(raw: unknown, spec: readonly MoveParam[]): Record<string, number> | null {
  if (raw === undefined || raw === null) return {};
  const pairs: Array<[MoveParam | undefined, unknown]> = Array.isArray(raw) ? raw.map((v, i) => [spec[i], v])
    : typeof raw === 'object' ? Object.entries(raw).map(([k, v]) => [spec.find((p) => p.id === k), v]) : [[undefined, raw]];
  const out: Record<string, number> = {};
  for (const [p, v] of pairs) {
    if (!p || typeof v !== 'number' || !(v >= p.min && v <= p.max)) return null;
    out[p.id] = v;
  }
  return out;
}

const MOVE_TEXT = {
  zh: {
    intro: '现在的形象还能去下面这些地方:`to` 写目标,带数值的按顺序写进 `params`,不写的由形象自己定。',
    head: '| 目标 | 去哪、怎么去 | params |\n|---|---|---|\n',
    row: (m: MoveTarget) => `| ${m.id}(${nameIn(m.name, 'zh')}) | ${nameIn(m.about, 'zh')} | ${m.params.map((p) => `${p.id}:${p.min}–${p.max},${nameIn(p.about, 'zh')}`).join(';') || '无'} |`,
    changed: '能去的地方变了。',
    gone: (list: readonly MoveTarget[]) => `这些去不了了:${list.map((m) => `${m.id}(${nameIn(m.name, 'zh')})`).join('、')}。`,
    fresh: '新增或说明变了的:',
  },
  en: {
    intro: 'The current figure can also go to these places: give the target as `to` and its numbers, in order, as `params`; the figure picks any left out.',
    head: '| target | where and how | params |\n|---|---|---|\n',
    row: (m: MoveTarget) => `| ${[m.id, ...(m.name.en ? [m.name.en] : [])].join(' / ')} | ${nameIn(m.about, 'en')} | ${m.params.map((p) => `${p.id}: ${p.min}–${p.max}, ${nameIn(p.about, 'en')}`).join('; ') || '—'} |`,
    changed: 'The places you can go changed.',
    gone: (list: readonly MoveTarget[]) => ` These no longer work: ${list.map((m) => m.id).join(', ')}.`,
    fresh: ' New or changed:',
  },
} satisfies Record<ModelLanguage, unknown>;

/** The pack's targets as the bot's prompt shows them, or '' when it declares none. */
export function moveTable(moves: readonly MoveTarget[], language: ModelLanguage = 'zh'): string {
  const t = MOVE_TEXT[language];
  return moves.length ? `${t.intro}\n\n${t.head}${moves.map(t.row).join('\n')}` : '';
}

/**
 * How the targets went from `before` to `after`, for the bot, as `vocabChange` tells the words: the whole table
 * when there were none before, '' when the bot would see the same table.
 */
export function moveChange(before: readonly MoveTarget[], after: readonly MoveTarget[], language: ModelLanguage = 'zh'): string {
  if (!before.length) return moveTable(after, language);
  const t = MOVE_TEXT[language];
  const told = new Map(before.map((m) => [m.id, t.row(m)]));
  const gone = before.filter((m) => !after.some((a) => a.id === m.id));
  const fresh = after.filter((m) => told.get(m.id) !== t.row(m));
  if (!gone.length && !fresh.length) return '';
  let line = t.changed;
  if (gone.length) line += t.gone(gone);
  if (!fresh.length) return line;
  return `${line}${t.fresh}\n\n${t.head}${fresh.map(t.row).join('\n')}`;
}
