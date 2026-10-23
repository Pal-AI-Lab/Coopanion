/**
 * The `chatgpt` provider module: an endpoint signed in with a ChatGPT account (`auth.ts`) whose
 * requests are billed to the account's plan (`client.ts`). Models, thinking levels and context windows
 * are OpenAI's, from the vendor table's `CHATGPT`; there are no prices. The endpoint has no key: it is
 * ready once its `.env` holds a refresh token granted for the plan.
 *
 * Panel `chatgpt` of page `llm:chatgpt` signs an endpoint in and out, each method with the endpoint
 * name as its argument (the panel ships no browser bundle; the app's settings window draws it): `signIn` returns the authorization URL for the caller to open in the system
 * browser, `state` reports the sign-in (`SignInStatus`, with the plan's models once signed in), and
 * `signOut` revokes and removes the tokens.
 */
import { join } from 'node:path';
import type { ProviderModule, ProviderInstance } from 'cortico/providers/base.ts';
import type { ReasoningTier } from 'cortico/core/types.ts';
import { isContextOverflow } from 'cortico/providers/transport/errors.ts';
import { providersRoot } from 'cortico/paths.ts';
import { SIGN_IN_PANEL } from '../connect.ts';
import { cooText } from '../strings.ts';
import { CHATGPT, CHATGPT_MODULE, effortOf, siteOf } from '../vendors.ts';
import { CHATGPT_SERVICE, accountAt, signedIn, type ChatGPTAccount, type ChatGPTService, type SignInStatus } from './auth.ts';
import { ChatGPTResponses, listPlanModels } from './client.ts';

export { USAGE_LIMIT, usageLimited } from './client.ts';
export { signedIn } from './auth.ts';
export { SIGN_IN_PANEL };


const tiers = (t: ReturnType<typeof cooText>['tiers']): ReasoningTier[] => [
  { id: 'off', label: t.off, thinking: false },
  { id: 'low', label: t.low, thinking: true, effort: 'low' },
  { id: 'high', label: t.high, thinking: true, effort: 'high' },
  { id: 'max', label: t.max, thinking: true, effort: 'max' },
];

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The module against `service` (requests go to `service.api` whatever the endpoint's base URL), with endpoint directories under `stateRoot`; tests point both at local fakes. */
export function chatgptModule(service: ChatGPTService = CHATGPT_SERVICE, stateRoot: () => string = providersRoot, fetchImpl: typeof fetch = fetch): ProviderModule {
  const site = siteOf(CHATGPT, 'cn');
  return {
    id: CHATGPT_MODULE,
    title: 'ChatGPT',
    description: cooText('en').chatgpt.description,
    describe: { protocols: ['openai-responses'], auth: ['oauth'], local: false, input: ['text', 'image'] },
    localize: (language) => {
      const t = cooText(language);
      return { description: t.chatgpt.description, reasoningTiers: tiers(t.tiers) };
    },
    defaultBaseUrl: service.api,
    baseUrlSuggestions: [service.api],
    // the tokens go to the plan's API only, so the stored address is held to it
    normalize: (entry) => ({ ...entry, baseUrl: service.api }),
    reasoningTiers: tiers(cooText('en').tiers),
    serviceTiers: [],
    availability: (name, _entry, language) =>
      signedIn(join(stateRoot(), name)) ? { ready: true } : { ready: false, reason: cooText(language).chatgpt.signedOut },
    accepts: (entry, _spec, mime) => entry.multimodal === true && mime.startsWith('image/'),
    prices: () => [],
    contextOverflow: isContextOverflow,
    webUi: (host) => ({
      panels: [{ id: SIGN_IN_PANEL, title: cooText(host.language).chatgpt.panel }],
      invoke: async (panel, method, args) => {
        const name = args[0];
        if (panel !== SIGN_IN_PANEL || typeof name !== 'string' || !host.entries().some((e) => e.name === name)) throw new Error(`Unknown ChatGPT endpoint: ${String(name)}`);
        const instance = host.instance(name);
        const account = instance.control as ChatGPTAccount;
        if (method === 'signIn') {
          const t = cooText(host.language).chatgpt;
          const page = `<!doctype html><html lang="${host.language}"><meta charset="utf-8"><title>ChatGPT</title>`
            + `<body style="font:16px system-ui,sans-serif;max-width:32rem;margin:18vh auto;padding:0 24px"><p>${escapeHtml(t.returnToApp)}</p></body></html>`;
          return { url: await account.start(page) };
        }
        if (method === 'state') {
          const status: SignInStatus & { models?: string[] } = account.status();
          if (status.phase === 'done' && status.signedIn) status.models = (await instance.listModels!().catch(() => [])).map((m) => m.id);
          return status;
        }
        if (method === 'signOut') {
          await account.signOut();
          return account.status();
        }
        throw new Error(`Unknown method: ${method}`);
      },
    }),
    create(name, entry, host): ProviderInstance {
      const account = accountAt(host.stateDir, service, fetchImpl);
      const stated = (model: string) => CHATGPT.contextWindows?.[model];
      return {
        control: account,
        compatibilityKey: () => [CHATGPT_MODULE, name],
        contextWindow: stated,
        listModels: async () => (await listPlanModels(service.api, await account.accessToken(), fetchImpl))
          .map((m) => (stated(m.id) ? { ...m, contextWindow: stated(m.id) } : m)),
        client: new ChatGPTResponses({
          baseUrl: service.api,
          log: host.log,
          media: { enabled: () => (host.currentEntry?.() ?? entry).multimodal === true, read: host.readBlob },
          keepThinking: host.keepThinking,
          reasoningReplay: 'encrypted',
        }, { effort: (model) => effortOf(CHATGPT, site, model) }, account, host.log),
      };
    },
  };
}

export const CHATGPT_PROVIDER = chatgptModule();
