/**
 * Each section edits its source template; previews and generated sections come from Core.
 * The full prompt is the sections' text joined in order, as Core joins them for the model, rendered
 * from the current files.
 */
import { fetchManifest, get, post } from '../../../base/api.ts';
import { pageIntro } from '../../../base/ui/page.ts';
import { estTok } from '../live/context.ts';
import { readMode } from '../../../features/mode.ts';
import { S as sessionText } from '../../../features/strings.ts';
import type { FeatureContext, FrameworkFeature } from '../feature.ts';
import { createPrefixEditor, references, VARIABLE_DRAG_TYPE, type PrefixBlock } from './editor.ts';
import { S } from './strings.ts';
import type { PromptDoc, PromptVar } from './view.ts';

interface PrefixSegment { title: string; text: string; sourceKey?: string }
interface Section {
  segment: PrefixSegment;
  /** The template this section edits; absent for generated text and for a source Core names but does not list. */
  doc?: PromptDoc;
  tone: PrefixBlock['tone'];
  label: HTMLElement;
  toggle: HTMLButtonElement;
  cell: HTMLElement;
  note: HTMLElement;
  badge: HTMLElement;
  origin?: HTMLElement;
  divider: HTMLElement;
  collapsed: boolean;
  updateVariables(): void;
}
const colWidth = { flags: 158, rail: 190 };
const FOLDS_KEY = 'coopanion.prompt-folds';
let folds = new Map<string, boolean>();

/** Names the sections of Cortico's persona; any other section shows its template's own title and description. */
function description(segment: PrefixSegment, doc?: PromptDoc): { title: string; detail: string } {
  switch (segment.sourceKey ?? segment.title) {
    case 'constitution': return { title: S.constitutionTitle, detail: S.constitutionDesc };
    case 'orientation': return { title: S.orientationTitle, detail: S.orientationDesc };
    case 'WORKSPACE': return { title: S.workspaceTitle, detail: S.workspaceDesc };
    case 'MEMORY': case 'memoryNote': return { title: S.memoryTitle, detail: doc?.description || S.memoryDesc };
    case 'PARTNER': return { title: S.partnerTitle, detail: doc?.description || S.partnerDesc };
    default: return { title: doc?.title || segment.title, detail: doc?.description ?? (segment.sourceKey ? '' : S.generatedDesc) };
  }
}

function originText(doc: PromptDoc): string {
  return doc.origin === 'deployment' ? S.loadedFromDeployment
    : doc.origin === 'package' ? S.loadedFromPackage
      : doc.origin === 'module' ? S.loadedFromWorld
        : S.loadedFromSource;
}

