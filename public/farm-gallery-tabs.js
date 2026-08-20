import { JOURNEY_PRESETS } from './farm-presets.js';
import { CURRENT_JOURNEY_GUIDES } from './journey-current-guide-data.js';
import { farmTargetModel } from './farm-tracker-v3-model.js';
import { buildMasterFarmPlan } from './farm-master-plan.js';

const state = {
  catalog: [],
  catalogMap: new Map(),
  catalogNameMap: new Map(),
  body: null,
  allyCode: '',
  tab: 'tracked',
  trackedFilter: 'all',
  galleryFilter: 'all',
  requirementFilter: 'needs',
  materialFilter: 'all',
  search: '',
  selectedEventId: '',
  scheduled: false,
  rendering: false,
};

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 9);
const baseId = (value) => text(value).toUpperCase();
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;
const NUMBER = new Intl.NumberFormat();

function indexCatalog(units) {
  state.catalog = array(units);
  state.catalogMap = new Map();
  state.catalogNameMap = new Map();
  for (const unit of state.catalog) {
    const id = baseId(unit?.baseId || unit?.id);
    if (id) state.catalogMap.set(id, unit);
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
  const response = await fetch('/data/catalog.json?farm-gallery=1', { cache: 'no-store' });
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
    return state.body;
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
    .filter(([id]) => id));
}

function trackedIds(panel) {
  return new Set([...panel.querySelectorAll('[data-journey-card]')]
    .map((node) => text(node.dataset.journeyCard))
    .filter(Boolean));
}

function unitRecord(id, playerMap) {
  const key = baseId(id);
  return playerMap.get(key) || state.catalogMap.get(key) || null;
}

function unitName(id, playerMap) {
  const key = baseId(id);
  return unitRecord(key, playerMap)?.name || key || 'Unknown unit';
}

function unitImage(id, playerMap) {
  const unit = unitRecord(id, playerMap) || {};
  return text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
}

function targetLabel(requirement = {}) {
  if (requirement.type === 'RELIC') return `R${Number(requirement.tier || 0)}`;
  if (requirement.type === 'GEAR') return `G${Number(requirement.tier || 0)}`;
  return `${Number(requirement.tier || 0)}★`;
}

function currentStats(row) {
  const progress = row?.delta?.progress || {};
  if (!row?.unit?.baseId) return { stars: '—', level: '—', gear: '—', relic: '—' };
  return {
    stars: `${Number(progress.stars || 0)}★`,
    level: Number(progress.level || 0) ? `L${Number(progress.level)}` : '—',
    gear: Number(progress.gear || 0) ? `G${Number(progress.gear)}` : '—',
    relic: Number(progress.relic || 0) ? `R${Number(progress.relic)}` : '—',
  };
}

function buildModels(panel, playerMap) {
  const tracked = trackedIds(panel);
  return JOURNEY_PRESETS.map((event) => farmTargetModel(event, playerMap, tracked.has(event.id)));
}

function statusClass(model) {
  return model.state.key === 'available' ? 'available' : model.state.key;
}

function filteredTracked(models) {
  const rows = models.filter((model) => model.tracked);
  if (state.trackedFilter === 'active') return rows.filter((model) => model.state.key === 'active');
  if (state.trackedFilter === 'ready') return rows.filter((model) => model.state.key === 'ready');
  if (state.trackedFilter === 'completed') return rows.filter((model) => model.state.key === 'completed');
  return rows;
}

