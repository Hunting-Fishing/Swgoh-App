const GAME_ASSET_BASE = 'https://game-assets.swgoh.gg/textures';
const LEGACY_ASSET_BASE = 'https://swgoh.gg/static/img/assets';
const GAC_SCOPE = '[data-workspace-panel="gac"],[data-gacv2-root],[data-gac-main-operations],[data-gac-manual-counter-planner]';
const state = new WeakMap();

const clean = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];

function normalizeAssetName(value) {
  const raw = clean(value);
  if (!raw) return '';
  const stripped = raw
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^static\/img\/assets\//i, '')
    .replace(/^textures\//i, '')
    .replace(/^\/+/, '')
    .replace(/\.(png|jpg|jpeg|webp)(?:\?.*)?$/i, '');
  const name = stripped.split('/').pop() || '';
  return /^tex\./i.test(name) ? name : '';
}

function gameAssetUrl(value) {
  const name = normalizeAssetName(value);
  return name ? `${GAME_ASSET_BASE}/${encodeURIComponent(name)}.png` : '';
}

function legacyAssetUrl(value) {
  const name = normalizeAssetName(value);
  return name ? `${LEGACY_ASSET_BASE}/${encodeURIComponent(name)}.png` : '';
}

function portraitCandidates(value) {
  const raw = clean(value);
  return unique([raw, gameAssetUrl(raw), legacyAssetUrl(raw)]);
}

function inGac(img) {
  return Boolean(img?.closest?.(GAC_SCOPE));
}

function currentIndex(img, candidates) {
  const current = clean(img.currentSrc || img.src || img.getAttribute?.('src'));
  const index = candidates.findIndex((candidate) => {
    try { return new URL(candidate, location.href).href === new URL(current, location.href).href; }
    catch { return candidate === current; }
  });
  return index >= 0 ? index : 0;
}

function prepareImage(img) {
  const candidates = portraitCandidates(img?.getAttribute?.('src') || img?.src);
  if (!candidates.length) return null;
  const value = { candidates, index: currentIndex(img, candidates) };
  state.set(img, value);
  if (img?.dataset) img.dataset.gacImageResilience = 'true';
  return value;
}

function fallbackText(img) {
  const portrait = img?.closest?.('[data-inspect-base-id]');
  const label = clean(
    img?.alt ||
    portrait?.querySelector?.('small')?.textContent ||
    portrait?.getAttribute?.('title') ||
    portrait?.dataset?.inspectBaseId ||
    '??'
  );
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  return label.slice(0, 2).toUpperCase() || '??';
}

function showInitials(img) {
  const parent = img?.parentElement;
  if (!parent) return;
  let fallback = [...parent.children].find((child) => child.classList?.contains('gac-image-fallback'));
  if (!fallback) {
    fallback = document.createElement('b');
    fallback.className = 'gac-image-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    parent.insertBefore(fallback, img);
  }
  fallback.textContent = fallbackText(img);
  fallback.hidden = false;
  img.hidden = true;
}

function advanceImage(img) {
  if (!inGac(img)) return false;
  const value = state.get(img) || prepareImage(img);
  if (!value) {
    showInitials(img);
    return false;
  }
  for (let index = value.index + 1; index < value.candidates.length; index += 1) {
    const next = value.candidates[index];
    if (!next) continue;
    value.index = index;
    state.set(img, value);
    img.hidden = false;
    img.src = next;
    return true;
  }
  showInitials(img);
  return false;
}

function injectStyle() {
  if (document.querySelector('link[data-gac-image-resilience-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-image-resilience.css?v=20260823-hotfix1';
  link.dataset.gacImageResilienceStyle = 'true';
  document.head.appendChild(link);
}

function installGacImageResilience() {
  if (window.__gacImageResilienceInstalled) return;
  window.__gacImageResilienceInstalled = true;
  injectStyle();
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !inGac(img)) return;
    advanceImage(img);
  }, true);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installGacImageResilience();

export { advanceImage, gameAssetUrl, installGacImageResilience, legacyAssetUrl, normalizeAssetName, portraitCandidates };
