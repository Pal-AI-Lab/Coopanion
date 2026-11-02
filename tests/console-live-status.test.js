// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createConsoleUi } from '../console/base/ui/index.ts';
import { createConnectionButton } from '../console/advanced/features/live/status.ts';

afterEach(() => document.body.replaceChildren());

it('opens the current connection while the page is up and stops listening once it goes', () => {
  const life = new AbortController();
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, f) => f, set() {} } });
  const opened = [];
  const button = createConnectionButton(ui, (name) => opened.push(name));
  document.body.append(button.el);
  expect(button.el.className).toBe('live-connection');
  button.render({ modelConnection: { name: 'main', model: 'm', module: 'x', moduleTitle: 'X', baseUrl: 'https://example.test' } });
  button.el.click();
  expect(opened).toEqual(['main']);
  life.abort();
  button.el.click();
  expect(opened).toEqual(['main']);
});
