/**
 * Time-driven widgets: every `render(t)` is a pure function of the timeline position, so the
 * promo plays live against the music and records frame by frame with the same output.
 */
import { clamp01, ease, h, lerp, seg, f1 } from './util.js';

/** Kinetic caption: characters rise and settle one after another, then leave together. */
export class Caption {
  constructor(parent, { x, y, size = 84, weight = 700, color = 'var(--ink)', align = 'left', width = 1400, stagger = .035 } = {}) {
    this.el = h('div', 'cap');
    Object.assign(this.el.style, { left: `${x}px`, top: `${y}px`, fontSize: `${size}px`, fontWeight: String(weight), color, textAlign: align, width: `${width}px` });
    if (align === 'center') this.el.style.transform = 'translateX(-50%)';
    if (align === 'right') this.el.style.transform = 'translateX(-100%)';
    parent.appendChild(this.el);
    this.stagger = stagger;
    this.text = '';
    this.spans = [];
  }
  set(text) {
    if (text === this.text) return;
    this.text = text;
    this.el.textContent = '';
    this.spans = [...text].map((ch) => {
      const s = h('span', ch === ' ' ? 'sp' : null);
      s.textContent = ch;
      this.el.appendChild(s);
      return s;
    });
  }
  render(t, inAt, outAt = Infinity) {
    const out = seg(t, outAt, outAt + .35);
    this.el.style.display = t < inAt - .05 || out >= 1 ? 'none' : '';
    if (this.el.style.display) return;
    this.spans.forEach((s, i) => {
      const k = seg(t, inAt + i * this.stagger, inAt + i * this.stagger + .45);
      const y = (1 - ease.outBack(k, 2.2)) * 60 - out * 30;
      s.style.transform = `translateY(${f1(y)}px)`;
      s.style.opacity = String(f1(Math.min(k * 2, 1) * (1 - out) * 100) / 100);
    });
  }
}

/** A pill label that pops in, centered on (x, y) or, with `anchor: 'left'`, starting at x. */
export class Chip {
  constructor(parent, cls = 'chip', anchor = 'center') {
    this.el = h('div', cls);
    this.dx = anchor === 'left' ? '0' : '-50%';
    parent.appendChild(this.el);
  }
  render(t, inAt, outAt, text, x, y) {
    const k = seg(t, inAt, inAt + .35), o = seg(t, outAt, outAt + .25);
    this.el.style.display = t < inAt || o >= 1 ? 'none' : '';
    if (this.el.style.display) return;
    if (this.el.textContent !== text) this.el.textContent = text;
    const s = ease.outBack(k, 2) * (1 - o * .2);
    this.el.style.transform = `translate(${f1(x)}px, ${f1(y)}px) translate(${this.dx}, -50%) scale(${f1(s * 100) / 100})`;
    this.el.style.opacity = String(f1(clamp01(k * 2) * (1 - o) * 100) / 100);
  }
}

/** The pet's speech bubble, in the pet page's own classes. */
export class Bubble {
  constructor(parent, trail) {
    this.el = h('div', 'bubble');
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.trail = trail;
    this.key = '';
  }
  hide() { this.el.hidden = true; if (this.trail) this.trail.hidden = true; this.key = ''; }

  /** say: typed at `cps` chars/s from `start`, shown until `end`. Returns true while characters appear. */
  say(t, text, start, end, anchor, cps = 16) {
    if (t < start || t > end) { if (this.key.startsWith('say:' + text)) this.hide(); return false; }
    const n = Math.min(text.length, Math.floor((t - start) * cps));
    this.frame('say', text, `<p class="b-text"></p>`);
    this.el.querySelector('.b-text').textContent = text.slice(0, n);
    this.pop(t, start);
    this.place(anchor, 26);
    return n < text.length && n > 0 && !/[\s,。!?、,.!?]/.test(text[n - 1]);
  }

  /** heard: dashed bubble; text arrives in chunks until `finalAt`, grey while provisional. */
  heard(t, text, start, finalAt, end, anchor) {
    if (t < start || t > end) { if (this.key.startsWith('heard:' + text)) this.hide(); return; }
    const k = seg(t, start + .4, finalAt);
    const n = Math.floor(text.length * k);
    const done = t >= finalAt;
    this.frame('heard', text, '<p class="b-text"><span class="fin"></span><span class="interim"></span><span class="caret"></span></p><span class="b-hint"></span>');
    this.el.classList.add('heard');
    const fin = done ? n : Math.max(0, n - 2);
    this.el.querySelector('.fin').textContent = text.slice(0, fin);
    this.el.querySelector('.interim').textContent = done ? '' : text.slice(fin, n);
    this.el.querySelector('.caret').style.display = done ? 'none' : '';
    this.el.querySelector('.b-hint').textContent = done ? '听到了' : n ? '还在听…' : '正在听…';
    this.pop(t, start);
    const r = this.place(anchor, 70);
    if (this.trail) {
      this.trail.hidden = false;
      const bx = r.left + r.w / 2, by = r.top + r.h;
      [...this.trail.children].forEach((d, i) => {
        const kk = [.22, .5, .78][i], sz = [9, 13, 17][i];
        Object.assign(d.style, { width: `${sz}px`, height: `${sz}px`, left: `${f1(lerp(anchor.x, bx, kk) - sz / 2)}px`, top: `${f1(lerp(anchor.y, by + 6, kk) - sz / 2)}px` });
      });
    }
  }

