import { JOURNEY_PRESETS } from './farm-presets.js';
import { farmTargetModel } from './farm-tracker-v3-model.js';
import { SOLO_JOURNEY_TIERS, GUILD_JOURNEY_GROUPS, JOURNEY_TIER_LAYOUT_SOURCE } from './journey-tier-layout-data.js';

const state = {
  mode: sessionStorage.getItem('swgoh:farm:journey-view') === 'tiers' ? 'tiers' : 'grid',
  section: sessionStorage.getItem('swgoh:farm:journey-tier-section') || 'solo',
  catalog: [],
  catalogById: new Map(),
  catalogByName: new Map(),
  body: null,
  allyCode: '',
  scheduled: false,
  rendering: false,
};

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const key = (value) => text(value).toUpperCase();
const lower = (value) => text(value).toLowerCase();
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const escapeAttr = escapeHtml;

function ensureStyles() {
  if (document.querySelector('link[data-journey-tier-view="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/journey-tier-view.css?v=20260821-tier1';
  link.dataset.journeyTierView = 'true';
  document.head.appendChild(link);
}

function indexCatalog(units) {
  state.catalog = array(units);
  state.catalogById = new Map();
  state.catalogByName = new Map();
  for (const unit of state.catalog) {
    const id = key(unit?.baseId || unit?.id);
    if (id) state.catalogById.set(id, unit);
    const name = lower(unit?.name);
    if (name && !state.catalogByName.has(name)) state.catalogByName.set(name, unit);
  }
}

async function loadCatalog() {
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    indexCatalog(shared);
    return;
  }
  if (state.catalog.length) return;
  const response = await fetch('/data/catalog.json?journey-tier-view=1', { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Game catalog returned HTTP ${response.status}`);
  indexCatalog(body?.units);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 9);
}

async function loadPlayer() {
  const allyCode = digits(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode);
  if (allyCode.length !== 9) return;
  const shared = window.__swgohLiveSnapshot;
  if (shared?.allyCode === allyCode && shared?.body) {
    state.body = shared.body;
    state.allyCode = allyCode;
    return;
  }
  if (state.body && state.allyCode === allyCode) return;
  const response = await fetch(`/api/player/${allyCode}`, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) return;
  state.body = body;
  state.allyCode = allyCode;
}

function rosterMap() {
  return new Map([...array(state.body?.units), ...array(state.body?.ships)]
    .map((unit) => [key(unit?.baseId), unit])
    .filter(([id]) => id));
}

function trackedIds() {
  const panel = document.getElementById('workspace-farm');
  return new Set(Array.from(panel?.querySelectorAll?.('[data-journey-card]') || [])
    .map((node) => text(node.dataset.journeyCard))
    .filter(Boolean));
}

function presetMap() {
  return new Map(JOURNEY_PRESETS.map((preset) => [preset.id, preset]));
}

function resolveCatalogUnit(journey = {}) {
  const names = [journey.name, ...array(journey.aliases)].map(lower).filter(Boolean);
  for (const name of names) {
    const unit = state.catalogByName.get(name);
    if (unit) return unit;
  }
  return null;
}

function imageFor(unit = {}) {
  return text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
}

function supportedJourneyState(journey, playerMap, presets, tracked) {
  if (!journey.presetId) return null;
  const preset = presets.get(journey.presetId);
  if (!preset) return null;
  return farmTargetModel(preset, playerMap, tracked.has(preset.id));
}

function portraitCard(journey, playerMap, presets, tracked, mode = 'solo') {
  const model = supportedJourneyState(journey, playerMap, presets, tracked);
  const unit = model
    ? playerMap.get(key(model.event.targetBaseId)) || state.catalogById.get(key(model.event.targetBaseId)) || resolveCatalogUnit(journey)
    : resolveCatalogUnit(journey);
  const image = imageFor(unit || {});
  const owned = Boolean(unit?.baseId && playerMap.has(key(unit.baseId)));
  const tone = model?.state?.key || (owned ? 'owned' : 'unknown');
  const status = model?.state?.label || (mode === 'guild' ? (owned ? 'OWNED' : 'NOT OWNED') : 'NOT NORMALIZED');
  const percent = model ? `${model.state.progress.percent}%` : '';
  const inspectId = key(unit?.baseId);
  const requirements = model
    ? `<button type="button" class="journey-tier-action" data-gallery-requirements="${escapeAttr(model.event.id)}">Requirements</button>`
    : `<span class="journey-tier-normalization">${mode === 'guild' ? 'Guild acquisition' : 'Requirements not normalized'}</span>`;

  return `<article class="journey-tier-card state-${escapeAttr(tone)}">
    <button type="button" class="journey-tier-portrait" ${inspectId ? `data-inspect-base-id="${escapeAttr(inspectId)}"` : 'disabled'} title="${escapeAttr(journey.name)}">
      ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="journey-tier-hologram">?</span>'}
    </button>
    <strong>${escapeHtml(journey.name)}</strong>
    <div class="journey-tier-card-state"><span>${escapeHtml(status)}</span>${percent ? `<b>${escapeHtml(percent)}</b>` : ''}</div>
    ${requirements}
  </article>`;
}

function tierHeader(tier) {
  return `<header class="journey-tier-header"><span></span><div><h4>${escapeHtml(tier.label)}</h4><p>${escapeHtml(tier.recommendation)}</p></div><span></span></header>`;
}

function soloView(playerMap, presets, tracked) {
  return `<div class="journey-tier-scroll">${SOLO_JOURNEY_TIERS.map((tier) => `
    <section class="journey-tier-band" data-tier="${tier.tier}">
      ${tierHeader(tier)}
      <div class="journey-tier-card-grid">${tier.journeys.map((journey) => portraitCard(journey, playerMap, presets, tracked)).join('')}</div>
    </section>`).join('')}</div>`;
}

function guildView(playerMap, presets, tracked) {
  return `<div class="journey-tier-scroll">${GUILD_JOURNEY_GROUPS.map((group) => `
    <section class="journey-tier-band guild-band">
      <header class="journey-tier-header"><span></span><div><h4>${escapeHtml(group.label)}</h4><p>Guild reward journeys · ownership shown from your current roster</p></div><span></span></header>
      <div class="journey-tier-card-grid guild-grid">${group.journeys.map((journey) => portraitCard(journey, playerMap, presets, tracked, 'guild')).join('')}</div>
    </section>`).join('')}</div>`;
}

function glView(playerMap, presets, tracked) {
  const rows = JOURNEY_PRESETS.filter((preset) => preset.category === 'Galactic Legends').map((preset) => ({
    name: preset.name,
    presetId: preset.id,
  }));
  return `<div class="journey-tier-scroll"><section class="journey-tier-band gl-band">
    <header class="journey-tier-header"><span></span><div><h4>Galactic Legends</h4><p>Your supported Galactic Legend journeys in one visual command view</p></div><span></span></header>
    <div class="journey-tier-card-grid gl-grid">${rows.map((journey) => portraitCard(journey, playerMap, presets, tracked)).join('')}</div>
  </section></div>`;
}

function categoryNav() {
  const tabs = [
    ['solo', 'Solo Journeys'],
    ['guild', 'Guild Journeys'],
    ['gl', 'Galactic Legends'],
  ];
  return `<nav class="journey-tier-category-nav" aria-label="Journey Guide categories">${tabs.map(([id, label]) => `<button type="button" class="${state.section === id ? 'active' : ''}" data-journey-tier-section="${id}">${escapeHtml(label)}</button>`).join('')}</nav>`;
}

function modeToggle() {
  return `<div class="journey-view-mode" role="group" aria-label="Journey Gallery view mode">
    <span>View</span>
    <button type="button" class="${state.mode === 'grid' ? 'active' : ''}" data-journey-view-mode="grid">▦ Grid View</button>
    <button type="button" class="${state.mode === 'tiers' ? 'active' : ''}" data-journey-view-mode="tiers">◇ SWGOH Tier View</button>
  </div>`;
}

async function render() {
  if (state.rendering) return;
  const panel = document.querySelector('#workspace-farm [data-farm-gallery-panel="gallery"]');
  if (!panel) return;
  state.rendering = true;
  observer?.disconnect();
  try {
    ensureStyles();
    await Promise.all([loadCatalog(), loadPlayer()]);
    let toggle = panel.querySelector('[data-journey-tier-toggle-host]');
    if (!toggle) {
      toggle = document.createElement('div');
      toggle.dataset.journeyTierToggleHost = 'true';
      panel.querySelector('.farm-gallery-panel-head')?.insertAdjacentElement('afterend', toggle);
    }
    toggle.innerHTML = modeToggle();
    panel.classList.toggle('journey-tier-mode', state.mode === 'tiers');

    let root = panel.querySelector('[data-journey-tier-root]');
    if (!root) {
      root = document.createElement('section');
      root.dataset.journeyTierRoot = 'true';
      root.className = 'journey-tier-root';
      panel.appendChild(root);
    }

    if (state.mode !== 'tiers') {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }

    root.hidden = false;
    const playerMap = rosterMap();
    const presets = presetMap();
    const tracked = trackedIds();
    const content = state.section === 'guild'
      ? guildView(playerMap, presets, tracked)
      : state.section === 'gl'
        ? glView(playerMap, presets, tracked)
        : soloView(playerMap, presets, tracked);
    root.innerHTML = `<div class="journey-tier-shell">
      ${categoryNav()}
      <div class="journey-tier-content">${content}<footer class="journey-tier-source">Tier placement: ${escapeHtml(JOURNEY_TIER_LAYOUT_SOURCE.label)} · ${escapeHtml(JOURNEY_TIER_LAYOUT_SOURCE.source)}</footer></div>
    </div>`;
  } finally {
    state.rendering = false;
    observe();
  }
}

function schedule(delay = 20) {
  if (state.scheduled) return;
  state.scheduled = true;
  setTimeout(() => {
    state.scheduled = false;
    render().catch((error) => console.warn('Journey Tier View unavailable:', error?.message || error));
  }, delay);
}

let observer = null;
function observe() {
  if (!observer) {
    observer = new MutationObserver(() => schedule(40));
  }
  const farm = document.getElementById('workspace-farm');
  if (farm) observer.observe(farm, { childList: true, subtree: true });
}

document.addEventListener('click', (event) => {
  const mode = event.target.closest?.('[data-journey-view-mode]');
  if (mode) {
    state.mode = mode.dataset.journeyViewMode === 'tiers' ? 'tiers' : 'grid';
    sessionStorage.setItem('swgoh:farm:journey-view', state.mode);
    schedule(0);
    return;
  }
  const section = event.target.closest?.('[data-journey-tier-section]');
  if (section) {
    state.section = ['solo', 'guild', 'gl'].includes(section.dataset.journeyTierSection) ? section.dataset.journeyTierSection : 'solo';
    sessionStorage.setItem('swgoh:farm:journey-tier-section', state.section);
    schedule(0);
    return;
  }
  if (event.target.closest?.('[data-track-journey], [data-untrack-journey]')) schedule(180);
});

window.addEventListener('swgoh:farm-workspace-loaded', () => schedule(0));
window.addEventListener('swgoh:workspace-activated', (event) => {
  if (event.detail?.id === 'farm') schedule(0);
});

observe();
schedule(0);
