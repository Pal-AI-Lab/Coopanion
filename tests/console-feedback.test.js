// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { actionProblem, listProblem } from '../console/base/ui/problem.ts';
import { ERROR_TOAST_MS, TOAST_MS } from '../console/base/ui/overlay.ts';

let life;
afterEach(() => { life?.abort(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });
function setup() {
  life = new AbortController();
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 800 });
  return { ui, report: actionProblem(ui, document, life.signal) };
}
const bounds = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

it('keeps an operation error at its captured control after focus moves and removes it with its page', () => {
  const { report } = setup();
  const content = document.createElement('main'); content.className = 'featureslot';
  const save = document.createElement('button'), other = document.createElement('input');
  content.append(save, other); document.body.append(content);
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(bounds(200, 0, 600, 600));
  vi.spyOn(save, 'getBoundingClientRect').mockReturnValue(bounds(650, 200, 100, 30));
  other.focus(); report(save, 'Save failed');
  const popup = document.querySelector('.extension-problem:not(.hidden)');
  expect(popup.textContent).toContain('Save failed');
  expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(208);
  expect(content.textContent).not.toContain('Save failed');
  expect(document.activeElement).toBe(other);
  life.abort(); expect(popup.isConnected).toBe(false);
  report(save, 'Late response'); expect(document.querySelector('[role=alert]:not(.hidden)')).toBeNull();
});

it('pauses a timed error notification while hovered and expires it after reading', () => {
  vi.useFakeTimers();
  const { ui, report } = setup();
  const button = document.createElement('button'); document.body.append(button);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(bounds(250, -100, 100, 30));
  report(button, 'A long error that must remain readable');
  const toast = document.querySelector('.toast');
  const read = 1000;
  vi.advanceTimersByTime(read);
  toast.dispatchEvent(new Event('pointerenter'));
  vi.advanceTimersByTime(ERROR_TOAST_MS * 2);
  expect(document.querySelector('[role=alert]:not(.hidden)')?.textContent).toContain('remain readable');
  toast.dispatchEvent(new Event('pointerleave'));
  vi.advanceTimersByTime(ERROR_TOAST_MS - read - 1);
  expect(document.querySelector('[role=alert]:not(.hidden)')).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(document.querySelector('[role=alert]:not(.hidden)')).toBeNull();
  ui.toast('Saved', 'ok'); vi.advanceTimersByTime(TOAST_MS);
  expect(document.querySelector('.toast')).toBeNull();
});

it('lets clicks through an ordinary toast, and Escape inside an error toast leaves the drawer beneath open', () => {
  const { ui } = setup();
  // the toast rules of the settings window's stylesheet
  const style = document.createElement('style');
  style.textContent = readFileSync(join(process.cwd(), 'console', 'styles.css'), 'utf8').match(/^\s*\.toast(\.bad)?\s*\{[^}]*\}/gm).join('\n');
  document.head.append(style);
  ui.toast('Saved', 'ok');
  expect(getComputedStyle(document.querySelector('.toast')).pointerEvents).toBe('none');
  ui.drawer('Details', 'Body');
  ui.toast('Save failed', 'bad');
  const close = document.querySelector('.toast.bad button');
  expect(getComputedStyle(close.closest('.toast')).pointerEvents).toBe('auto');
  close.focus();
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.toast')).toBeNull();
  expect(document.querySelector('.modal')).not.toBeNull();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.modal')).toBeNull();
  style.remove();
});

it('keeps a failed read retry available without an unhandled rejection', async () => {
  setup(); let offline = true;
  const node = listProblem(document, 'Read failed', 'Retry', async () => {
    if (offline) throw new Error('Still offline');
    node.remove();
  });
  document.body.append(node);
  node.querySelector('button').click();
  await vi.waitFor(() => expect(node.textContent).toContain('Still offline'));
  expect(node.querySelector('button').disabled).toBe(false);
  offline = false; node.querySelector('button').click();
  await vi.waitFor(() => expect(node.isConnected).toBe(false));
});

it('dismisses a detail panel fallback when the panel closes but its parent page stays mounted', () => {
  const { ui } = setup();
  const detail = new AbortController();
  const report = actionProblem(ui, document, detail.signal);
  report(null, 'Detail save failed');
  expect(document.querySelector('.toast.bad')?.textContent).toContain('Detail save failed');
  detail.abort();
  expect(life.signal.aborted).toBe(false);
  expect(document.querySelector('.toast.bad')).toBeNull();
});

it('keeps market toolbar errors within its content padding and scrollbar gutter', () => {
  const { report } = setup();
  const toolbar = document.createElement('div'); toolbar.className = 'extension-toolbar';
  toolbar.style.paddingRight = '30px';
  const button = document.createElement('button'); toolbar.append(button); document.body.append(toolbar);
  Object.defineProperty(toolbar, 'clientWidth', { configurable: true, value: 580 });
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(bounds(200, 100, 600, 60));
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(bounds(650, 110, 100, 30));
  const popup = document.querySelector('.extension-problem');
  vi.spyOn(popup, 'getBoundingClientRect').mockReturnValue(bounds(0, 0, 500, 40));
  report(button, 'Market request failed');
  expect(parseFloat(popup.style.left) + 500).toBeLessThanOrEqual(750);
  expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(208);
});
