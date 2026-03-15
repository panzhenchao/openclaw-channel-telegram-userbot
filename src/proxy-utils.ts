/**
 * Proxy URL parsing — converts URL string to GramJS proxy config.
 *
 * Ported from Python: telegram-client-sikill/channel/utils.py:parse_proxy_url()
 */

import type { GramJSProxy } from "./types.ts";

/**
 * Parse a proxy URL string into GramJS proxy format.
 *
 * Supports:
 *   socks5://host:port
 *   socks5://user:pass@host:port
 *   socks4://host:port
 *   http://host:port (treated as HTTP CONNECT proxy)
 *
 * Returns undefined if the URL is invalid or unsupported.
 */
export function parseProxyUrl(proxyUrl: string | undefined): GramJSProxy | undefined {
  if (!proxyUrl) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    console.error(`[telegram-userbot] Invalid proxy URL: ${proxyUrl}`);
    return undefined;
  }

  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  const hostname = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 1080;

  if (!hostname) {
    console.error(`[telegram-userbot] Proxy URL missing hostname: ${proxyUrl}`);
    return undefined;
  }

  if (port < 1 || port > 65535) {
    console.error(`[telegram-userbot] Proxy port out of range: ${port}`);
    return undefined;
  }

  if (scheme === "socks5" || scheme === "socks4" || scheme === "http" || scheme === "https") {
    if (scheme === "http" || scheme === "https") {
      console.warn(
        `[telegram-userbot] GramJS does not natively support HTTP proxies. ` +
        `Treating ${scheme}:// as SOCKS5 — this works if your proxy supports both protocols.`,
      );
    }
    const socksType: 4 | 5 = scheme === "socks4" ? 4 : 5;
    const proxy: GramJSProxy = {
      ip: hostname,
      port,
      socksType,
    };
    if (parsed.username) proxy.username = decodeURIComponent(parsed.username);
    if (parsed.password) proxy.password = decodeURIComponent(parsed.password);
    return proxy;
  }

  console.error(`[telegram-userbot] Unsupported proxy scheme '${scheme}', ignoring proxy`);
  return undefined;
}
