/** Local IPC stays direct even when a proxy is configured for downloads and model requests. */
function coreEnvironment(env) {
  const bypass = [...new Set([
    ...(env.NO_PROXY ?? '').split(','), ...(env.no_proxy ?? '').split(','),
    '127.0.0.1', 'localhost', '::1', '[::1]',
  ].map(s => s.trim()).filter(Boolean))].join(',');
  const own = PROXY_VARS.some(k => env[k]);
  // without proxy variables of its own the Core asks the app process per host (core/system-proxy.ts)
  return { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_USE_ENV_PROXY: '1', NO_PROXY: bypass, no_proxy: bypass, ...(own ? {} : { COOPANION_SYSTEM_PROXY: '1' }) };
}

const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
/** A lookup still unanswered after this long (an unreachable PAC script) counts as failed, and the request goes direct. */
const PROXY_LOOKUP_MS = 5000;

/** Where the Core's proxy comes from, as the line for core.log: proxy variables in `env` win over the system's. */
function proxySource(env) {
  return PROXY_VARS.some(k => env[k]) ? 'proxy: environment variables' : 'proxy: system, looked up per host as requests go out';
}

/**
 * The system proxy for `url`, as the Core asks for it (`companion:proxy`): `proxy` is the URL Node can use, or null
 * to go direct, and `rule` the first entry of the answer for the log. `resolveProxy` answers in Chromium's form
 * (`PROXY host:port; DIRECT`), PAC scripts included; its first entry decides. Node speaks HTTP and HTTPS proxies
 * only, so a SOCKS entry goes direct. A lookup that fails or outlasts PROXY_LOOKUP_MS goes direct too.
 * @param {string} url
 * @param {(url: string) => Promise<string>} resolveProxy
 * @returns {Promise<{ proxy: string | null, rule: string }>}
 */
async function lookupProxy(url, resolveProxy) {
  let answer;
  let timer;
  try {
    answer = await Promise.race([
      resolveProxy(url),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${PROXY_LOOKUP_MS} ms`)), PROXY_LOOKUP_MS); }),
    ]);
  } catch (e) {
    return { proxy: null, rule: `DIRECT (system proxy lookup failed: ${e instanceof Error ? e.message : e})` };
  } finally { clearTimeout(timer); }
  const first = String(answer).split(';')[0].trim();
  const [scheme, host] = first.split(/\s+/);
  if ((scheme === 'PROXY' || scheme === 'HTTPS') && host) return { proxy: `${scheme === 'HTTPS' ? 'https' : 'http'}://${host}`, rule: first };
  if (scheme?.startsWith('SOCKS')) return { proxy: null, rule: `DIRECT (system proxy ${first} is SOCKS, which Node cannot use)` };
  return { proxy: null, rule: 'DIRECT' };
}

module.exports = { coreEnvironment, proxySource, lookupProxy, PROXY_LOOKUP_MS };
