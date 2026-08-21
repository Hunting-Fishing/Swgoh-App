function clean(value) {
  return String(value ?? '').trim();
}

function firstForwardedValue(value) {
  return clean(value).split(',')[0]?.trim() || '';
}

function normalizeOrigin(value) {
  const raw = clean(value).replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function requestPublicOrigin(request) {
  const headers = request?.headers || {};
  const forwardedHost = firstForwardedValue(headers['x-forwarded-host'] ?? headers.get?.('x-forwarded-host'));
  const host = forwardedHost || firstForwardedValue(headers.host ?? headers.get?.('host'));
  if (!host) return '';

  const forwardedProto = firstForwardedValue(headers['x-forwarded-proto'] ?? headers.get?.('x-forwarded-proto'));
  const proto = forwardedProto || 'https';
  return normalizeOrigin(`${proto}://${host}`);
}

export function canonicalBrowserRedirect(request, url, configuredOrigin) {
  const canonicalOrigin = normalizeOrigin(configuredOrigin);
  if (!canonicalOrigin || !url || request?.method !== 'GET') return null;

  const currentOrigin = requestPublicOrigin(request);
  if (!currentOrigin || currentOrigin === canonicalOrigin) return null;

  const isBrowserRoute = !url.pathname.startsWith('/api/');
  const isSocialOauthStart = /^\/api\/auth\/oauth\/(discord|google)$/.test(url.pathname);
  if (!isBrowserRoute && !isSocialOauthStart) return null;

  return new URL(`${url.pathname}${url.search}`, canonicalOrigin).href;
}

export { normalizeOrigin, requestPublicOrigin };
