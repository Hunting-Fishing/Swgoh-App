import { JOURNEY_PRESETS } from './farm-presets.js';
import { CURRENT_JOURNEY_GUIDES } from './journey-current-guide-data.js';
import { auditJourneyPresetsAgainstCatalog } from './journey-preset-canonicalizer.js';
import {
  farmTargetModel,
  farmViewCounts,
  filterFarmTargets,
} from './farm-tracker-v3-model.js';

const state = {
  catalog: [],
  catalogMap: new Map(),
  catalogNameMap: new Map(),
  body: null,
  allyCode: '',
  view: 'active',
  search: '',
  expanded: new Set(),
  loading: null,
  scheduled: false,
  renderCount: 0,
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
const baseId = (value) => String(value || '').trim().toUpperCase();

function ensureStyles() {
  if (document.querySelector('link[data-farm-tracker-v3="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/farm-tracker-v3.css?v=20260820-farmv3b';
  link.dataset.farmTrackerV3 = 'true';
  document.head.appendChild(link);
}

function indexCatalog(units) {
  state.catalog = array(units);
  state.catalogMap = new Map();
  state.catalogNameMap = new Map();
  for (const unit of state.catalog) {
    const key = baseId(unit?.baseId || unit?.id);
    if (key) state.catalogMap.set(key, unit);
    const name = text(unit?.name).toLowerCase();
    if (name && !state.catalogNameMap.has(name)) state.catalogNameMap.set(name, unit);
  }
}

async function loadCatalog() {
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    indexCatalog(shared);
    return state.catalog;
  }
  if (state.catalog.length) return state.catalog;
  const response = await fetch('/data/catalog.json?farm-v3=2', { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Game catalog returned HTTP ${response.status}`);
  indexCatalog(body?.units);
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

function rosterMap(body) {
  return new Map([...array(body?.units), ...array(body?.ships)]
    .map((unit) => [baseId(unit?.baseId), unit])
    .filter(([key]) => key));
}

function trackedIdsFromLegacy(panel) {
  return new Set([...panel.querySelectorAll('[data-journey-card]')]
    .map((node) => text(node.dataset.journeyCard))
    .filter(Boolean));
}

function unitName(id, playerMap) {
  const key = baseId(id);
  return playerMap.get(key)?.name || state.catalogMap.get(key)?.name || key || 'Unknown unit';
}

function unitImage(id, playerMap) {
  const key = baseId(id);
  const unit = playerMap.get(key) || state.catalogMap.get(key) || {};
  return text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
}

function targetImage(event, playerMap) {
  return unitImage(event?.targetBaseId, playerMap);
}

function currentProgress(row) {
  const progress = row?.delta?.progress || {};
  if (!row?.unit?.baseId) return 'Not owned';
  if (Number(progress.relic || 0) > 0) return `${progress.stars}★ · L${progress.level} · G${progress.gear} · R${progress.relic}`;
  if (Number(progress.gear || 0) > 0) return `${progress.stars}★ · L${progress.level || '—'} · G${progress.gear}`;
  return `${progress.stars || 0}★${progress.level ? ` · L${progress.level}` : ''}`;
}

function targetLabel(requirement = {}) {
  if (requirement.type === 'RELIC') return `R${Number(requirement.tier || 0)}`;
  if (requirement.type === 'GEAR') return `G${Number(requirement.tier || 0)}`;
  return `${Number(requirement.tier || 0)}★`;
}

function qualityMarkup(audit) {
  const requirementCount = JOURNEY_PRESETS.reduce((sum, event) => sum + array(event.requirements).length, 0);
  if (audit.valid) {
    return `<div class="farm-v3-quality"><span><strong>Journey mapping verified</strong> · ${JOURNEY_PRESETS.length} legacy targets · ${requirementCount} requirements resolved against the current catalog.</span></div>`;
  }
  const rows = audit.unresolved.map((row) => `<li><b>${escapeHtml(row.eventName || row.eventId)}</b> · ${escapeHtml(row.kind)} · <code>${escapeHtml(row.baseId)}</code>${row.sourceBaseId && row.sourceBaseId !== row.baseId ? ` · source ${escapeHtml(row.sourceBaseId)}` : ''}</li>`).join('');
  return `<div class="farm-v3-quality is-warning"><span><strong>${audit.unresolvedCount} DATA MAPPING REQUIRED</strong> · unresolved requirements remain counted and are never silently removed.</span><details><summary>Show mappings</summary><ul>${rows}</ul></details></div>`;
}

function commandTabs(counts) {
  const tabs = [
    ['active', 'Active Farms', counts.active],
    ['ready', 'Ready to Unlock', counts.ready],
    ['completed', 'Completed', counts.completed],
    ['all', 'All Journeys', counts.all],
    ['era', 'Era Journeys', CURRENT_JOURNEY_GUIDES.length],
  ];
  return `<div class="farm-v3-command-tabs" role="tablist" aria-label="Farm Tracker views">
    ${tabs.map(([key, label, count]) => `<button type="button" class="${state.view === key ? 'active' : ''}" data-farm-v3-view="${key}" role="tab" aria-selected="${state.view === key ? 'true' : 'false'}"><span>${escapeHtml(label)}</span><b>${count}</b></button>`).join('')}
  </div>`;
}

function stateTone(model) {
  return model.state.key === 'available' ? 'available' : model.state.key;
}

function targetCard(model, playerMap, unresolved = []) {
  const { event } = model;
  const image = targetImage(event, playerMap);
  const expanded = state.expanded.has(event.id);
  const stateKey = stateTone(model);
  const status = model.state.label;
  const progress = model.state.progress;
  const issue = unresolved.length ? `<span class="farm-v3-data-issue">DATA MAPPING REQUIRED</span>` : '';
  const track = model.state.key === 'completed'
    ? '<span class="farm-v3-owned-chip">Owned</span>'
    : model.tracked
      ? `<button type="button" class="farm-v3-track tracked" data-untrack-journey="${escapeAttr(event.id)}">✓ Tracked</button>`
      : `<button type="button" class="farm-v3-track" data-track-journey="${escapeAttr(event.id)}">+ Track Farm</button>`;

  return `<article class="farm-v3-target-card state-${stateKey} ${expanded ? 'is-expanded' : ''}" data-farm-v3-target="${escapeAttr(event.id)}">
    <div class="farm-v3-target-main">
      <button type="button" class="farm-v3-target-portrait" data-inspect-base-id="${escapeAttr(event.targetBaseId)}" title="Inspect ${escapeAttr(event.name)}">
        ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>★</span>'}
      </button>
      <div class="farm-v3-target-copy">
        <span class="farm-v3-category">${escapeHtml(event.category)}</span>
        <h3>${escapeHtml(event.shortName || event.name)}</h3>
        <div class="farm-v3-target-meta"><span>${model.completedCount}/${model.requirements.total} complete</span><span>${model.blockerCount} blocker${model.blockerCount === 1 ? '' : 's'}</span></div>
      </div>
      <div class="farm-v3-target-status">
        <span class="farm-v3-state state-${stateKey}">${escapeHtml(status)}</span>
        <strong>${progress.percent}%</strong>
      </div>
    </div>
    <div class="farm-v3-progress state-${stateKey}" aria-label="${progress.percent}% requirement completion"><span style="width:${progress.percent}%"></span></div>
    ${issue}
    <div class="farm-v3-target-actions">
      ${track}
      <button type="button" class="farm-v3-expand" data-farm-v3-expand="${escapeAttr(event.id)}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Hide requirements' : 'Requirements'}</button>
    </div>
    ${expanded ? matrixMarkup(model, playerMap, unresolved) : ''}
  </article>`;
}

function matrixRow(row, playerMap, unresolvedIds) {
  const name = unitName(row.baseId, playerMap);
  const image = unitImage(row.baseId, playerMap);
  const unresolved = unresolvedIds.has(row.baseId);
  const status = unresolved ? 'DATA MAPPING REQUIRED' : row.complete ? 'COMPLETE' : row.missing ? 'MISSING' : 'NEEDS WORK';
  return `<div class="farm-v3-matrix-row ${row.complete ? 'is-complete' : ''} ${row.missing ? 'is-missing' : ''} ${unresolved ? 'is-unresolved' : ''}" data-inspect-base-id="${escapeAttr(row.baseId)}" tabindex="0" role="button" aria-label="Inspect ${escapeAttr(name)}">
    <div class="farm-v3-matrix-unit">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="fallback">?</span>'}<strong>${escapeHtml(name)}</strong></div>
    <span>${escapeHtml(currentProgress(row))}</span>
    <b>${escapeHtml(targetLabel(row.requirement))}</b>
    <span class="farm-v3-delta">${escapeHtml(unresolved ? 'Resolve canonical unit ID' : row.delta.label)}</span>
    <span class="farm-v3-row-status">${escapeHtml(status)}</span>
  </div>`;
}

function completedPortrait(row, playerMap) {
  const name = unitName(row.baseId, playerMap);
  const image = unitImage(row.baseId, playerMap);
  return `<button type="button" class="farm-v3-complete-portrait" data-inspect-base-id="${escapeAttr(row.baseId)}" title="${escapeAttr(name)} · ${escapeAttr(targetLabel(row.requirement))} complete">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>✓</span>'}<small>${escapeHtml(targetLabel(row.requirement))}</small></button>`;
}

function matrixMarkup(model, playerMap, unresolved = []) {
  const unresolvedIds = new Set(unresolved.filter((row) => row.kind === 'requirement').map((row) => baseId(row.baseId)));
  const blockers = model.requirements.blockers;
  const complete = model.requirements.complete;
  return `<section class="farm-v3-matrix" aria-label="${escapeAttr(model.event.name)} requirement matrix">
    <header class="farm-v3-matrix-head"><span>Unit</span><span>Current</span><span>Target</span><span>Delta / blocker</span><span>Status</span></header>
    <div class="farm-v3-matrix-body">
      ${blockers.length ? blockers.map((row) => matrixRow(row, playerMap, unresolvedIds)).join('') : '<div class="farm-v3-no-blockers">All normalized entry requirements are complete.</div>'}
    </div>
    <details class="farm-v3-completed-lane" ${blockers.length ? '' : 'open'}>
      <summary>Completed requirements · ${complete.length}/${model.requirements.total}</summary>
      <div class="farm-v3-complete-strip">${complete.map((row) => completedPortrait(row, playerMap)).join('')}</div>
    </details>
  </section>`;
}

function eraPortrait(guide) {
  const unit = state.catalogNameMap.get(text(guide.targetName || guide.name).toLowerCase()) || {};
  return text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
}

function eraCard(guide) {
  const expanded = state.expanded.has(guide.id);
  const image = eraPortrait(guide);
  const tierText = guide.requirementsKnown ? `${array(guide.tiers).length} published tiers` : 'requirements not normalized';
  const tiers = guide.requirementsKnown
    ? `<div class="farm-v3-era-tiers">${array(guide.tiers).map((tier) => `<div><b>Tier ${tier.tier}</b><span>${tier.stars}★ · EL ${tier.eraLevel}</span><small>${escapeHtml(array(tier.requiredNames).join(' · '))}</small></div>`).join('')}</div>`
    : '';
  return `<article class="farm-v3-target-card state-era ${expanded ? 'is-expanded' : ''}" data-farm-v3-era="${escapeAttr(guide.id)}">
    <div class="farm-v3-target-main">
      <div class="farm-v3-target-portrait">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>ERA</span>'}</div>
      <div class="farm-v3-target-copy"><span class="farm-v3-category">${escapeHtml(guide.category)}</span><h3>${escapeHtml(guide.name)}</h3><div class="farm-v3-target-meta"><span>${escapeHtml(guide.availabilityLabel)}</span><span>${escapeHtml(tierText)}</span></div></div>
      <div class="farm-v3-target-status"><span class="farm-v3-state state-era">ERA DATA</span><strong>—</strong></div>
    </div>
    <div class="farm-v3-era-note">Era readiness is withheld until Era Level is authoritative roster evidence.</div>
    <div class="farm-v3-target-actions"><button type="button" class="farm-v3-expand" data-farm-v3-expand="${escapeAttr(guide.id)}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Hide evidence' : 'Evidence'}</button></div>
    ${expanded ? `<div class="farm-v3-era-evidence"><p>${escapeHtml(guide.statusNote)}</p>${tiers}<div class="farm-v3-era-sources">${array(guide.sources).map((source) => `<span>${escapeHtml(source.name)}${source.published ? ` · ${escapeHtml(source.published)}` : ''}</span>`).join('')}</div></div>` : ''}
  </article>`;
}

function visibleLegacyModels(models) {
  return filterFarmTargets(models, state.view, state.search);
}

function renderSurface(panel, playerMap, audit) {
  const trackedIds = trackedIdsFromLegacy(panel);
  const models = JOURNEY_PRESETS.map((event) => farmTargetModel(event, playerMap, trackedIds.has(event.id)));
  const counts = farmViewCounts(models);
  const unresolvedByEvent = new Map();
  for (const row of audit.unresolved) {
    if (!unresolvedByEvent.has(row.eventId)) unresolvedByEvent.set(row.eventId, []);
    unresolvedByEvent.get(row.eventId).push(row);
  }

  const search = state.search.toLowerCase();
  const visible = state.view === 'era'
    ? CURRENT_JOURNEY_GUIDES.filter((guide) => !search || [guide.name, guide.category, guide.availabilityLabel].join(' ').toLowerCase().includes(search))
    : visibleLegacyModels(models);

  let surface = panel.querySelector('[data-farm-v3-command]');
  if (!surface) {
    surface = document.createElement('section');
    surface.dataset.farmV3Command = 'true';
    surface.className = 'farm-v3-command';
    const intro = panel.querySelector('.farm-intro');
    (intro || panel.firstElementChild)?.insertAdjacentElement('afterend', surface);
  }

  surface.innerHTML = `
    ${qualityMarkup(audit)}
    <section class="farm-v3-toolbar">
      <div><div class="kicker">FARM TRACKER V3</div><h2>Journey Farm Command</h2><p>Compact roster-backed farming. Blockers stay visible; completed requirements move out of the way.</p></div>
      <label class="farm-v3-search"><span>Search</span><input value="${escapeAttr(state.search)}" data-farm-v3-search placeholder="Journey or unit…"></label>
    </section>
    ${commandTabs(counts)}
    <div class="farm-v3-view-note">${state.view === 'active' ? 'Tracked farms that still need work.' : state.view === 'ready' ? 'Entry requirements complete; target not yet owned.' : state.view === 'completed' ? 'Journey targets already unlocked on this roster.' : state.view === 'era' ? 'Current Era/2026 Journey evidence kept separate from legacy Relic math.' : 'All supported legacy Journey targets.'}</div>
    <div class="farm-v3-target-grid">
      ${visible.length ? (state.view === 'era'
        ? visible.map(eraCard).join('')
        : visible.map((model) => targetCard(model, playerMap, unresolvedByEvent.get(model.event.id) || [])).join(''))
        : `<div class="farm-v3-empty">${state.search ? 'No Journey targets match this search.' : state.view === 'active' ? 'No tracked farms currently need work. Use All Journeys to add a target.' : 'No targets in this state.'}</div>`}
    </div>`;

  panel.classList.add('farm-v3-active');
  state.renderCount += 1;
  window.__swgohFarmV3Health = () => ({
    view: state.view,
    search: state.search,
    tracked: trackedIds.size,
    active: counts.active,
    ready: counts.ready,
    completed: counts.completed,
    all: counts.all,
    era: CURRENT_JOURNEY_GUIDES.length,
    unresolved: audit.unresolvedCount,
    renderCount: state.renderCount,
  });
}

async function enhanceNow() {
  ensureStyles();
  const panel = document.getElementById('workspace-farm');
  if (!panel || panel.hidden) return;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    const [catalog, body] = await Promise.all([loadCatalog(), loadLive()]);
    if (!body || !panel.isConnected || panel.hidden) return;
    const playerMap = rosterMap(body);
    const audit = auditJourneyPresetsAgainstCatalog(JOURNEY_PRESETS, catalog);
    renderSurface(panel, playerMap, audit);
  })().catch((error) => {
    console.warn('Farm Tracker v3 unavailable:', error?.message || error);
    const panel = document.getElementById('workspace-farm');
    let surface = panel?.querySelector('[data-farm-v3-command]');
    if (!surface && panel) {
      surface = document.createElement('section');
      surface.dataset.farmV3Command = 'true';
      surface.className = 'farm-v3-command';
      panel.prepend(surface);
    }
    if (surface) surface.innerHTML = `<div class="farm-v3-empty is-error">${escapeHtml(error?.message || 'Farm Tracker v3 is unavailable.')} <button type="button" data-farm-v3-retry>Retry</button></div>`;
  }).finally(() => {
    state.loading = null;
  });
  return state.loading;
}

function schedule(delay = 45) {
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(() => {
    state.scheduled = false;
    enhanceNow();
  }, delay);
}

document.addEventListener('click', (event) => {
  const panel = event.target.closest?.('#workspace-farm');
  if (!panel) return;

  const view = event.target.closest?.('[data-farm-v3-view]');
  if (view) {
    state.view = text(view.dataset.farmV3View) || 'active';
    state.expanded.clear();
    schedule(0);
    return;
  }

  const expand = event.target.closest?.('[data-farm-v3-expand]');
  if (expand) {
    const key = text(expand.dataset.farmV3Expand);
    if (state.expanded.has(key)) state.expanded.delete(key);
    else state.expanded.add(key);
    schedule(0);
    return;
  }

  if (event.target.closest?.('[data-farm-v3-retry]')) {
    state.body = null;
    state.catalog = [];
    schedule(0);
  }
}, true);

document.addEventListener('input', (event) => {
  if (!event.target.matches?.('[data-farm-v3-search]')) return;
  state.search = event.target.value || '';
  schedule(90);
}, true);

const observer = new MutationObserver((mutations) => {
  const panel = document.getElementById('workspace-farm');
  if (!panel || panel.hidden) return;
  const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === 1 && (
    node.matches?.('[data-journey-card]')
    || node.querySelector?.('[data-journey-card]')
  )));
  if (relevant) schedule(70);
});

window.addEventListener('swgoh:farm-workspace-loaded', schedule);
window.addEventListener('swgoh:workspace-activated', (event) => {
  if (event?.detail?.id === 'farm') schedule();
});
window.addEventListener('swgoh:active-ally-code-changed', () => {
  state.body = null;
  state.expanded.clear();
  schedule();
});
observer.observe(document.body, { childList: true, subtree: true });

schedule();
