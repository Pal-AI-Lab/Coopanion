/** Which service addresses may use plain http. Imports nothing, so the desktop pet World applies the same rule to its transcription service. */

/** An http address outside this computer and the private networks: what is sent there, the key included, is readable on the way. */
export function plainRemote(baseUrl: string): boolean {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return false; }
  return url.protocol === 'http:' && !privateHost(url.hostname);
}

/**
 * This computer and the private networks: loopback, RFC 1918, link-local, the 100.64/10 shared range
 * (Tailscale and carrier NAT), IPv6 unique-local and link-local, and LAN names (one label, or .local,
 * .lan, .home.arpa, .internal).
 */
function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || /\.(local|lan|home\.arpa|internal)$/.test(host)) return true;
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(':')) return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  return !host.includes('.');
}
