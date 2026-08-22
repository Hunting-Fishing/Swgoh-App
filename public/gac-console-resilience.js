const GATEWAY_ERROR_TTL_MS = 15000;
const BLOCKED_SWGOH_GG_ASSET = /^https:\/\/swgoh\.gg\/static\/img\/assets\//i;
const gatewayCache = new Map();

function cacheKey(input, init = {}) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  if (method !== 'GET') return '';
  let url;
  try {
    url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  } catch {
    return '';
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return '';
  const params = new URLSearchParams(url.searchParams);
  params.delete('refresh');
  const query = params.toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

function gatewayStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function responseFrom(entry) {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

function purgeGatewayCache(now = Date.now()) {
  for (const [key, entry] of gatewayCache.entries()) {
    if (entry.expiresAt <= now) gatewayCache.delete(key);
  }
}

function installGatewayCircuitBreaker() {
  if (typeof window === 'undefined' || window.__gacGatewayCircuitBreakerInstalled) return;
  window.__gacGatewayCircuitBreakerInstalled = true;
  const baseFetch = window.fetch.bind(window);
  window.fetch = async function gacResilientFetch(input, init = {}) {
    const key = cacheKey(input, init);
    if (!key) return baseFetch(input, init);

    const now = Date.now();
    purgeGatewayCache(now);
    const cached = gatewayCache.get(key);
    if (cached?.expiresAt > now) return responseFrom(cached);

    const response = await baseFetch(input, init);
    if (!gatewayStatus(response.status)) return response;

    const entry = {
      body: await response.clone().text(),
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      expiresAt: Date.now() + GATEWAY_ERROR_TTL_MS,
    };
    gatewayCache.set(key, entry);
    return response;
  };
}

function blockedPortraitPlaceholder() {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#071522"/><circle cx="32" cy="32" r="21" fill="none" stroke="#54d7ff" stroke-width="3"/><path d="M32 18l5 9 10 2-7 7 2 10-10-5-10 5 2-10-7-7 10-2z" fill="#54d7ff"/></svg>');
}

function installBlockedPortraitGuard() {
  if (typeof window === 'undefined' || typeof HTMLImageElement === 'undefined' || window.__gacBlockedPortraitGuardInstalled) return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!descriptor?.get || !descriptor?.set) return;
  window.__gacBlockedPortraitGuardInstalled = true;
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) {
      const next = String(value || '');
      if (BLOCKED_SWGOH_GG_ASSET.test(next)) {
        this.dataset.gacBlockedExternalAsset = 'swgoh-gg';
        descriptor.set.call(this, blockedPortraitPlaceholder());
        return;
      }
      descriptor.set.call(this, value);
    },
  });
}

if (typeof window !== 'undefined') {
  installGatewayCircuitBreaker();
  installBlockedPortraitGuard();
}

export {
  BLOCKED_SWGOH_GG_ASSET,
  GATEWAY_ERROR_TTL_MS,
  cacheKey,
  gatewayStatus,
  installBlockedPortraitGuard,
  installGatewayCircuitBreaker,
};