  /** ask: question typed, options pop in, one is chosen at `chooseAt`. */
  ask(t, q, options, start, chooseAt, chosen, end, anchor) {
    if (t < start || t > end) { if (this.key.startsWith('ask:' + q)) this.hide(); return; }
    const n = Math.min(q.length, Math.floor((t - start) * 16));
    const optsAt = start + .35;
    this.frame('ask', q, `<button class="b-close">×</button><p class="b-text"></p><div class="b-opts">${options.map((o, i) => `<div class="b-opt"><kbd>${i + 1}</kbd><span>${o}</span></div>`).join('')}<div class="b-own"><span class="own">自己说点什么…</span><button>发送</button></div></div>`);
    this.el.classList.add('ask');
    this.el.querySelector('.b-text').textContent = q.slice(0, n);
    const rows = [...this.el.querySelectorAll('.b-opt, .b-own')];
    rows.forEach((r, i) => {
      const k = seg(t, optsAt + i * .08, optsAt + i * .08 + .3);
      r.style.opacity = String(f1(k * (t >= chooseAt && i !== chosen ? .35 : 1) * 100) / 100);
      r.style.transform = `translateY(${f1((1 - ease.outBack(k)) * 10)}px)`;
      r.classList.toggle('chosen', t >= chooseAt && i === chosen);
    });
    this.pop(t, start);
    this.place(anchor, 26);
    return rows[chosen];
  }

  frame(kind, text, html) {
    const key = `${kind}:${text}`;
    if (this.key === key) return;
    this.key = key;
    this.el.className = `bubble ${kind === 'say' ? '' : kind}`;
    this.el.innerHTML = html;
    this.el.hidden = false;
    if (this.trail) this.trail.hidden = kind !== 'heard';
  }
  pop(t, start) {
    const k = seg(t, start, start + .28);
    this.el.style.scale = String(f1(ease.outBack(k, 2.4) * 100) / 100);
    this.el.style.opacity = String(Math.min(1, k * 3));
  }
  place(anchor, up) {
    const w = this.el.offsetWidth, hh = this.el.offsetHeight;
    const left = Math.max(24, Math.min(1920 - w - 24, anchor.x - w / 2 + 30));
    const top = Math.max(24, anchor.y - hh - up);
    this.el.style.left = `${f1(left)}px`;
    this.el.style.top = `${f1(top)}px`;
    this.el.style.setProperty('--tail', `${f1(Math.max(26, Math.min(w - 26, anchor.x - left)))}px`);
    return { left, top, w, h: hh };
  }
}

/** A drawn mouse pointer following keyframes [[t, x, y], …]; `clicks` are times with a ripple. */
export class Cursor {
  constructor(parent, { color = '#FFFFFF', badge = null } = {}) {
    this.el = h('div', 'cursor');
    this.el.innerHTML = `<svg viewBox="0 0 24 36" width="34" height="51"><path d="M2 2 L2 30 L9 23 L14 34 L19 32 L14 21 L24 21 Z" fill="${color}" stroke="#1B1626" stroke-width="2.2" stroke-linejoin="round"/></svg>${badge ? `<span class="cbadge">${badge}</span>` : ''}<i class="ripple"></i>`;
    parent.appendChild(this.el);
  }
  static pos(keys, t) {
    if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2] };
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, x0, y0] = keys[i - 1], [t1, x1, y1] = keys[i];
        const k = ease.inOutCubic(seg(t, t0, t1));
        return { x: lerp(x0, x1, k), y: lerp(y0, y1, k) };
      }
    }
    const last = keys[keys.length - 1];
    return { x: last[1], y: last[2] };
  }
  render(t, visibleFrom, visibleTo, keys, clicks = []) {
    const on = t >= visibleFrom && t <= visibleTo;
    this.el.style.display = on ? '' : 'none';
    if (!on) return null;
    const p = Cursor.pos(keys, t);
    this.el.style.transform = `translate(${f1(p.x)}px, ${f1(p.y)}px)`;
    const last = clicks.filter((c) => c <= t).pop();
    const r = this.el.querySelector('.ripple');
    const k = last === undefined ? 1 : seg(t, last, last + .45);
    r.style.opacity = String(f1((1 - k) * 100) / 100);
    r.style.transform = `translate(-50%, -50%) scale(${f1((.3 + k * 1.4) * 100) / 100})`;
    this.el.style.opacity = String(Math.min(seg(t, visibleFrom, visibleFrom + .25), 1 - seg(t, visibleTo - .25, visibleTo)));
    return p;
  }
}
