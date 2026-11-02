/**
 * A ChatGPT plan's sign-in in the settings window: on the Start page's ChatGPT pick and in the advanced
 * editor of a `chatgpt` endpoint. The authorization page opens in the system browser (the main
 * process sends every page off the console there); the sign-in runs in the Core, in Coo Pet
 * Provider's `chatgpt` module, through its console methods (`connect.ts`).
 */

import { actionProblem } from '../../base/ui/problem.ts';
import type { WebUi } from 'cortico/web/shared/client-panel.ts';
import { chatgptState, signInChatGPT, signOutChatGPT, type SignInState } from 'cortico-provider-coo/src/connect.ts';
import { signInReason } from 'cortico-provider-coo/src/strings.ts';
import { LANGUAGE } from '../../base/language.ts';
import { consoleCall } from '../home/model.ts';
import { S } from './strings.ts';

export { S as CHATGPT_TEXT };

/** Opens the authorization page, which the main process takes to the system browser. */
export const openInBrowser = (url: string): void => { window.open(url, '_blank'); };

/** Signs the `chatgpt` endpoint `name` out (its refresh token revoked) before it is deleted; a failure does not stop the deletion. */
export const signOutBeforeDelete = (name: string, signal?: AbortSignal): Promise<unknown> => signOutChatGPT(consoleCall(signal), name).catch(() => {});

/** The account line of the saved `chatgpt` endpoint `name` with its sign-in and sign-out buttons, and the quota note. */
export function accountRow(ui: WebUi, name: string, signal: AbortSignal): HTMLElement {
  const call = consoleCall(signal);
  let current: SignInState | undefined;
  const line = ui.msgline('');
  const problem = actionProblem(ui, line.ownerDocument, signal);
  const signIn = ui.button(S.go, { variant: 'primary' });
  const signOut = ui.button(S.signOut, { size: 'sm' });
  signOut.hidden = true;
  /**
   * `ran` marks the result of a sign-in started here; only its failure opens beside the sign-in button.
   * Core keeps a failed outcome until the next sign-in, so an earlier failure shows in the line.
   */
  const show = (state: SignInState, ran = false) => {
    if (signal.aborted) return;
    current = state;
    const failure = state.phase === 'failed' ? S.failed(signInReason(state.reason ?? '', LANGUAGE)) : null;
    const inline = failure !== null && !ran && !state.signedIn;
    line.textContent = state.signedIn ? S.signedIn(state.email ?? '') : inline ? failure : S.signedOut;
    line.classList.toggle('bad', inline);
    if (failure && ran) problem(signIn, failure);
    signOut.hidden = !state.signedIn;
  };
  signIn.addEventListener('click', async () => {
    signIn.disabled = true;
    line.textContent = S.waiting;
    line.classList.remove('bad');
    try {
      show(await signInChatGPT(call, name, openInBrowser, { signal }), true);
    } catch (err) {
      if (signal.aborted) return;
      line.textContent = current?.signedIn ? S.signedIn(current.email ?? '') : S.signedOut;
      problem(signIn, S.failed(err instanceof Error ? err.message : String(err)));
    } finally {
      signIn.disabled = false;
    }
  }, { signal });
  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    try { show(await signOutChatGPT(call, name)); }
    catch (err) { problem(signOut, err instanceof Error ? err.message : String(err)); } finally { signOut.disabled = false; }
  }, { signal });
  void chatgptState(call, name).then(show, () => {});
  const row = ui.rowbar();
  row.append(signIn, signOut, line);
  const box = ui.h('div', 'chatgpt-account');
  box.append(row, ui.h('p', 'home-note', S.quota));
  return box;
}