function filteredGallery(models) {
  const query = state.search.toLowerCase();
  return models.filter((model) => {
    if (state.galleryFilter !== 'all' && model.state.key !== state.galleryFilter) return false;
    if (!query) return true;
    const haystack = [model.event?.name, model.event?.shortName, model.event?.category].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function targetCard(model, playerMap, mode = 'gallery') {
  const event = model.event;
  const image = unitImage(event.targetBaseId, playerMap);
  const tone = statusClass(model);
  const action = model.state.key === 'completed'
    ? '<span class="farm-gallery-owned">Owned</span>'
    : model.tracked
      ? `<button type="button" class="farm-gallery-track tracked" data-untrack-journey="${escapeAttr(event.id)}">✓ Tracked</button>`
      : `<button type="button" class="farm-gallery-track" data-track-journey="${escapeAttr(event.id)}">+ Track</button>`;
  return `<article class="farm-gallery-target state-${tone}" data-gallery-event="${escapeAttr(event.id)}">
    <button type="button" class="farm-gallery-target-select" data-gallery-requirements="${escapeAttr(event.id)}" aria-label="Open ${escapeAttr(event.name)} requirements">
      <div class="farm-gallery-target-art">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>★</span>'}</div>
      <div class="farm-gallery-target-info">
        <span class="farm-gallery-category">${escapeHtml(event.category)}</span>
        <strong>${escapeHtml(event.shortName || event.name)}</strong>
        <div class="farm-gallery-statline"><span>${model.completedCount}/${model.requirements.total} complete</span><span>${model.blockerCount} blockers</span></div>
        <div class="farm-gallery-progress"><i style="width:${model.state.progress.percent}%"></i></div>
        <div class="farm-gallery-card-footer"><b>${model.state.progress.percent}%</b><span class="farm-gallery-state state-${tone}">${escapeHtml(model.state.label)}</span></div>
      </div>
    </button>
    <div class="farm-gallery-card-actions">${action}<button type="button" data-gallery-requirements="${escapeAttr(event.id)}">Requirements</button></div>
  </article>`;
}

function tabButton(key, label, count = '') {
  return `<button type="button" class="${state.tab === key ? 'active' : ''}" data-farm-gallery-tab="${key}" role="tab" aria-selected="${state.tab === key ? 'true' : 'false'}"><span>${escapeHtml(label)}</span>${count !== '' ? `<b>${count}</b>` : ''}</button>`;
}

function shellNav(models, plan) {
  const tracked = models.filter((model) => model.tracked).length;
  return `<nav class="farm-gallery-tabs" role="tablist" aria-label="Farm Command sections">
    ${tabButton('tracked', 'Tracked', tracked)}
    ${tabButton('gallery', 'Journey Gallery', models.length)}
    ${tabButton('requirements', 'Requirements')}
    ${tabButton('shopping', 'Shopping List', plan?.materials?.length || 0)}
    ${tabButton('priority', 'Priority Queue', plan?.incompleteTargetCount || 0)}
    ${tabButton('era', 'Era Journeys', CURRENT_JOURNEY_GUIDES.length)}
  </nav>`;
}

function chip(key, label, current, attr) {
  return `<button type="button" class="${current === key ? 'active' : ''}" ${attr}="${key}">${escapeHtml(label)}</button>`;
}

function trackedTab(models, playerMap, plan) {
  const rows = filteredTracked(models);
  const counts = {
    all: models.filter((m) => m.tracked).length,
    active: models.filter((m) => m.tracked && m.state.key === 'active').length,
    ready: models.filter((m) => m.tracked && m.state.key === 'ready').length,
    completed: models.filter((m) => m.tracked && m.state.key === 'completed').length,
  };
  return `<section class="farm-gallery-panel" data-farm-gallery-panel="tracked">
    <header class="farm-gallery-panel-head"><div><span>YOUR ACTIVE PLAN</span><h3>Tracked Journeys</h3><p>Portrait-first farming view. Select any target to open its requirements without expanding the entire page.</p></div>${plan ? `<div class="farm-gallery-mini-summary"><b>${plan.incompleteTargetCount}</b><span>unique targets still need work</span></div>` : ''}</header>
    <div class="farm-gallery-subtabs">
      ${chip('all', `All Tracked · ${counts.all}`, state.trackedFilter, 'data-gallery-tracked-filter')}
      ${chip('active', `Active · ${counts.active}`, state.trackedFilter, 'data-gallery-tracked-filter')}
      ${chip('ready', `Ready · ${counts.ready}`, state.trackedFilter, 'data-gallery-tracked-filter')}
      ${chip('completed', `Completed · ${counts.completed}`, state.trackedFilter, 'data-gallery-tracked-filter')}
    </div>
    <div class="farm-gallery-target-grid">${rows.length ? rows.map((model) => targetCard(model, playerMap, 'tracked')).join('') : '<div class="farm-gallery-empty">No tracked Journeys match this view. Open Journey Gallery to add one.</div>'}</div>
    ${plan ? masterSummary(plan) : ''}
  </section>`;
}

function galleryTab(models, playerMap) {
  const rows = filteredGallery(models);
  return `<section class="farm-gallery-panel" data-farm-gallery-panel="gallery">
    <header class="farm-gallery-panel-head"><div><span>ALL SUPPORTED LEGACY JOURNEYS</span><h3>Journey Gallery</h3><p>Browse targets visually, track a farm, or jump straight into the requirement gallery.</p></div><label class="farm-gallery-search">Search<input type="search" value="${escapeAttr(state.search)}" placeholder="Journey or category…" data-gallery-search></label></header>
    <div class="farm-gallery-subtabs">
      ${chip('all', 'All', state.galleryFilter, 'data-gallery-filter')}
      ${chip('active', 'Active Farm', state.galleryFilter, 'data-gallery-filter')}
      ${chip('ready', 'Ready to Unlock', state.galleryFilter, 'data-gallery-filter')}
      ${chip('completed', 'Completed', state.galleryFilter, 'data-gallery-filter')}
      ${chip('available', 'Available to Track', state.galleryFilter, 'data-gallery-filter')}
    </div>
    <div class="farm-gallery-target-grid">${rows.length ? rows.map((model) => targetCard(model, playerMap)).join('') : '<div class="farm-gallery-empty">No Journey targets match this filter.</div>'}</div>
  </section>`;
}

function requirementTile(row, playerMap) {
  const image = unitImage(row.baseId, playerMap);
  const name = unitName(row.baseId, playerMap);
  const stats = currentStats(row);
  const status = row.complete ? 'COMPLETE' : row.missing ? 'MISSING' : 'NEEDS WORK';
  const tone = row.complete ? 'complete' : row.missing ? 'missing' : 'needs';
  return `<article class="farm-unit-tile state-${tone}" data-inspect-base-id="${escapeAttr(row.baseId)}" tabindex="0" role="button" aria-label="Inspect ${escapeAttr(name)}">
    <div class="farm-unit-portrait">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>?</span>'}<span class="farm-unit-status state-${tone}">${status}</span></div>
    <div class="farm-unit-copy"><strong>${escapeHtml(name)}</strong>
      <div class="farm-unit-stats"><span>${stats.stars}</span><span>${stats.level}</span><span>${stats.gear}</span><span>${stats.relic}</span></div>
      <div class="farm-unit-target"><span>Target</span><b>${escapeHtml(targetLabel(row.requirement))}</b></div>
      <div class="farm-unit-delta">${escapeHtml(row.complete ? 'Requirement complete' : row.delta.label)}</div>
    </div>
  </article>`;
}

function requirementsTab(models, playerMap) {
  if (!state.selectedEventId || !models.some((model) => model.event.id === state.selectedEventId)) {
    state.selectedEventId = models.find((model) => model.tracked)?.event.id || models[0]?.event.id || '';
  }
  const model = models.find((row) => row.event.id === state.selectedEventId);
  if (!model) return '<section class="farm-gallery-panel"><div class="farm-gallery-empty">No Journey requirement data is available.</div></section>';
  const allRows = [...model.requirements.blockers, ...model.requirements.complete];
  const rows = state.requirementFilter === 'complete'
    ? model.requirements.complete
    : state.requirementFilter === 'all'
      ? allRows
      : model.requirements.blockers;
  const image = unitImage(model.event.targetBaseId, playerMap);
  return `<section class="farm-gallery-panel" data-farm-gallery-panel="requirements">
    <header class="farm-gallery-requirement-head">
      <div class="farm-gallery-selected-target">${image ? `<img src="${escapeAttr(image)}" alt="">` : '<span>★</span>'}<div><span>${escapeHtml(model.event.category)}</span><h3>${escapeHtml(model.event.name)}</h3><p>${model.completedCount}/${model.requirements.total} complete · ${model.blockerCount} blockers · ${model.state.progress.percent}%</p></div></div>
      <label>Selected Journey<select data-gallery-selected-event>${models.map((row) => `<option value="${escapeAttr(row.event.id)}" ${row.event.id === model.event.id ? 'selected' : ''}>${escapeHtml(row.event.name)}</option>`).join('')}</select></label>
    </header>
    <div class="farm-gallery-subtabs">
      ${chip('needs', `Needs Work · ${model.requirements.blockers.length}`, state.requirementFilter, 'data-gallery-requirement-filter')}
      ${chip('complete', `Completed · ${model.requirements.complete.length}`, state.requirementFilter, 'data-gallery-requirement-filter')}
      ${chip('all', `All · ${model.requirements.total}`, state.requirementFilter, 'data-gallery-requirement-filter')}
    </div>
    <div class="farm-unit-grid">${rows.length ? rows.map((row) => requirementTile(row, playerMap)).join('') : '<div class="farm-gallery-empty">No units match this requirement filter.</div>'}</div>
  </section>`;
}

function masterSummary(plan) {
  return `<details class="farm-gallery-master-summary"><summary>Master Plan Summary</summary><div class="farm-gallery-summary-grid">
    <div><span>Tracked Farms</span><b>${plan.farmCount}</b></div>
    <div><span>Unique Targets</span><b>${plan.uniqueTargetCount}</b></div>
    <div><span>Still Needed</span><b>${plan.incompleteTargetCount}</b></div>
    <div><span>Shared Targets</span><b>${plan.sharedTargetCount}</b></div>
    <div><span>Relic Levels Left</span><b>${plan.totalRelicLevelsRemaining}</b></div>
    <div><span>Gear Tiers Left</span><b>${plan.totalGearTiersRemaining}</b></div>
  </div><div class="farm-gallery-farm-progress">${array(plan.farmSummaries).map((farm) => `<div><span>${escapeHtml(farm.name)}</span><b>${farm.percent}%</b><i><em style="width:${farm.percent}%"></em></i><small>${farm.completeCount}/${farm.total} ready</small></div>`).join('')}</div></details>`;
}

function materialCard(material) {
  return `<article class="farm-material-tile category-${escapeAttr(material.category || 'other')}"><div><span>${escapeHtml(material.category || 'material')}</span><b>${NUMBER.format(Number(material.quantity || 0))}</b></div><strong>${escapeHtml(material.name)}</strong><p>${escapeHtml(material.route || 'Game source')}</p><small>${escapeHtml(material.source || 'Source not mapped')}</small></article>`;
}

function shoppingTab(plan) {
  if (!plan) return '<section class="farm-gallery-panel"><div class="farm-gallery-empty">Track at least one Journey to build the combined shopping list.</div></section>';
  const categories = [...new Set(array(plan.materials).map((material) => text(material.category || 'other')))];
  const rows = state.materialFilter === 'all' ? array(plan.materials) : array(plan.materials).filter((material) => material.category === state.materialFilter);
  return `<section class="farm-gallery-panel" data-farm-gallery-panel="shopping">
    <header class="farm-gallery-panel-head"><div><span>ALL TRACKED FARMS · DEDUPED</span><h3>Master Shopping List</h3><p>Gross requirements from each unique character's current progression to the highest target required by any tracked farm. Public roster data does not expose inventory balances.</p></div><button type="button" class="farm-gallery-copy" data-gallery-copy-plan>Copy Master Plan</button></header>
    <div class="farm-gallery-summary-grid compact"><div><span>Material Types</span><b>${plan.materials.length}</b></div><div><span>Relic Levels Left</span><b>${plan.totalRelicLevelsRemaining}</b></div><div><span>Gear Tiers Left</span><b>${plan.totalGearTiersRemaining}</b></div><div><span>Unique Targets</span><b>${plan.uniqueTargetCount}</b></div></div>
    <div class="farm-gallery-subtabs">${chip('all', 'All Materials', state.materialFilter, 'data-gallery-material-filter')}${categories.map((category) => chip(category, category, state.materialFilter, 'data-gallery-material-filter')).join('')}</div>
    <div class="farm-material-grid">${rows.length ? rows.map(materialCard).join('') : '<div class="farm-gallery-empty">No materials in this category.</div>'}</div>
  </section>`;
}

function targetGapText(target) {
  const gaps = [];
  if (!target.owned) gaps.push('Acquire unit');
  if (target.starsRemaining > 0) gaps.push(`${target.starsRemaining}★`);
  if (target.gearPlan?.tiersRemaining > 0) gaps.push(`${target.gearPlan.tiersRemaining} gear`);
  if (target.relicPlan?.levelsRemaining > 0) gaps.push(`${target.relicPlan.levelsRemaining} relic`);
  return gaps.join(' · ') || 'Requirement ready';
}

function priorityCard(target, index) {
  const staticUnit = state.catalogMap.get(baseId(target.baseId)) || {};
  const name = target.unit?.name || staticUnit.name || target.baseId;
  const image = target.unit?.image || staticUnit.image || staticUnit.imageUrl || '';
  const plannerAllowed = target.owned && target.requirement?.type !== 'STAR';
  return `<article class="farm-priority-tile ${index === 0 ? 'top' : ''}">
    <div class="farm-priority-rank">${index === 0 ? 'NEXT' : `#${index + 1}`}</div>
    <div class="farm-priority-unit">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>?</span>'}<div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(targetGapText(target))}</small></div></div>
    <div class="farm-priority-current"><span>${escapeHtml(target.currentLabel)}</span><b>→ ${escapeHtml(target.targetLabel)}</b></div>
    <div class="farm-priority-progress"><i style="width:${target.progress.percent}%"></i></div>
    <div class="farm-priority-meta"><span>${target.progress.percent}% ready</span><span>Advances ${target.impactCount} farm${target.impactCount === 1 ? '' : 's'}</span></div>
    <div class="farm-priority-tags">${array(target.farmNames).map((farm) => `<span>${escapeHtml(farm)}</span>`).join('')}</div>
    <div class="farm-priority-actions"><button type="button" data-inspect-base-id="${escapeAttr(target.baseId)}">Inspect</button>${plannerAllowed ? `<button type="button" class="primary" data-gallery-plan-upgrade data-base-id="${escapeAttr(target.baseId)}" data-target-gear="${target.requirement.type === 'RELIC' ? 13 : target.requirement.tier}" data-target-relic="${target.requirement.type === 'RELIC' ? target.requirement.tier : 0}">Plan Upgrade</button>` : ''}</div>
  </article>`;
}

function priorityTab(plan) {
  if (!plan) return '<section class="farm-gallery-panel"><div class="farm-gallery-empty">Track at least one Journey to build the combined priority queue.</div></section>';
  return `<section class="farm-gallery-panel" data-farm-gallery-panel="priority">
    <header class="farm-gallery-panel-head"><div><span>WHAT TO UPGRADE NEXT</span><h3>Combined Priority Queue</h3><p>Deduped unique targets across all tracked Journeys. Shared units show how many farms they advance.</p></div><div class="farm-gallery-mini-summary"><b>${plan.incompleteTargetCount}</b><span>unfinished unique targets</span></div></header>
    <div class="farm-priority-grid">${plan.queue.length ? plan.queue.map(priorityCard).join('') : '<div class="farm-gallery-empty">All unique requirements across tracked farms are complete.</div>'}</div>
  </section>`;
}

function eraCard(guide) {
  const unit = state.catalogNameMap.get(text(guide.targetName || guide.name).toLowerCase()) || {};
  const image = text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
  return `<article class="farm-era-tile"><div class="farm-era-art">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span>ERA</span>'}</div><div class="farm-era-copy"><span>${escapeHtml(guide.category)}</span><strong>${escapeHtml(guide.name)}</strong><b>${escapeHtml(guide.availabilityLabel)}</b><p>${escapeHtml(guide.statusNote)}</p>${guide.requirementsKnown ? `<div class="farm-era-tier-grid">${array(guide.tiers).map((tier) => `<div><b>T${tier.tier}</b><span>${tier.stars}★ · EL ${tier.eraLevel}</span><small>${escapeHtml(array(tier.requiredNames).join(' · '))}</small></div>`).join('')}</div>` : '<div class="farm-era-unknown">Requirements not normalized · readiness withheld</div>'}<div class="farm-era-sources">${array(guide.sources).map((source) => `<span>${escapeHtml(source.name)}${source.published ? ` · ${escapeHtml(source.published)}` : ''}</span>`).join('')}</div></div></article>`;
}

function eraTab() {
  return `<section class="farm-gallery-panel" data-farm-gallery-panel="era"><header class="farm-gallery-panel-head"><div><span>SEPARATE PROGRESSION CONTRACT</span><h3>Era Journeys</h3><p>Era-Level requirements remain separate from legacy Star/Gear/Relic readiness. No fabricated readiness percentage is shown.</p></div></header><div class="farm-era-grid">${CURRENT_JOURNEY_GUIDES.map(eraCard).join('')}</div></section>`;
}

function planForTracked(panel, body) {
  const ids = trackedIds(panel);
  const events = JOURNEY_PRESETS.filter((event) => ids.has(event.id));
  if (!events.length || !body) return null;
  return buildMasterFarmPlan(events, [...array(body.units), ...array(body.ships)]);
}

function copyPlanText(plan) {
  return [
    'MASTER FARM PLAN',
    `Tracked farms\t${array(plan.farmSummaries).map((farm) => farm.name).join(', ')}`,
    `Unique targets\t${plan.uniqueTargetCount}`,
    `Still needed\t${plan.incompleteTargetCount}`,
    '',
    'EXACT RELIC SHOPPING LIST',
    'Material\tQuantity\tRoute',
    ...array(plan.materials).map((material) => `${material.name}\t${material.quantity}\t${material.route || ''}`),
    '',
    'UPGRADE PRIORITY',
    'Rank\tUnit\tCurrent\tTarget\tReadiness\tFarms advanced\tTracked farms',
    ...array(plan.queue).map((target, index) => {
      const staticUnit = state.catalogMap.get(baseId(target.baseId)) || {};
      const name = target.unit?.name || staticUnit.name || target.baseId;
      return `${index + 1}\t${name}\t${target.currentLabel}\t${target.targetLabel}\t${target.progress.percent}%\t${target.impactCount}\t${array(target.farmNames).join(', ')}`;
    }),
  ].join('\n');
}

function openGearPlanner(button) {
  const id = button.dataset.baseId || '';
  const targetGear = Number(button.dataset.targetGear || 13);
  const targetRelic = Number(button.dataset.targetRelic || 0);
  if (location.hash !== '#gear') location.hash = 'gear';
  let attempts = 0;
  const selectWhenReady = () => {
    attempts += 1;
    const select = document.getElementById('gearPlannerUnit');
    const form = document.getElementById('gearPlannerForm');
    const hasOption = select && [...select.options].some((option) => option.value === id);
    if (hasOption && form) {
      select.value = id;
      if (document.getElementById('gearTargetTier')) document.getElementById('gearTargetTier').value = String(Math.max(1, targetGear));
      if (document.getElementById('gearTargetRelic')) document.getElementById('gearTargetRelic').value = String(Math.max(0, targetRelic));
      form.requestSubmit();
      document.getElementById('gearPlannerOutput')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (attempts < 25) setTimeout(selectWhenReady, 120);
  };
  setTimeout(selectWhenReady, 80);
}

function panelMarkup(models, playerMap, plan) {
  if (state.tab === 'gallery') return galleryTab(models, playerMap);
  if (state.tab === 'requirements') return requirementsTab(models, playerMap);
  if (state.tab === 'shopping') return shoppingTab(plan);
  if (state.tab === 'priority') return priorityTab(plan);
  if (state.tab === 'era') return eraTab();
  return trackedTab(models, playerMap, plan);
}

async function render() {
  if (state.rendering) return;
  const panel = document.getElementById('workspace-farm');
  if (!panel || panel.hidden) return;
  state.rendering = true;
  try {
    const [, body] = await Promise.all([loadCatalog(), loadLive()]);
    if (!body || !panel.isConnected || panel.hidden) return;
    const playerMap = rosterMap(body);
    const models = buildModels(panel, playerMap);
    const plan = planForTracked(panel, body);
    let shell = document.getElementById('farmGalleryTabs');
    if (!shell) {
      shell = document.createElement('section');
      shell.id = 'farmGalleryTabs';
      shell.className = 'farm-gallery-shell';
      const status = document.getElementById('journeyLiveStatus');
      (status || panel.querySelector('[data-farm-v3-quality]') || panel.querySelector('.farm-intro'))?.insertAdjacentElement('afterend', shell);
    }
    shell.innerHTML = `${shellNav(models, plan)}<div class="farm-gallery-content">${panelMarkup(models, playerMap, plan)}</div>`;
    panel.classList.add('farm-gallery-tabs-active');
  } finally {
    state.rendering = false;
  }
}

function schedule() {
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(() => {
    state.scheduled = false;
    render().catch((error) => console.warn('Farm Gallery tabs unavailable:', error?.message || error));
  }, 70);
}

document.addEventListener('click', async (event) => {
  const panel = event.target.closest?.('#workspace-farm');
  if (!panel) return;
  const tab = event.target.closest('[data-farm-gallery-tab]');
  if (tab) {
    state.tab = tab.dataset.farmGalleryTab;
    schedule();
    return;
  }
  const trackedFilter = event.target.closest('[data-gallery-tracked-filter]');
  if (trackedFilter) { state.trackedFilter = trackedFilter.dataset.galleryTrackedFilter; schedule(); return; }
  const galleryFilter = event.target.closest('[data-gallery-filter]');
  if (galleryFilter) { state.galleryFilter = galleryFilter.dataset.galleryFilter; schedule(); return; }
  const requirementFilter = event.target.closest('[data-gallery-requirement-filter]');
  if (requirementFilter) { state.requirementFilter = requirementFilter.dataset.galleryRequirementFilter; schedule(); return; }
  const materialFilter = event.target.closest('[data-gallery-material-filter]');
  if (materialFilter) { state.materialFilter = materialFilter.dataset.galleryMaterialFilter; schedule(); return; }
  const requirements = event.target.closest('[data-gallery-requirements]');
  if (requirements) {
    state.selectedEventId = requirements.dataset.galleryRequirements;
    state.requirementFilter = 'needs';
    state.tab = 'requirements';
    schedule();
    return;
  }
  const planUpgrade = event.target.closest('[data-gallery-plan-upgrade]');
  if (planUpgrade) { openGearPlanner(planUpgrade); return; }
  const copy = event.target.closest('[data-gallery-copy-plan]');
  if (copy) {
    const body = state.body;
    const plan = planForTracked(panel, body);
    if (!plan) return;
    await navigator.clipboard.writeText(copyPlanText(plan));
    const previous = copy.textContent;
    copy.textContent = 'Copied ✓';
    setTimeout(() => { copy.textContent = previous; }, 1400);
    return;
  }
  if (event.target.closest('[data-track-journey], [data-untrack-journey]')) setTimeout(schedule, 180);
});

document.addEventListener('input', (event) => {
  if (!event.target.matches?.('[data-gallery-search]')) return;
  state.search = event.target.value;
  schedule();
});

document.addEventListener('change', (event) => {
  if (!event.target.matches?.('[data-gallery-selected-event]')) return;
  state.selectedEventId = event.target.value;
  state.requirementFilter = 'needs';
  schedule();
});

document.addEventListener('keydown', (event) => {
  const tile = event.target.closest?.('.farm-unit-tile[data-inspect-base-id]');
  if (tile && (event.key === 'Enter' || event.key === ' ')) tile.click();
});

const observer = new MutationObserver((mutations) => {
  const farm = document.getElementById('workspace-farm');
  if (!farm || farm.hidden) return;
  const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === 1 && (
    node.id === 'journeyTrackedList'
    || node.id === 'farmMasterPlan'
    || node.matches?.('[data-journey-card]')
    || node.querySelector?.('[data-journey-card]')
  )));
  if (relevant) schedule();
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('swgoh:farm-workspace-loaded', schedule);
window.addEventListener('swgoh:farm-view-changed', schedule);
window.addEventListener('swgoh:workspace-activated', (event) => { if (event.detail?.id === 'farm') schedule(); });
window.addEventListener('hashchange', () => { if (location.hash.toLowerCase() === '#farm') schedule(); });

document.getElementById('allyForm')?.addEventListener('submit', () => {
  state.body = null;
  state.allyCode = '';
  setTimeout(schedule, 550);
});

schedule();
