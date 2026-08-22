const REGISTRY_URL = '/data/player-portraits.json?v=20260822-portrait2';
const FALLBACK_GAMEDATA_URL = 'https://raw.githubusercontent.com/swgoh-utils/gamedata/main/playerPortrait.json';
const TRUSTED_ASSET_ORIGIN = 'https://game-assets.swgoh.gg';
const TRUSTED_GAMEDATA_ORIGIN = 'https://raw.githubusercontent.com';
const clean = (value) => String(value ?? '').trim();

let registryPromise = null;
let registry = new Map();
let registrySource = 'none';

function normalizePortraitId(value) {
  const id = clean(value).toUpperCase();
  return /^PLAYERPORTRAIT_[A-Z0-9_]+$/.test(id) ? id : '';
}

function trustedPortraitUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw);
    if (url.origin !== TRUSTED_ASSET_ORIGIN || url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

function normalizeGameDataPortrait(row = {}) {
  const id = normalizePortraitId(row?.id || row?.portraitId || row?.definitionId);
  const icon = clean(row?.icon || row?.texture || row?.thumbnailName);
  if (!id || !/^tex\.[a-z0-9_.-]+$/i.test(icon)) return null;
  return Object.freeze({
    id,
    icon,
    image: `${TRUSTED_ASSET_ORIGIN}/${encodeURIComponent(icon)}.png`,
  });
}

function installRegistry(body = {}, source = 'local-cache') {
  const next = new Map();
  for (const row of Array.isArray(body?.portraits) ? body.portraits : []) {
    const id = normalizePortraitId(row?.id);
    const image = trustedPortraitUrl(row?.image);
    if (!id || !image) continue;
    next.set(id, Object.freeze({
      id,
      icon: clean(row?.icon),
      image,
    }));
  }
  registry = next;
  registrySource = registry.size ? source : 'none';
  return registry;
}

function installGameDataRegistry(body = {}) {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  const portraits = rows.map(normalizeGameDataPortrait).filter(Boolean);
  return installRegistry({ portraits }, 'public-gamedata-fallback');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Player portrait registry returned HTTP ${response.status}`);
  return response.json();
}

async function loadLocalRegistry() {
  const body = await fetchJson(REGISTRY_URL, { cache: 'force-cache', credentials: 'same-origin' });
  return installRegistry(body, 'local-cache');
}

async function loadFallbackRegistry() {
  const url = new URL(FALLBACK_GAMEDATA_URL);
  if (url.origin !== TRUSTED_GAMEDATA_ORIGIN || url.protocol !== 'https:') return registry;
  const body = await fetchJson(url.href, { cache: 'force-cache', credentials: 'omit', mode: 'cors' });
  return installGameDataRegistry(body);
}

async function loadPlayerPortraitRegistry() {
  if (registryPromise) return registryPromise;
  registryPromise = (async () => {
    try {
      const local = await loadLocalRegistry();
      if (local.size) return local;
    } catch {
      registry = new Map();
      registrySource = 'none';
    }
    try {
      return await loadFallbackRegistry();
    } catch {
      registry = new Map();
      registrySource = 'none';
      return registry;
    }
  })();
  return registryPromise;
}

function resolvePlayerPortraitUrl(portraitId, directUrl = '') {
  const direct = trustedPortraitUrl(directUrl);
  if (direct) return direct;
  const id = normalizePortraitId(portraitId);
  return id ? clean(registry.get(id)?.image) : '';
}

function playerPortraitTexture(portraitId) {
  const id = normalizePortraitId(portraitId);
  return id ? clean(registry.get(id)?.icon) : '';
}

function portraitRegistrySize() {
  return registry.size;
}

function portraitRegistryStatus() {
  return Object.freeze({
    size: registry.size,
    source: registrySource,
    localUrl: REGISTRY_URL,
    fallbackUrl: FALLBACK_GAMEDATA_URL,
  });
}

export {
  FALLBACK_GAMEDATA_URL,
  REGISTRY_URL,
  TRUSTED_ASSET_ORIGIN,
  TRUSTED_GAMEDATA_ORIGIN,
  installGameDataRegistry,
  installRegistry,
  loadPlayerPortraitRegistry,
  normalizeGameDataPortrait,
  normalizePortraitId,
  playerPortraitTexture,
  portraitRegistrySize,
  portraitRegistryStatus,
  resolvePlayerPortraitUrl,
  trustedPortraitUrl,
};
