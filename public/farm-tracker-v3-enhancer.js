import { JOURNEY_PRESETS } from './farm-presets.js';
import { eventProgress, requirementProgress } from './journey-progress.js';
import { auditJourneyPresetsAgainstCatalog } from './journey-preset-canonicalizer.js';

const state = {
  catalog: [],
  catalogMap: new Map(),
  body: null,
  allyCode: '',
  loading: null,
  scheduled: false,
};

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;
const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 9);

function ensureStyles() {
  if (document.querySelector('link[data-farm-tracker-v3="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/farm-tracker-v3.css?v=20260820-farmv3a';
  link.dataset.farmTrackerV3 = 'true';
  document.head.appendChild(link);
}

async function loadCatalog() {
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    state.catalog = shared;
    state.catalogMap = new Map(shared.map((unit) => [String(unit?.baseId || unit?.id || '').toUpperCase(), unit]));
    return shared;
  }
  if (state.catalog.length) return state.catalog;
  const response = await fetch('/data/catalog.json?farm-v3=1', { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Game catalog returned HTTP ${response.status}`);
  state.catalog = array(body?.units);
  state.catalogMap = new Map(state.catalog.map((unit) => [String(unit?.baseId || unit?.id || '').toUpperCase(), unit]));
  return state.catalog;
}

async function loadLive() {
  const allyCode = digits(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (shared?.allyCode === allyCode && shared?.body) {
    state.body = shared.body;
    state.allyCode = allyCode;
    return shared.body;
  }
  if (state.body && state.allyCode === allyCode) return state.body;
  const response = await fetch(`/api/player/${allyCode}`, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.body = body;
  state.allyCode = allyCode;
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: Date.now() };
  return body;
}

function liveMap(body) {
  return new Map([...array(body?.units), ...array(body?.ships)].map((unit) => [String(unit?.baseId || '').toUpperCase(), unit]));
}

function unitName(baseId, rosterMap) {
  const id = String(baseId || '').toUpperCase();
  return rosterMap.get(id)?.name || state.catalogMap.get(id)?.name || id || 'Unknown unit';
}

function unitImage(baseId, rosterMap) {
  const id = String(baseId || '').toUpperCase();
  const unit = rosterMap.get(id) || state.catalogMap.get(id) || {};
  return text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
}

function requirementTarget(requirement = {}) {
  if (requirement.type === 'RELIC') return `R${Number(requirement.tier || 0)}`;
  if (requirement.type === 'GEAR') return `G${Number(requirement.tier || 0)}`;
  return `${Number(requirement.tier || 0)}★`;
}

export function farmTargetState(event, rosterMap) {
  const targetOwned = rosterMap.has(String(event?.targetBaseId || '').toUpperCase());
  const progress = eventProgress(array(event?.requirements), rosterMap);
  if (targetOwned) return Object.freeze({ key: 'completed', label: 'COMPLETED', progress, targetOwned });
  if (progress.complete) return Object.freeze({ key: 'ready', label: 'READY TO UNLOCK', progress, targetOwned });
  return Object.freeze({ key: 'active', label: 'ACTIVE FARM', progress, targetOwned });
}

function qualityMarkup(audit) {
  const requirementCount = JOURNEY_PRESETS.reduce((sum, event) => sum + array(event.requirements).length, 0);
  if (audit.valid) {
    return `<div class="farm-v3-quality"><span><strong>Journey data mapping verified</strong> · ${JOURNEY_PRESETS.length} targets · ${requirementCount} requirements resolved against the current catalog.</span></div>`;
  }
  const rows = audit.unresolved.map((row) => `<li><b>${escapeHtml(row.eventName || row.eventId)}</b> · ${escapeHtml(row.kind)} · <code>${escapeHtml(row.baseId)}</code>${row.sourceBaseId && row.sourceBaseId !== row.baseId ? ` · source ${escapeHtml(row.sourceBaseId)}` : ''}</li>`).join('');
  return `<div class="farm-v3-quality is-warning"><span><strong>${audit.unresolvedCount} Journey data mapping issue${audit.unresolvedCount === 1 ? '' : 's'}</strong> · unresolved requirements remain counted and are not silently removed.</span><details><summary>Show mappings</summary><ul>${rows}</ul></details></div>`;
}

function statusBoardMarkup(models) {
  const counts = { active: 0, ready: 0, completed: 0 };
  for (const model of models) counts[model.state.key] += 1;
  return `<div class="farm-v3-status-board" aria-label="Journey target status summary">
    <div class="farm-v3-status-box"><span>Farming / Needs Work</span><strong>${counts.active}</strong></div>
    <div class="farm-v3-status-box ready"><span>Ready to Unlock</span><strong>${counts.ready}</strong></div>
    <div class="farm-v3-status-box completed"><span>Completed</span><strong>${counts.completed}</strong></div>
  </div>`;
}

function completedUnitMarkup(requirement, rosterMap) {
  const name = unitName(requirement.baseId, rosterMap);
  const image = unitImage(requirement.baseId, rosterMap);
  return `<span class="farm-v3-completed-unit" title="${escapeAttr(name)} · ${escapeAttr(requirementTarget(requirement))}">
    ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="fallback">✓</span>'}
    <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(requirementTarget(requirement))} complete</small></span>
  </span>`;
}

function enhanceDetailedCard(card, event, rosterMap, unresolved) {
  const targetState = farmTargetState(event, rosterMap);
  card.dataset.farmV3State = targetState.key;
  let stateBadge = card.querySelector('.farm-v3-target-state');
  if (!stateBadge) {
    stateBadge = document.createElement('span');
    stateBadge.className = 'farm-v3-target-state';
    card.querySelector('.farm-overall-score')?.appendChild(stateBadge);
  }
  stateBadge.className = `farm-v3-target-state ${targetState.key}`;
  stateBadge.textContent = targetState.label;

  for (const requirementCard of card.querySelectorAll('.farm-requirement')) {
    const badge = requirementCard.querySelector('.farm-tone-badge.tone-ready');
    if (badge) badge.textContent = 'Complete';
  }
  const completedFilter = card.querySelector('[data-journey-filter="ready"]');
  if (completedFilter) {
    const count = completedFilter.querySelector('span')?.textContent || '';
    completedFilter.innerHTML = `Completed${count ? ` <span>${escapeHtml(count)}</span>` : ''}`;
  }
  for (const box of card.querySelectorAll('.farm-summary-box.tone-ready > span')) box.textContent = 'Complete';

  const completed = array(event.requirements).filter((requirement) => requirementProgress(rosterMap.get(String(requirement.baseId || '').toUpperCase()), requirement).complete);
  let lane = card.querySelector('.farm-v3-completed-lane');
  if (lane) lane.remove();
  if (completed.length) {
    lane = document.createElement('details');
    lane.className = 'farm-v3-completed-lane';
    lane.innerHTML = `<summary>Completed requirements · ${completed.length}/${event.requirements.length}</summary><div class="farm-v3-completed-grid">${completed.map((requirement) => completedUnitMarkup(requirement, rosterMap)).join('')}</div>`;
    card.querySelector('.farm-summary-strip')?.insertAdjacentElement('afterend', lane);
  }

  const existingIssue = card.querySelector('.farm-v3-unresolved-note');
  existingIssue?.remove();
  if (unresolved.length) {
    const note = document.createElement('div');
    note.className = 'farm-v3-unresolved-note';
    note.textContent = `DATA MAPPING REQUIRED · ${unresolved.map((row) => row.baseId).join(', ')}. These requirements remain part of the farm count.`;
    card.querySelector('.farm-summary-strip')?.insertAdjacentElement('afterend', note);
  }
}

function enhanceMapCard(card, event, rosterMap) {
  const targetState = farmTargetState(event, rosterMap);
  card.dataset.farmV3State = targetState.key;
  let badge = card.querySelector('.farm-v3-target-state');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'farm-v3-target-state';
    card.querySelector('.journey-map-title')?.appendChild(badge);
  }
  badge.className = `farm-v3-target-state ${targetState.key}`;
  badge.textContent = targetState.label;
}

async function enhanceNow() {
  ensureStyles();
  const farm = document.getElementById('workspace-farm');
  if (!farm || farm.hidden) return;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    const [catalog, body] = await Promise.all([loadCatalog(), loadLive()]);
    if (!body || !farm.isConnected || farm.hidden) return;
    const rosterMap = liveMap(body);
    const audit = auditJourneyPresetsAgainstCatalog(JOURNEY_PRESETS, catalog);
    const models = JOURNEY_PRESETS.map((event) => ({ event, state: farmTargetState(event, rosterMap) }));

    let quality = farm.querySelector('[data-farm-v3-quality]');
    if (!quality) {
      quality = document.createElement('section');
      quality.dataset.farmV3Quality = 'true';
      const intro = farm.querySelector('.farm-intro');
      (intro || farm.firstElementChild)?.insertAdjacentElement('afterend', quality);
    }
    quality.innerHTML = qualityMarkup(audit);

    let board = farm.querySelector('[data-farm-v3-status-board]');
    if (!board) {
      board = document.createElement('section');
      board.dataset.farmV3StatusBoard = 'true';
      quality.insertAdjacentElement('afterend', board);
    }
    board.innerHTML = statusBoardMarkup(models);

    const unresolvedByEvent = new Map();
    for (const row of audit.unresolved) {
      if (!unresolvedByEvent.has(row.eventId)) unresolvedByEvent.set(row.eventId, []);
      unresolvedByEvent.get(row.eventId).push(row);
    }

    for (const card of farm.querySelectorAll('[data-journey-card]')) {
      const event = JOURNEY_PRESETS.find((row) => row.id === card.dataset.journeyCard);
      if (event) enhanceDetailedCard(card, event, rosterMap, unresolvedByEvent.get(event.id) || []);
    }
    for (const card of farm.querySelectorAll('[data-map-event]')) {
      const event = JOURNEY_PRESETS.find((row) => row.id === card.dataset.mapEvent);
      if (event) enhanceMapCard(card, event, rosterMap);
    }
  })().catch((error) => {
    console.warn('Farm Tracker v3 enhancer unavailable:', error?.message || error);
  }).finally(() => {
    state.loading = null;
  });
  return state.loading;
}

function schedule() {
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(() => {
    state.scheduled = false;
    enhanceNow();
  }, 40);
}

const observer = new MutationObserver((mutations) => {
  const farm = document.getElementById('workspace-farm');
  if (!farm || farm.hidden) return;
  const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === 1 && (
    node.matches?.('[data-journey-card], [data-map-event], .farm-journey-card, .journey-map-card')
    || node.querySelector?.('[data-journey-card], [data-map-event]')
  )));
  if (relevant) schedule();
});

window.addEventListener('swgoh:farm-workspace-loaded', schedule);
window.addEventListener('swgoh:farm-view-changed', schedule);
window.addEventListener('swgoh:journey-map-rendered', schedule);
window.addEventListener('swgoh:workspace-activated', (event) => {
  if (event?.detail?.id === 'farm') schedule();
});
observer.observe(document.body, { childList: true, subtree: true });

schedule();
