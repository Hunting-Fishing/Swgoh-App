import { buildRoteTacticalPlanetModel } from './rote-tactical-node-model.js';
import { hydrateRoteTacticalNodeButtons } from './rote-tactical-node-renderer.js';

let catalogPromise = null;
let scheduled = false;

function liveSnapshot() {
  return typeof window === 'undefined' ? null : window.__swgohLiveSnapshot || null;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-rote-tactical-node-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/rote-tactical-node-v2.css?v=20260820-tactical1';
  link.dataset.roteTacticalNodeCss = 'true';
  document.head.appendChild(link);
}

async function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch('/data/catalog.json', { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Static catalog returned HTTP ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload?.units) ? payload : { units: [] };
    })
    .catch(() => ({ units: [] }));
  return catalogPromise;
}

function tacticalSignature(root, catalog) {
  const snapshot = liveSnapshot();
  return [
    root?.dataset?.signature || '',
    root?.dataset?.roteZoomPlanet || '',
    snapshot?.allyCode || '',
    snapshot?.fetchedAt || 0,
    Array.isArray(catalog?.units) ? catalog.units.length : 0,
  ].join('|');
}

async function enhanceOverlay(root) {
  if (!root?.isConnected) return null;
  const planetId = String(root.dataset.roteZoomPlanet || '').trim();
  if (!planetId) return null;

  const sourceSignature = root.dataset.signature || '';
  const catalog = await loadCatalog();
  if (!root.isConnected || String(root.dataset.roteZoomPlanet || '') !== planetId || String(root.dataset.signature || '') !== sourceSignature) return null;

  const signature = tacticalSignature(root, catalog);
  if (root.dataset.roteTacticalSignature === signature) return null;

  const model = buildRoteTacticalPlanetModel(planetId, {
    body: liveSnapshot()?.body || null,
    catalog,
  });
  if (!model) return null;

  const result = hydrateRoteTacticalNodeButtons(root, model, catalog);
  root.dataset.roteTacticalSignature = signature;
  root.dataset.roteTacticalHydrated = String(result.hydrated || 0);
  root.dataset.roteTacticalMissing = result.missingButtons.join(',');
  return result;
}

async function enhanceAll() {
  scheduled = false;
  const roots = [...document.querySelectorAll('.rote-planet-zoom[data-rote-zoom-planet]')];
  for (const root of roots) await enhanceOverlay(root);
}

function scheduleEnhance() {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return;
  scheduled = true;
  requestAnimationFrame(() => {
    enhanceAll().catch(() => {});
  });
}

export function installRoteTacticalMapIntegration() {
  ensureStylesheet();
  scheduleEnhance();

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('swgoh:workspace-activated', scheduleEnhance);
  document.getElementById('allyForm')?.addEventListener('submit', () => setTimeout(scheduleEnhance, 650));

  return Object.freeze({ observer, scheduleEnhance });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installRoteTacticalMapIntegration, { once: true });
  else installRoteTacticalMapIntegration();
}
