const REGISTRY_URL = '/data/player-portraits.json?v=20260822-portrait1';
const TRUSTED_ASSET_ORIGIN = 'https://game-assets.swgoh.gg';
const clean = (value) => String(value ?? '').trim();

let registryPromise = null;
let registry = new Map();

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

function installRegistry(body = {}) {
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
  return registry;
}

async function loadPlayerPortraitRegistry() {
  if (registryPromise) return registryPromise;
  registryPromise = fetch(REGISTRY_URL, { cache: 'force-cache', credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Player portrait registry returned HTTP ${response.status}`);
      return installRegistry(await response.json());
    })
    .catch(() => {
      registry = new Map();
      return registry;
    });
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

export {
  REGISTRY_URL,
  TRUSTED_ASSET_ORIGIN,
  installRegistry,
  loadPlayerPortraitRegistry,
  normalizePortraitId,
  playerPortraitTexture,
  portraitRegistrySize,
  resolvePlayerPortraitUrl,
  trustedPortraitUrl,
};
