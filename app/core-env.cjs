/** Local IPC stays direct even when a proxy is configured for downloads and model requests. */
function coreEnvironment(env) {
  const bypass = [...new Set([
    ...(env.NO_PROXY ?? '').split(','), ...(env.no_proxy ?? '').split(','),
    '127.0.0.1', 'localhost', '::1', '[::1]',
  ].map(s => s.trim()).filter(Boolean))].join(',');
  return { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_USE_ENV_PROXY: '1', NO_PROXY: bypass, no_proxy: bypass };
}
module.exports = { coreEnvironment };
