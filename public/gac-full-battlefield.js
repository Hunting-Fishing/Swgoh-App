const OWN_TERRITORIES = Object.freeze([
  Object.freeze({ zone: 'BACK-TOP', area: 'own-back-top', label: 'Rear Top', title: 'Fleet Territory', kind: 'fleet' }),
  Object.freeze({ zone: 'FRONT-TOP', area: 'own-front-top', label: 'Front Top', title: 'Squad Territory', kind: 'squad' }),
  Object.freeze({ zone: 'BACK-BOTTOM', area: 'own-back-bottom', label: 'Rear Bottom', title: 'Squad Territory', kind: 'squad' }),
  Object.freeze({ zone: 'FRONT-BOTTOM', area: 'own-front-bottom', label: 'Front Bottom', title: 'Squad Territory', kind: 'squad' }),
]);

let scheduled = false;
let readyDispatched = false;

function clean(value) { return String(value ?? '').trim(); }

function ownTerritoryNode(entry) {
  const section = document.createElement('section');
  section.className = `gac-full-own-territory is-${entry.zone.toLowerCase()}`;
  section.dataset.gacFullOwnZone = entry.zone;
  section.style.gridArea = entry.area;
  section.innerHTML = `
    <header>
      <div><span>${entry.label}</span><strong>${entry.title}</strong><small>YOUR SIDE · ${entry.kind === 'fleet' ? 'FLEET' : 'SQUAD'} TERRITORY</small></div>
      <b>OWN</b>
    </header>
    <button type="button" class="gac-full-own-focus" data-gac-full-own-focus="${entry.zone}">
      <span class="gac-full-own-orbit"><b>◆</b></span>
      <strong>YOUR DEFENSE</strong>
      <small>Open defense roster</small>
    </button>`;
  return section;
}

function ensureSideLabel(map, side) {
  let node = map.querySelector(`:scope > [data-gac-full-side-label="${side}"]`);
  if (node) return node;
  node = document.createElement('div');
  node.className = `gac-full-side-label is-${side}`;
  node.dataset.gacFullSideLabel = side;
  node.innerHTML = side === 'own'
    ? '<span>YOUR BATTLEFIELD</span><strong>2 FRONT · 2 REAR</strong>'
    : '<span>OPPONENT BATTLEFIELD</span><strong>2 FRONT · 2 REAR</strong>';
  map.prepend(node);
  return node;
}

function ensureCenterLine(map) {
  let node = map.querySelector(':scope > [data-gac-full-center-line]');
  if (node) return node;
  node = document.createElement('div');
  node.className = 'gac-full-center-line';
  node.dataset.gacFullCenterLine = 'true';
  node.innerHTML = '<span>FRONT LINE</span>';
  map.appendChild(node);
  return node;
}

function markOpponentZones(map) {
  const mapping = [
    ['.gac-manual-map-zone.is-front-top', 'enemy-front-top'],
    ['.gac-manual-map-zone.is-back-top', 'enemy-back-top'],
    ['.gac-manual-map-zone.is-front-bottom', 'enemy-front-bottom'],
    ['.gac-manual-map-zone.is-back-bottom', 'enemy-back-bottom'],
  ];
  for (const [selector, area] of mapping) {
    const zone = map.querySelector(selector);
    if (!zone) continue;
    if (!zone.classList.contains('gac-full-enemy-territory')) zone.classList.add('gac-full-enemy-territory');
    if (zone.style.gridArea !== area) zone.style.gridArea = area;
    if (zone.dataset.gacBattlefieldSide !== 'opponent') zone.dataset.gacBattlefieldSide = 'opponent';
  }
}

function ensureOwnZones(map) {
  const existing = new Map(
    [...map.querySelectorAll(':scope > [data-gac-full-own-zone]')]
      .map((node) => [clean(node.dataset.gacFullOwnZone).toUpperCase(), node])
  );
  for (const entry of OWN_TERRITORIES) {
    if (existing.has(entry.zone)) continue;
    map.appendChild(ownTerritoryNode(entry));
  }
}

function reservedUnitCount() {
  const value = Number(document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense .gac-manual-count b')?.textContent);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function updateOwnSummary(map) {
  const label = map.querySelector(':scope > [data-gac-full-side-label="own"] strong');
  if (!label) return false;
  const count = reservedUnitCount();
  const next = count ? `2 FRONT · 2 REAR · ${count} DEFENSE UNITS MARKED` : '2 FRONT · 2 REAR';
  if (label.textContent === next) return false;
  label.textContent = next;
  return true;
}

function enhanceBattlefield() {
  const map = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-gac-map.gac-league-board-active');
  if (!map) return false;

  if (!map.classList.contains('gac-full-battlefield')) map.classList.add('gac-full-battlefield');
  if (map.dataset.gacTerritoryLocations !== '8') map.dataset.gacTerritoryLocations = '8';
  ensureSideLabel(map, 'own');
  ensureSideLabel(map, 'opponent');
  ensureCenterLine(map);
  ensureOwnZones(map);
  markOpponentZones(map);
  updateOwnSummary(map);

  const boardHeader = map.closest('.gac-manual-enemy-board')?.querySelector(':scope > header small');
  if (boardHeader && boardHeader.dataset.gacFullMapCopy !== 'true') {
    boardHeader.textContent = 'Full GAC battlefield: four territories on your side and four on the opponent side. Opponent defense circles remain the editable manual board.';
    boardHeader.dataset.gacFullMapCopy = 'true';
  }

  if (map.dataset.gacFullBattlefieldReady !== 'true') {
    map.dataset.gacFullBattlefieldReady = 'true';
    if (!readyDispatched) {
      readyDispatched = true;
      window.dispatchEvent(new CustomEvent('swgoh:gac-battlefield-ready'));
    }
  }
  return true;
}

function focusOwnDefense() {
  const section = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense');
  if (!section) return;
  const collapse = section.querySelector('[data-gac-ux-collapse-defense]');
  if (section.classList.contains('gac-ux-collapsed') && collapse) collapse.click();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section.classList.add('gac-full-own-pulse');
  window.setTimeout(() => section.classList.remove('gac-full-own-pulse'), 1200);
}

function bind() {
  if (window.__gacFullBattlefieldBound) return;
  window.__gacFullBattlefieldBound = true;
  document.addEventListener('click', (event) => {
    const own = event.target.closest?.('[data-gac-full-own-focus]');
    if (!own) return;
    event.preventDefault();
    focusOwnDefense();
  }, true);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceBattlefield();
  });
}

function injectStyle() {
  if (document.querySelector('link[data-gac-full-battlefield-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-full-battlefield.css?v=20260822-eightmap2';
  link.dataset.gacFullBattlefieldStyle = 'true';
  document.head.appendChild(link);
}

if (typeof window !== 'undefined') {
  injectStyle();
  bind();
  document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  window.addEventListener('hashchange', scheduleEnhance);
  window.addEventListener('swgoh:workspace-activated', scheduleEnhance);
  new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes?.length || record.removedNodes?.length)) return;
    scheduleEnhance();
  }).observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhance();
}

export { OWN_TERRITORIES, enhanceBattlefield };