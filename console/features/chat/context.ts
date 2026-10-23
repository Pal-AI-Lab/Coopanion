/**
 * The ring in the chat composer: the conversation's context against the point where the earlier
 * conversation is tidied up (Core's context handoff), read from `/api/status`. Hovering or focusing
 * it shows the reading; during a handoff it spins.
 */
import type { WebUi } from 'cortico/web/shared/client-panel.ts';
import { LANGUAGE } from '../../base/language.ts';
import { S } from './strings.ts';

/** The fields of `/api/status` the ring reads: Core's loop, and the Persona's context config at the top level. */
export interface ContextStatus {
  loop?: {
    estTokens?: number | null;
    lastTruncateAt?: string | null;
    context?: { hardTokens?: number | null } | null;
  } | null;
  context?: { maxTokens?: number; softRatio?: number } | null;
}

export interface ContextGauge {
  /** The next request's input in tokens. */
  tokens: number;
  /** The token count at which the earlier conversation is tidied up; null when no limit is reported. */
  handoffAt: number | null;
  /** When it was last tidied up, as Core's ISO time; null before the first time. */
  lastAt: string | null;
}

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The reading, or null before Core reports a count. Cormini's Persona reminds Coo to take notes at
 * the first batch end past `maxTokens × softRatio` and asks for the handoff at the next one still
 * past it; Core forces one at a batch end past the model's input limit. The lower of the two is
 * where the ring is full.
 */
export function contextGauge(st: ContextStatus | null): ContextGauge | null {
  const tokens = count(st?.loop?.estTokens);
  if (tokens === null) return null;
  const max = count(st?.context?.maxTokens);
  const ratio = count(st?.context?.softRatio);
  const limits = [max !== null && ratio !== null ? max * ratio : null, count(st?.loop?.context?.hardTokens)]
    .filter((n): n is number => n !== null && n > 0);
  const lastAt = st?.loop?.lastTruncateAt;
  return { tokens, handoffAt: limits.length ? Math.min(...limits) : null, lastAt: typeof lastAt === 'string' ? lastAt : null };
}

/** 41_234 → `41k`. */
const rough = (n: number): string => (n < 1000 ? String(Math.round(n)) : `${Math.round(n / 1000)}k`);

const when = (iso: string): string =>
  new Date(iso).toLocaleString(LANGUAGE, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export interface ContextRing {
  readonly el: HTMLElement;
  /** Draws a reading; `busy` while a handoff runs. Hidden until there is something to show. */
  paint(gauge: ContextGauge | null, busy: boolean): void;
}

/** The ring and its tooltip; the tooltip goes into `host` and leaves with it. */
export function contextRing(ui: WebUi, host: HTMLElement, signal: AbortSignal): ContextRing {
  const doc = host.ownerDocument;
  const el = ui.h('span', 'chat-ctx');
  el.tabIndex = 0;
  el.setAttribute('role', 'img');
  el.append(ui.h('i'));
  const tip = ui.h('div', 'u-tip chat-ctx-tip hidden');
  tip.setAttribute('role', 'tooltip');
  host.append(tip);

  let shown = false;
  // above the ring, centred on it, kept inside the window
  const place = (): void => {
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const width = doc.documentElement.clientWidth;
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, width - t.width - 8))}px`;
    tip.style.top = `${Math.max(8, r.top - t.height - 8)}px`;
  };
  const show = (): void => { shown = true; tip.classList.remove('hidden'); place(); };
  const hide = (): void => { shown = false; tip.classList.add('hidden'); };
  for (const [type, fn] of [['pointerenter', show], ['focus', show], ['pointerleave', hide], ['blur', hide]] as const) {
    el.addEventListener(type, fn, { signal });
  }

  return {
    el,
    paint(gauge, busy) {
      el.hidden = !gauge && !busy;
      el.dataset.state = busy ? 'busy' : 'idle';
      const limit = gauge?.handoffAt ?? null;
      const share = gauge && limit ? Math.min(1, gauge.tokens / limit) : 0;
      el.style.setProperty('--fill', `${(share * 100).toFixed(1)}%`);
      const lines = busy ? [S.handoff]
        : !gauge ? []
          : limit ? [S.contextUsed(rough(gauge.tokens), rough(limit)), S.contextLimit(rough(limit))]
            : [S.contextTokens(rough(gauge.tokens))];
      if (gauge?.lastAt) lines.push(S.contextLast(when(gauge.lastAt)));
      tip.replaceChildren(...lines.map((line, i) => ui.h(i === 0 ? 'b' : 'span', null, line)));
      el.setAttribute('aria-label', lines.join(' · '));
      if (shown) place();
    },
  };
}
