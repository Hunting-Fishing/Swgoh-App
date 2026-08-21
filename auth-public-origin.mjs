function clean(value) {
  return String(value || '').trim();
}

export function normalizePublicOrigin(value) {
  const raw = clean(value).replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function resolveRequestOrigin(request) {
  const host = clean(request?.headers?.['x-forwarded-host'] || request?.headers?.host).split(',')[0].trim();
  const proto = clean(clean(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  if (!host) return '';
  return normalizePublicOrigin(`${proto}://${host}`);
}

export function resolvePublicOrigin(request, configuredOrigin = '') {
  const explicit = normalizePublicOrigin(configuredOrigin);
  if (explicit) return explicit;
  return resolveRequestOrigin(request);
}
