/** Local IPC stays direct even when a proxy is configured for downloads and model requests. */
function coreEnvironment(env) {
  const bypass = [...new Set([
    ...(env.NO_PROXY ?? '').split(','), ...(env.no_proxy ?? '').split(','),
    '127.0.0.1', 'localhost', '::1', '[::1]',
  ].map(s => s.trim()).filter(Boolean))].join(',');
  return { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_USE_ENV_PROXY: '1', NO_PROXY: bypass, no_proxy: bypass };
}

const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
/**
 * The one URL the system proxy is looked up for. Under a PAC script other hosts may get a different
 * answer; a model service is the request that fails by region without a proxy, so its answer is the
 * one the Core uses for every host.
 */
const PROBE_URL = 'https://api.openai.com/';
/** A lookup still unanswered after this long (an unreachable PAC script) counts as failed, so the Core starts direct. */
const PROXY_LOOKUP_MS = 5000;

/**
 * Proxy variables for the Core from the system proxy, and the line that says where they came from.
 * Proxy variables already in `env` win and the system is not asked. `resolveProxy` answers in
 * Chromium's form (`PROXY host:port; DIRECT`); its first entry decides. Node's environment proxy
 * speaks HTTP and HTTPS proxies only, so a SOCKS entry leaves the Core direct.
 * A lookup that fails or outlasts PROXY_LOOKUP_MS also leaves it direct.
 * @param {NodeJS.ProcessEnv} env
 * @param {(url: string) => Promise<string>} resolveProxy
 * @returns {Promise<{ vars: Record<string, string>, note: string }>}
 */
async function systemProxyEnvironment(env, resolveProxy) {
  if (PROXY_VARS.some(k => env[k])) return { vars: {}, note: 'proxy: environment variables' };
  let rule;
  let timer;
  try {
    rule = await Promise.race([
      resolveProxy(PROBE_URL),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${PROXY_LOOKUP_MS} ms`)), PROXY_LOOKUP_MS); }),
    ]);
  } catch (e) {
    return { vars: {}, note: `proxy: none (system proxy lookup failed: ${e instanceof Error ? e.message : e})` };
  } finally { clearTimeout(timer); }
  const first = rule.split(';')[0].trim();
  const [scheme, host] = first.split(/\s+/);
  if ((scheme === 'PROXY' || scheme === 'HTTPS') && host) {
    const url = `${scheme === 'HTTPS' ? 'https' : 'http'}://${host}`;
    return { vars: Object.fromEntries(PROXY_VARS.map(k => [k, url])), note: `proxy: system ${first}` };
  }
  if (scheme?.startsWith('SOCKS')) return { vars: {}, note: `proxy: none (system proxy ${first} is SOCKS, which Node cannot use)` };
  return { vars: {}, note: 'proxy: none' };
}

module.exports = { coreEnvironment, systemProxyEnvironment, PROXY_LOOKUP_MS };