export async function mountPrompts(ctx: FeatureContext): Promise<void> {
  const { ui, root, signal } = ctx;
  try { folds = new Map(JSON.parse(sessionStorage.getItem(FOLDS_KEY) ?? '[]')); } catch { /* Keep this window's in-memory state if storage is unavailable. */ }
  const docs = new Map<string, PromptDoc>();
  const dirty = new Map<string, string>();
  const sections: Section[] = [];
  let segments: PrefixSegment[] = [];
  let pendingApply = false;
  let savePromise: Promise<boolean> | null = null;
  let changingSession = false;
  const toolbar = ui.h('div', 'prompt-toolbar');
  const actions = ui.h('div', 'prompt-actions');
  const status = ui.msgline('');
  status.setAttribute('role', 'status');
  const stage = ui.h('div', 'prefix-stage');
  const flags = ui.h('div', 'prefix-flags');
  const host = ui.h('div', 'prefix-host');
  const rail = ui.h('div', 'prefix-rail');
  const gripL = ui.h('div', 'prefix-grip');
  const gripR = ui.h('div', 'prefix-grip');
  const dividers = ui.h('div', 'prefix-dividers');
  stage.append(flags, gripL, host, gripR, rail, dividers);
  const full = ui.h('pre', 'mono prefix-full');
  const preview = ui.foldSheet('full-prompt', { title: S.fullPreview });
  preview.body.append(full);
  root.append(pageIntro(ui, S.title, S.introDesc), toolbar, stage, preview.el);

  function say(text: string, bad = false): void {
    status.className = bad ? 'msgline bad prompt-status' : 'msgline prompt-status';
    status.textContent = text;
  }
  function controls(): void {
    for (const button of actions.querySelectorAll<HTMLButtonElement>('button')) button.disabled = changingSession;
    save.disabled = restore.disabled = changingSession || dirty.size === 0 || !!savePromise;
    undoStep.disabled = changingSession || !editor.canUndo();
  }
  function state(): void {
    controls();
    say(dirty.size ? S.dirtyCount(dirty.size) : pendingApply ? S.pendingApply : S.prefixStats(segments.length, estTok(segments.map((s) => s.text).join('')).toLocaleString()));
    for (const { doc, toggle, badge, origin } of sections) {
      const changed = !!doc && dirty.has(doc.key);
      badge.textContent = changed ? S.unsaved : doc ? S.editableTemplate : S.generated;
      if (doc && !segments.some((s) => s.sourceKey === doc.key)) badge.textContent += ` · ${S.outsidePrefix}`;
      badge.classList.toggle('is-dirty', changed);
      if (doc) toggle.title = originText(doc);
      if (doc && origin) origin.textContent = doc.origin === 'deployment' ? S.originDeployment : doc.origin === 'package' ? S.originPackage : S.originWorld;
    }
  }
  function open(section: Section, expanded: boolean): void {
    if (section.collapsed === !expanded) return;
    const index = sections.indexOf(section);
    editor.setCollapsed(index, !expanded);
  }
  function animateSection(section: Section, index: number): void {
    if (section.collapsed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const targets = host.querySelectorAll(`[data-prompt-section="${index}"]`);
    for (const target of [...targets, section.note]) {
      target.getAnimations().forEach((animation) => animation.cancel());
      target.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    }
  }
  const expand = ui.button(S.expandAll, { size: 'sm', onClick: () => {
    const expanded = sections.some((s) => s.collapsed);
    for (const section of sections) open(section, expanded);
  } });
  const undoStep = ui.button(S.undo, { size: 'sm', onClick: () => editor.undo() });
  undoStep.title = 'Ctrl / ⌘ + Z';
  undoStep.disabled = true;
  const restore = ui.button(S.undoAll, { size: 'sm', onClick: () => {
    closePopup();
    editor.restore(new Map([...dirty.keys()].map((key) => [key, docs.get(key)!.content])));
  } });
  restore.title = S.undoAllHint;
  restore.disabled = true;
  const save = ui.button(S.saveToFile, { size: 'sm', onClick: () => { void saveAll(); } });
  save.title = 'Ctrl / ⌘ + S';
  actions.append(expand, undoStep, restore, save);
  toolbar.append(status, actions);

  /**
   * Reloads the templates and the rendered prefix. A template without unsaved edits takes the listed
   * content, revision and origin; one with unsaved edits keeps its text, its undo history and the
   * revision it was loaded at.
   */
  async function refreshPreview(): Promise<boolean> {
    try {
      const [data, sources] = await Promise.all([
        get<{ segments: PrefixSegment[] }>('/api/prompts/prefix', { signal }),
        get<{ prompts: PromptDoc[] }>('/api/prompts', { signal }),
      ]);
      if (signal.aborted) return false;
      const listed = new Set(sources.prompts.map((doc) => doc.key));
      for (const key of docs.keys()) if (!listed.has(key) && !dirty.has(key)) docs.delete(key);
      for (const fresh of sources.prompts) {
        fresh.content = editor.view.state.toText(fresh.content).toString();
        const doc = docs.get(fresh.key);
        if (!doc) docs.set(fresh.key, fresh);
        else Object.assign(doc, fresh, dirty.has(doc.key) ? { content: doc.content, revision: doc.revision } : {});
      }
      segments = data.segments;
      layout();
      state();
      return true;
    } catch (error) {
      if (!signal.aborted) say(S.loadFailed(String(error)), true);
      return false;
    }
  }
  async function persist(): Promise<boolean> {
    for (const [key, content] of [...dirty]) {
      const doc = docs.get(key)!;
      try {
        const out = await post<{ revision: string }>('/api/prompts', { key, content, baseRevision: doc.revision }, { signal });
        if (signal.aborted) return false;
        doc.content = content;
        doc.revision = out.revision;
        const current = editor.text(key);
        if (current === content) dirty.delete(key); else dirty.set(key, current);
        pendingApply = true;
      } catch (error) {
        if (!signal.aborted) {
          state();
          say(S.saveFailedFor(doc.title, String(error)), true);
        }
        return false;
      }
    }
    return await refreshPreview() && dirty.size === 0;
  }
  function saveAll(): Promise<boolean> {
    if (savePromise) return savePromise;
    if (!dirty.size) return Promise.resolve(true);
    say(S.saving);
    editor.setSaveState('saving');
    save.disabled = restore.disabled = true;
    savePromise = persist().finally(() => {
      savePromise = null;
      if (signal.aborted) return;
      controls();
      editor.setSaveState(dirty.size ? 'dirty' : 'saved');
    });
    return savePromise;
  }
  if (ctx.capabilities.storage) {
    const restart = ui.button(sessionText.button, { size: 'sm', variant: 'danger', onClick: () => { void runSession(restart, true); } });
    restart.title = sessionText.body;
    actions.append(restart);
  }
  if (ctx.capabilities.sessionControl) {
    const apply = ui.button(S.reloadSession, { size: 'sm', variant: 'primary', onClick: () => { void runSession(apply, false); } });
    apply.title = S.applyHint;
    actions.append(apply);
  }
  async function runSession(button: HTMLButtonElement, restart: boolean): Promise<void> {
    changingSession = true;
    controls();
    try {
      if (restart && !await ui.confirm({ title: sessionText.title, body: sessionText.body, danger: true })) return;
      if (signal.aborted || !await saveAll()) return;
      say(restart ? sessionText.clearing : S.reloading);
      await post(restart ? '/api/storage/clear?key=session' : '/api/session/reload-prefix', undefined, { signal });
      if (signal.aborted) return;
      pendingApply = false;
      if (await refreshPreview() && !dirty.size) say(restart ? sessionText.cleared : S.prefixReloaded);
    } catch (error) {
      if (!signal.aborted) say(String(error), true);
    } finally {
      changingSession = false;
      if (!signal.aborted) controls();
      button.focus({ preventScroll: true });
    }
  }
  ctx.lifecycle.own(ctx.router.addLeaveGuard(() => dirty.size || savePromise ? S.leaveUnsaved : null));
  root.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); if (!changingSession) void saveAll(); }
    else if (!(event.target as Element).closest('.cm-editor')) {
      if (key === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
      if (key === 'y') { event.preventDefault(); editor.redo(); }
    }
  }, { signal });

  let geometryFrame = 0;
  const editor = createPrefixEditor({
    parent: host,
    onChange(changes) {
      for (const { sourceKey, text } of changes) {
        const doc = docs.get(sourceKey)!;
        if (text === doc.content) dirty.delete(sourceKey); else dirty.set(sourceKey, text);
      }
      state();
      for (const section of sections) section.updateVariables();
      queueMicrotask(() => {
        if (!signal.aborted) editor.setSaveState(savePromise ? 'saving' : dirty.size ? 'dirty' : 'idle');
      });
    },
    onSave: () => { if (!changingSession) void saveAll(); },
    onHistory: controls,
    onGeometry: scheduleGeometry,
    onFold(index, collapsed) {
      const section = sections[index];
      section.collapsed = collapsed;
      folds.set(section.segment.sourceKey ?? section.segment.title, collapsed);
      try { sessionStorage.setItem(FOLDS_KEY, JSON.stringify([...folds])); } catch { /* Kept in memory. */ }
      section.toggle.setAttribute('aria-expanded', String(!collapsed));
      section.cell.hidden = collapsed;
      if (section.origin) section.origin.hidden = collapsed;
      closePopup();
      expand.textContent = sections.every((s) => !s.collapsed) ? S.collapseAll : S.expandAll;
      queueMicrotask(() => { if (!signal.aborted) animateSection(section, index); });
      scheduleGeometry();
    },
  });
  ctx.lifecycle.own(editor);
  function scheduleGeometry(): void {
    if (!geometryFrame) geometryFrame = requestAnimationFrame(() => { geometryFrame = 0; positionSides(); });
  }
  function positionSides(): void {
    root.style.setProperty('--prompt-rail-top', `${toolbar.offsetHeight + 12}px`);
    const geometry = editor.blockGeometry();
    const offset = editor.contentTop() - stage.getBoundingClientRect().top;
    const spacing = geometry.map((g, index) => {
      const section = sections[index];
      const top = `${g.top + offset}px`;
      section.label.style.top = top;
      section.cell.style.top = top;
      section.cell.style.height = `${g.height}px`;
      section.divider.style.top = top;
      section.divider.style.left = `${flags.offsetWidth}px`;
      const flagHeight = section.toggle.offsetHeight;
      section.label.style.setProperty('--prompt-flag-height', `${flagHeight}px`);
      const minHeight = Math.ceil(Math.max(50, section.note.offsetHeight + 12, section.origin && !g.collapsed ? flagHeight / 2 + section.origin.offsetHeight + 32 : 0));
      return { minHeight, padding: g.collapsed ? 0 : Math.max(0, Math.ceil(minHeight - (g.height - g.padding))) };
    });
    flags.style.height = rail.style.height = `${host.offsetHeight}px`;
    editor.setSpacing(spacing);
  }
  function applyWidths(): void {
    flags.style.flexBasis = `${colWidth.flags}px`;
    rail.style.flexBasis = `${colWidth.rail}px`;
    scheduleGeometry();
  }
  function bindGrip(grip: HTMLElement, side: 'flags' | 'rail'): void {
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const start = colWidth[side];
      const move = (e: PointerEvent) => {
        colWidth[side] = Math.max(100, Math.min(300, start + (e.clientX - startX) * (side === 'flags' ? 1 : -1)));
        applyWidths();
      };
      const end = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('lostpointercapture', end);
      };
      grip.addEventListener('pointermove', move, { signal });
      grip.addEventListener('lostpointercapture', end, { signal });
    }, { signal });
  }
  bindGrip(gripL, 'flags');
  bindGrip(gripR, 'rail');
  applyWidths();
  const observer = new ResizeObserver(scheduleGeometry);
  observer.observe(stage);
  observer.observe(toolbar);
  observer.observe(flags);
  observer.observe(rail);
  ctx.lifecycle.own({ dispose() { observer.disconnect(); cancelAnimationFrame(geometryFrame); } });

  let popup: HTMLElement | null = null;
  let popupChip: HTMLElement | null = null;
  function closePopup(): void {
    popup?.remove(); popup = null;
    popupChip?.setAttribute('aria-expanded', 'false'); popupChip = null;
  }
  document.addEventListener('click', (event) => {
    if (!popup?.contains(event.target as Node) && !popupChip?.contains(event.target as Node)) closePopup();
  }, { signal });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePopup(); }, { signal });
  document.addEventListener('scroll', (event) => {
    if (popup && !popup.contains(event.target as Node)) closePopup();
  }, { signal, capture: true, passive: true });
  ctx.lifecycle.own({ dispose: closePopup });

  function varPopup(v: PromptVar): HTMLElement {
    const pop = ui.h('div', 'varpop');
    pop.appendChild(ui.h('div', 'varpop-name mono', `{{${v.name}}}`));
    pop.appendChild(ui.h('div', 'varpop-desc', v.description));
    pop.appendChild(ui.h('div', 'varpop-label', v.multiline ? S.fillNowMultiline : S.fillNow));
    const val = ui.h('pre', 'mono varpop-value');
    val.textContent = v.value === undefined ? S.varUnreported : v.value === '' ? S.varEmpty : v.value;
    pop.appendChild(val);
    return pop;
  }

  function createSection(segment: PrefixSegment): Section {
    const doc = segment.sourceKey ? docs.get(segment.sourceKey) : undefined;
    const info = description(segment, doc);
    const collapsed = folds.get(segment.sourceKey ?? segment.title) ?? segment.sourceKey !== 'constitution';
    const tone = segment.sourceKey?.startsWith('worlds.') ? 'world' : doc ? 'persona' : 'derived';
    const label = ui.h('div', `prefix-label tone-${tone}`);
    label.dataset.source = segment.sourceKey || segment.title;
    const toggle = ui.button('', { onClick: () => open(section, section.collapsed) });
    toggle.className = 'prefix-flag';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const title = ui.h('span', 'prefix-flag-title', info.title);
    const key = segment.sourceKey?.startsWith('worlds.') ? segment.sourceKey : segment.title;
    const meta = ui.h('span', 'prefix-flag-meta');
    const badge = ui.h('span', 'prompt-section-badge');
    meta.append(ui.h('span', 'prefix-flag-key mono', key), badge);
    toggle.append(title, meta);
    label.append(toggle);
    const cell = ui.h('div', `prefix-railcell tone-${tone}`);
    const note = ui.h('div', 'prefix-railcontent');
    cell.append(note);
    cell.hidden = collapsed;
    const divider = ui.h('div', `prefix-divider tone-${tone}`);
    observer.observe(note);
    const section: Section = { segment, doc, tone, label, toggle, cell, note, badge, divider, collapsed, updateVariables() {} };
    if (!doc) {
      if (segment.sourceKey) note.append(ui.h('p', 'prompt-help', S.sourceMissing(segment.sourceKey)));
      return section;
    }
    if (doc.origin) {
      section.origin = ui.h('p', 'prompt-help prefix-origin');
      section.origin.hidden = collapsed;
      label.append(section.origin);
      observer.observe(section.origin);
    }
    const chips = new Map<string, HTMLButtonElement>();
    const warning = ui.h('div', 'prompt-railwarn');
    if (doc.vars?.length) {
      note.append(ui.h('div', 'prompt-rail-heading', S.variablesTitle), ui.h('p', 'prompt-help', S.insertHint));
      let previewing = false;
      const preview = ui.button(S.previewVariables, { size: 'sm', onClick: () => {
        closePopup();
        previewing = !previewing;
        editor.setPreview(doc.key, previewing);
        preview.textContent = previewing ? S.showVariableNames : S.previewVariables;
        preview.setAttribute('aria-pressed', String(previewing));
        if (previewing) void refreshVariables(doc.key);
      } });
      preview.classList.add('prompt-preview-toggle');
      preview.setAttribute('aria-pressed', 'false');
      const list = ui.h('div', 'prompt-variable-list');
      note.append(list, preview);
      for (const variable of doc.vars) {
        let insertPosition = 0;
        const chip = ui.button(variable.name, { size: 'sm', onClick: () => {
          if (popupChip === chip) { closePopup(); return; }
          closePopup();
          popup = varPopup(doc.vars?.find((v) => v.name === variable.name) ?? variable);
          root.ownerDocument.body.append(popup);
          popupChip = chip;
          chip.setAttribute('aria-expanded', 'true');
          const rect = chip.getBoundingClientRect();
          popup.style.left = `${Math.max(8, rect.left - popup.offsetWidth - 10)}px`;
          popup.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - popup.offsetHeight - 8))}px`;
        } });
        chip.className += ' varchip mono';
        chip.draggable = true;
        chip.setAttribute('aria-expanded', 'false');
        chip.addEventListener('mousedown', (event) => { if (event.detail === 1) insertPosition = editor.view.state.selection.main.head; }, { signal });
        chip.addEventListener('dblclick', () => { closePopup(); editor.insert(doc.key, variable.name, insertPosition); }, { signal });
        chip.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); closePopup(); editor.insert(doc.key, variable.name); }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const buttons = [...chips.values()];
            const next = buttons[buttons.indexOf(chip) + (event.key === 'ArrowDown' ? 1 : -1)];
            if (next) {
              next.focus({ preventScroll: true });
              if (popupChip !== next) next.click();
            }
          }
        }, { signal });
        chip.addEventListener('dragstart', (event) => {
          closePopup();
          event.dataTransfer!.setData(VARIABLE_DRAG_TYPE, JSON.stringify({ key: doc.key, name: variable.name }));
          event.dataTransfer!.effectAllowed = 'copy';
        }, { signal });
        chips.set(variable.name, chip);
        list.append(chip);
      }
    }
    note.append(warning);
    section.updateVariables = () => {
      const used = new Set(references(editor.text(doc.key)).map((r) => r.name));
      for (const [name, chip] of chips) chip.classList.toggle('varchip-unused', !used.has(name));
      const unknown = [...used].filter((name) => doc.vars?.find((v) => v.name === name)?.value === undefined);
      warning.textContent = unknown.length ? S.warnUnknownVars(unknown.join(S.listSep)) : '';
    };
    return section;
  }

  /**
   * Matches the sections to the current prefix plus the templates it omits. A section whose source and
   * template presence are unchanged is reused with its fold, preview and rail state.
   */
  function layout(): void {
    closePopup();
    const omitted = [...docs.values()].filter((doc) => doc.role && !segments.some((s) => s.sourceKey === doc.key));
    const wanted = [...segments, ...omitted.map((doc) => ({ title: doc.title, sourceKey: doc.key, text: '' }))];
    const id = (segment: PrefixSegment) => segment.sourceKey ? `${docs.has(segment.sourceKey)}:${segment.sourceKey}` : segment.title;
    const previous = [...sections];
    const created: Section[] = [];
    sections.splice(0, sections.length, ...wanted.map((segment) => {
      const at = previous.findIndex((section) => id(section.segment) === id(segment));
      if (at < 0) {
        const section = createSection(segment);
        created.push(section);
        return section;
      }
      const [section] = previous.splice(at, 1);
      section.segment = segment;
      return section;
    }));
    for (const gone of previous) {
      gone.label.remove(); gone.cell.remove(); gone.divider.remove();
      observer.unobserve(gone.note);
      if (gone.origin) observer.unobserve(gone.origin);
    }
    for (const section of sections) {
      flags.append(section.label);
      rail.append(section.cell);
      dividers.append(section.divider);
    }
    editor.setBlocks(sections.map(({ segment, doc, tone, collapsed }): PrefixBlock => ({
      title: segment.title, description: description(segment, doc).detail, sourceKey: doc?.key, tone,
      text: doc ? dirty.get(doc.key) ?? doc.content : segment.text, vars: doc?.vars, collapsed,
    })));
    full.textContent = segments.length ? segments.map((s) => s.text).join('') : S.prefixEmpty;
    expand.textContent = sections.every((s) => !s.collapsed) ? S.collapseAll : S.expandAll;
    for (const section of sections) section.updateVariables();
    if (created.length) void addSettings(created);
  }

  async function addSettings(targets: Section[]): Promise<void> {
    try {
      const manifest = await fetchManifest();
      if (signal.aborted) return;
      for (const section of targets) {
        const page = manifest.providers.find((p) => p.kind === 'world' && p.prompts?.some((p) => p.key === section.segment.sourceKey));
        if (!page) continue;
        section.toggle.querySelector('.prefix-flag-title')!.textContent = page.label;
        // World configuration is an advanced-mode page.
        if (readMode() !== 'advanced' || manifest.framework?.capabilities?.config === false || !page.configGroups?.length) continue;
        const settings = ui.button(S.worldSettings, { size: 'sm', variant: 'primary', onClick: () => {
          ctx.router.navigate(['provider', page.id, '~config']);
        } });
        settings.classList.add('prompt-settings-link');
        section.note.insertBefore(settings, section.note.querySelector('.prompt-railwarn'));
        scheduleGeometry();
      }
    } catch (error) { if (!signal.aborted) ctx.onError(error); }
  }
  async function refreshVariables(key: string): Promise<void> {
    try {
      const data = await get<{ prompts: PromptDoc[] }>('/api/prompts', { signal });
      if (signal.aborted) return;
      const section = sections.find((s) => s.doc?.key === key);
      const current = data.prompts.find((source) => source.key === key);
      if (!section || !current) return;
      closePopup();
      section.doc!.vars = current.vars;
      editor.updateVariables(key, current.vars ?? []);
      section.updateVariables();
    } catch (error) { if (!signal.aborted) say(S.loadFailed(String(error)), true); }
  }
  if (await refreshPreview() && !segments.length) say(S.prefixEmpty);
}

export const promptsFeature: FrameworkFeature = {
  route: 'prompts', label: S.title, icon: 'text', navMode: 'primary', needsAny: ['prompts'], mount: mountPrompts,
};
