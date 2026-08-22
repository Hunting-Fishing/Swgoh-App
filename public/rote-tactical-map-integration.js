import { buildRoteTacticalPlanetModel } from './rote-tactical-node-model.js';
import { hydrateRoteTacticalNodeButtons } from './rote-tactical-node-renderer.js';
import { roteTacticalReadinessMarkup } from './rote-tactical-readiness-ui.js';
import { buildRoteObservedMissionResults, roteObservedMissionResultsMarkup } from './rote-observed-results-ui.js';
import './guild-rote-tactical-readiness-matrix-ui.js';

let catalogPromise = null;
let scheduled = false;

function liveSnapshot() {
  return typeof window === 'undefined' ? null : window.__swgohLiveSnapshot || null;
}

function tbAttemptSnapshot() {
  return typeof window === 'undefined' ? null : window.__swgohTbMissionAttemptSnapshot || null;
}

function ensureStylesheet(selector, href, datasetKey) {
  if (document.querySelector(selector)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset[datasetKey] = 'true';
  document.head.appendChild(link);
}

function ensureStylesheets() {
  ensureStylesheet('link[data-rote-tactical-node-css]', '/rote-tactical-node-v2.css?v=20260820-tactical1', 'roteTacticalNodeCss');
  ensureStylesheet('link[data-rote-tactical-readiness-css]', '/rote-tactical-readiness-v2.css?v=20260820-tactical2', 'roteTacticalReadinessCss');
  ensureStylesheet('link[data-rote-observed-results-css]', '/rote-observed-results-ui.css?v=20260822-n6', 'roteObservedResultsCss');
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

function attemptSnapshotSignature(snapshot = null) {
  if (!snapshot) return 'no-attempt-snapshot';
  const explicit = String(snapshot?.signature || snapshot?.version || snapshot?.fetchedAt || '').trim();
  if (explicit) return explicit;
  const attempts = Array.isArray(snapshot?.attempts) ? snapshot.attempts : [];
  return attempts.map((row) => [
    row?.id || '',
    row?.eventId || row?.event_id || '',
    row?.missionId || row?.mission_id || '',
    row?.playerId || row?.player_id || row?.allyCode || row?.ally_code || '',
    row?.outcome || row?.result || '',
    row?.reportedAt || row?.reported_at || '',
  ].join(':')).join('|');
}

function tacticalSignature(root, catalog) {
  const snapshot = liveSnapshot();
  const attempts = tbAttemptSnapshot();
  return [
    root?.dataset?.signature || '',
    root?.dataset?.roteZoomPlanet || '',
    snapshot?.allyCode || '',
    snapshot?.fetchedAt || 0,
    Array.isArray(catalog?.units) ? catalog.units.length : 0,
    attempts?.eventId || attempts?.event?.id || 'no-active-event',
    attemptSnapshotSignature(attempts),
  ].join('|');
}

function selectedTacticalNode(root, model) {
  const button = root?.querySelector?.('.rote-zoom-node.selected[data-rote-zoom-node], [data-rote-zoom-node].selected');
  const nodeId = String(button?.dataset?.roteZoomNode || '').trim();
  if (!nodeId) return null;
  return model?.nodes?.find((node) => String(node?.id || '') === nodeId) || null;
}

function currentPlayerIdentity() {
  const snapshot = liveSnapshot();
  const body = snapshot?.body || {};
  return Object.freeze({
    playerId: String(body?.playerId || body?.player_id || body?.id || '').trim(),
    allyCode: String(snapshot?.allyCode || body?.allyCode || body?.ally_code || '').replace(/\D/g, '').slice(0, 9),
  });
}

export function hydrateSelectedMissionReadiness(root, model) {
  const inspector = root?.querySelector?.('.rote-zoom-inspector');
  if (!inspector) return Object.freeze({ hydrated: false, reason: 'missing-inspector', missionId: '' });

  const selectedNode = selectedTacticalNode(root, model);
  const existing = inspector.querySelector?.(':scope > [data-rote-tactical-readiness-host]') || null;
  if (!selectedNode || selectedNode.infrastructure || !selectedNode.missionId) {
    existing?.remove?.();
    return Object.freeze({ hydrated: false, reason: 'no-selected-mission', missionId: '' });
  }

  let host = existing;
  if (!host) {
    const ownerDocument = inspector.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!ownerDocument?.createElement) return Object.freeze({ hydrated: false, reason: 'missing-document', missionId: selectedNode.missionId });
    host = ownerDocument.createElement('div');
    host.dataset.roteTacticalReadinessHost = 'true';
    inspector.appendChild(host);
  }

  const attemptSnapshot = tbAttemptSnapshot();
  const observed = buildRoteObservedMissionResults({
    missionId: selectedNode.missionId,
    activeEventId: attemptSnapshot?.eventId || attemptSnapshot?.event?.id || '',
    attempts: Array.isArray(attemptSnapshot?.attempts) ? attemptSnapshot.attempts : null,
    player: currentPlayerIdentity(),
  });

  host.dataset.tacticalMissionId = String(selectedNode.missionId || '');
  host.dataset.tacticalVerdict = String(selectedNode?.readiness?.verdict || 'ROSTER NOT LOADED');
  host.dataset.tacticalObservedEvidence = String(observed?.evidenceLabel || 'ACTIVE EVENT EVIDENCE NOT LOADED');
  host.dataset.tacticalObservedRecorded = String(observed?.guild?.recorded ?? '');
  host.innerHTML = `${roteTacticalReadinessMarkup(selectedNode.readiness || null)}${roteObservedMissionResultsMarkup(observed)}`;

  return Object.freeze({
    hydrated: true,
    reason: selectedNode.readiness ? 'evaluated' : 'roster-not-loaded',
    missionId: String(selectedNode.missionId || ''),
    verdict: String(selectedNode?.readiness?.verdict || 'ROSTER NOT LOADED'),
    observedEvidence: observed?.evidenceLabel || 'ACTIVE EVENT EVIDENCE NOT LOADED',
    observedRecorded: Number(observed?.guild?.recorded || 0),
  });
}

export async function enhanceRoteTacticalOverlay(root) {
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

  const nodeResult = hydrateRoteTacticalNodeButtons(root, model, catalog);
  const readinessResult = hydrateSelectedMissionReadiness(root, model);
  root.dataset.roteTacticalSignature = signature;
  root.dataset.roteTacticalHydrated = String(nodeResult.hydrated || 0);
  root.dataset.roteTacticalMissing = nodeResult.missingButtons.join(',');
  root.dataset.roteTacticalReadinessMission = readinessResult.missionId || '';
  root.dataset.roteTacticalReadinessVerdict = readinessResult.verdict || '';
  root.dataset.roteTacticalObservedEvidence = readinessResult.observedEvidence || '';

  return Object.freeze({
    ...nodeResult,
    readiness: readinessResult,
  });
}

async function enhanceAll() {
  scheduled = false;
  const roots = [...document.querySelectorAll('.rote-planet-zoom[data-rote-zoom-planet]')];
  for (const root of roots) await enhanceRoteTacticalOverlay(root);
}

function scheduleEnhance() {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return;
  scheduled = true;
  requestAnimationFrame(() => {
    enhanceAll().catch(() => {});
  });
}

export function installRoteTacticalMapIntegration() {
  ensureStylesheets();
  scheduleEnhance();

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('swgoh:workspace-activated', scheduleEnhance);
  window.addEventListener('swgoh:tb-mission-attempts-updated', scheduleEnhance);
  document.getElementById('allyForm')?.addEventListener('submit', () => setTimeout(scheduleEnhance, 650));

  return Object.freeze({ observer, scheduleEnhance });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installRoteTacticalMapIntegration, { once: true });
  else installRoteTacticalMapIntegration();
}
