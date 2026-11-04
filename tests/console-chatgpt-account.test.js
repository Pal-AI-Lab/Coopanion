// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { signInReason } from 'cortico-provider-coo/src/strings.ts';
import { accountRow, CHATGPT_TEXT as S } from '../console/features/chatgpt/index.ts';
import { LANGUAGE } from '../console/base/language.ts';
import { createConsoleUi } from '../console/base/ui/index.ts';

const json = (body) => new Response(JSON.stringify(body), { status: 200 });
let life;
afterEach(() => { life?.abort(); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('keeps a failure Core still holds from an earlier sign-in in the account line, and opens only the failure of a sign-in started here', async () => {
  // Core answers every state read with the outcome of the last sign-in, which failed
  vi.stubGlobal('fetch', async (path) => {
    const method = String(path).split('/').at(-1);
    if (method === 'state') return json({ signedIn: false, email: null, phase: 'failed', reason: 'access_denied' });
    if (method === 'signIn') return json({ url: 'https://auth.test/authorize' });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.spyOn(window, 'open').mockReturnValue(null);
  life = new AbortController();
  const ui = createConsoleUi({ doc: document, overlayHost: document.body, signal: life.signal, memo: { get: (_, fallback) => fallback, set() {} } });
  const row = accountRow(ui, 'chatgpt', life.signal);
  document.body.append(row);
  const failure = S.failed(signInReason('access_denied', LANGUAGE));
  const line = row.querySelector('.msgline');
  await vi.waitFor(() => expect(line.textContent).toBe(failure));
  expect(document.querySelector('[role=alert]:not(.hidden)')).toBeNull();

  [...row.querySelectorAll('button')].find((el) => el.textContent === S.go).click();
  await vi.waitFor(() => expect(document.querySelector('[role=alert]:not(.hidden)')?.textContent).toContain(failure), { timeout: 5000 });
  expect(line.textContent).toBe(S.signedOut);
});
