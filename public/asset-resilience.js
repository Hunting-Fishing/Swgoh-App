import './gac-war-room-v3.js';
import './gac-manual-war-room-bridge.js';
import './gac-board-editor-stability-fix.js';
import './gac-manual-counter-planner.js';
import './gac-cleanup-attack-brief.js';
import './gac-datacron-counter-intelligence-ui.js';
import './gac-fleet-round-operations.js';
import './gac-fleet-attempt-history.js';
import './gac-fleet-cleanup-control.js';
import './gac-fleet-cleanup-provenance.js';

const state = {
  loaded: false,
  loading: null,
  byId: new Map(),
  byName: new Map(),
};

const clean = (value) => String(value ?? '').trim();
const idKey = (value) => clean(value).toUpperCase();
const nameKey = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');

function imageCandidate(unit = {}) {
  return clean(
    unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl ||
    unit.thumbnail || unit.icon || unit.iconUrl
  );
}

function indexCatalog(units = []) {
  state.byId.clear();
  state.byName.clear();
  for (const unit of Array.isArray(units) ? units : []) {
    const baseId = idKey(unit?.baseId || unit?.id);
    const name = nameKey(unit?.name);
    if (baseId) state.byId.set(baseId, unit);
    if (name && !state.byName.has(name)) state.byName.set(name, unit);
  }
  state.loaded = true;
}

async function ensureCatalog() {
  if (state.loaded) return;
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    indexCatalog(shared);
    return;
  }
  if (state.loading) return state.loading;
  state.loading = fetch('/data/catalog.json?asset-resilience=1', { cache: 'force-cache' })
    .then((response) => response.ok ? response.json() : null)
    .then((body) => indexCatalog(body?.units || []))
    .catch(() => indexCatalog([]))
    .finally(() => { state.loading = null; });
  return state.loading;
}

function contextBaseId(img) {
  const host = img.closest?.('[data-inspect-base-id],[data-base-id],[data-unit-id],[data-target-base-id]');
  return idKey(
    host?.dataset?.inspectBaseId || host?.dataset?.baseId || host?.dataset?.unitId || host?.dataset?.targetBaseId ||
    img.dataset?.baseId || img.dataset?.unitId
  );
}

function contextName(img) {
  const direct = clean(img.alt || img.title);
  if (direct) return direct;
  const host = img.closest?.('article,li,tr,.card,.command-dashboard-row,.journey-current-card,.gac-unit-name,.gac-live-unit');
  return clean(
    host?.querySelector?.('[data-unit-name]')?.textContent ||
    host?.querySelector?.('strong')?.textContent ||
    host?.querySelector?.('h4,h5')?.textContent
  );
}

function fallbackHost(img, name = '') {
  const parent = img.parentElement;
  if (!parent || parent.querySelector(':scope > .asset-resilience-fallback')) return;
  const fallback = document.createElement('span');
  fallback.className = 'asset-resilience-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  const initials = clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  fallback.textContent = initials || '◆';
  img.hidden = true;
  parent.appendChild(fallback);
}

async function repairImage(img) {
  if (!(img instanceof HTMLImageElement) || img.dataset.assetRepairDone === 'true') return;
  img.dataset.assetRepairDone = 'true';
  await ensureCatalog();
  const baseId = contextBaseId(img);
  const name = contextName(img);
  const unit = (baseId && state.byId.get(baseId)) || (name && state.byName.get(nameKey(name))) || null;
  const candidate = imageCandidate(unit || {});
  if (candidate && candidate !== img.currentSrc && candidate !== img.src) {
    img.hidden = false;
    img.dataset.assetRepairDone = 'retry';
    img.src = candidate;
    return;
  }
  fallbackHost(img, name || unit?.name || baseId);
}

function installStyle() {
  if (document.querySelector('style[data-asset-resilience]')) return;
  const style = document.createElement('style');
  style.dataset.assetResilience = 'true';
  style.textContent = `
    .asset-resilience-fallback{display:grid;place-items:center;width:100%;height:100%;min-width:2rem;min-height:2rem;background:linear-gradient(145deg,#16324a,#071522);color:#75e8ff;font-weight:900;letter-spacing:.04em;border-radius:inherit;overflow:hidden}
    img[hidden]+.asset-resilience-fallback{visibility:visible}
  `;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') {
  installStyle();
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) void repairImage(event.target);
  }, true);
}

export { imageCandidate, nameKey, idKey, repairImage };
