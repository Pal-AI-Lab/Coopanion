/**
 * Confines an extension's stylesheet to its own page. Style rules go into an `@scope` block rooted at the elements
 * marked with the page id and ending at the page header and the views the host draws, so the extension's selectors
 * match only its own panels; custom properties it sets on `:scope` still inherit into the header and those views.
 * Rules that cannot sit inside `@scope` stay at the top level; `@import` and `@charset` are dropped, since a
 * constructed stylesheet does not accept them.
 */

/** Attribute that marks the root of an extension page and the roots of its other boxes (header slot, overlays). */
export const EXTENSION_PAGE_ATTR = 'data-ext-page';
/** Attribute that marks a view the host draws inside an extension page. */
export const HOST_VIEW_ATTR = 'data-host-view';

const HOISTED = /^@(-webkit-)?keyframes\b|^@(font-face|property|counter-style|font-palette-values|font-feature-values|namespace)\b/i;
const DROPPED = /^@(import|charset)\b/i;

export interface ScopedCss {
  css: string;
  /** Top-level `@import` rules that were removed. */
  droppedImports: number;
}

export function scopeExtensionCss(source: string, pageId: string): ScopedCss {
  const hoisted: string[] = [];
  const scoped: string[] = [];
  let droppedImports = 0;
  for (const rule of topLevelRules(source.replace(/^\uFEFF/, ''))) {
    const head = rule.replace(/^(?:\s|\/\*[\s\S]*?\*\/)+/, '');
    if (!head) continue;
    if (DROPPED.test(head)) {
      if (/^@import\b/i.test(head)) droppedImports++;
    } else if (HOISTED.test(head) || /^@layer\b[^{]*;$/i.test(head)) {
      hoisted.push(head);
    } else {
      scoped.push(head);
    }
  }
  const root = `[${EXTENSION_PAGE_ATTR}="${pageId.replace(/["\\]/g, '\\$&')}"]`;
  const limit = `.providerchrome, [${HOST_VIEW_ATTR}]`;
  const body = scoped.length ? `@scope (${root}) to (${limit}) {\n${scoped.join('\n')}\n}` : '';
  return { css: [...hoisted, body].filter(Boolean).join('\n'), droppedImports };
}

/** Splits a stylesheet into its top-level rules, honouring strings, comments and nested blocks. */
function topLevelRules(css: string): string[] {
  const out: string[] = [];
  let start = 0, depth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++;
    } else if (c === '\\') {
      i++;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
    } else if (c === ';' && depth === 0) {
      out.push(css.slice(start, i + 1)); start = i + 1;
    }
  }
  const rest = css.slice(start);
  if (rest.trim()) out.push(rest);
  return out;
}
