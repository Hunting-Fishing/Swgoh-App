const ownState = {
  selected: null,
  selectedBaseIds: new Set(),
  leaderBaseId: '',
  scheduled: false,
  syncingReservation: false,
  reservedDrawerOpen: false,
  contextKey: '',
};

const ZONES = Object.freeze([
  Object.freeze({ zone: 'BACK-TOP', kind: 'fleet', opponentSelector: '.gac-manual-map-zone.is-back-top', short: 'RT' }),
  Object.freeze({ zone: 'FRONT-TOP', kind: 'squad', opponentSelector: '.gac-manual-map-zone.is-front-top', short: 'FT' }),
  Object.freeze({ zone: 'BACK-BOTTOM', kind: 'squad', opponentSelector: '.gac-manual-map-zone.is-back-bottom', short: 'RB' }),
  Object.freeze({ zone: 'FRONT-BOTTOM', kind: 'squad', opponentSelector: '.gac-manual-map-zone.is-front-bottom', short: 'FB' }),
]);

const clean = (value) => String(value ?? '').trim();
const digits = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const safeText = (value) => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeAttr = (value) => safeText(value).replace(/"/g, '&quot;');

function currentFormat() {
  return clean(document.querySelector('[data-gac-manual-format]')?.value).toLowerCase() === '3v3' ? '3v3' : '5v5';
}
function squadSize() { return currentFormat() === '3v3' ? 3 : 5; }
function ownerCode() {
  return digits(
    document.getElementById('allyCode')?.value ||
    window.__swgohAccountAllyCode ||
    window.__swgohPlayerRosterSnapshot?.allyCode ||
    window.__swgohLiveSnapshot?.allyCode
  ) || 'anonymous';
}
function opponentCode() { return digits(document.querySelector('[data-gac-manual-opponent]')?.value) || 'manual'; }
function storageKey() { return `swgoh:gac-own-defenses:v1:${ownerCode()}:${opponentCode()}:${currentFormat()}`; }
function managedReservationKey() { return `${storageKey()}:managed-reservations`; }

function normalizeAssignment(value = {}) {
  const zone = clean(value.zone).toUpperCase();
  const slot = Math.max(0, Number.isInteger(Number(value.slot)) ? Number(value.slot) : 0);
  const kind = zone === 'BACK-TOP' ? 'fleet' : 'squad';
  const members = [...new Set((Array.isArray(value.members) ? value.members : []).map(normalizeId).filter(Boolean))]
    .slice(0, kind === 'fleet' ? 8 : squadSize());
  const leader = normalizeId(value.leaderBaseId || members[0]);
  return { zone, slot, kind, members, leaderBaseId: members.includes(leader) ? leader : (members[0] || '') };
}

function readAssignments() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || '[]');
    return (Array.isArray(raw) ? raw : []).map(normalizeAssignment).filter((row) => ZONES.some((entry) => entry.zone === row.zone));
  } catch {
    return [];
  }
}

function writeAssignments(rows) {
  const normalized = rows.map(normalizeAssignment);
  localStorage.setItem(storageKey(), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('swgoh:gac-own-defense-updated', { detail: { assignments: normalized } }));
}

function readManagedReservations() {
  try {
    const raw = JSON.parse(localStorage.getItem(managedReservationKey()) || '[]');
    return new Set((Array.isArray(raw) ? raw : []).map(normalizeId).filter(Boolean));
  } catch {
    return new Set();
  }
}
function writeManagedReservations(ids) {
  localStorage.setItem(managedReservationKey(), JSON.stringify([...ids].map(normalizeId).filter(Boolean)));
}

function reservedIds() {
  return [...document.querySelectorAll('[data-gac-manual-counter-planner] .gac-manual-reserved [data-gac-manual-own-toggle]')]
    .map((button) => normalizeId(button.dataset.gacManualOwnToggle))
    .filter(Boolean);
}
function reservedSet() { return new Set(reservedIds()); }

function rosterButtons() {
  return [...document.querySelectorAll('[data-gac-manual-counter-planner] .gac-manual-roster-grid [data-gac-manual-own-toggle]')];
}
function rosterButton(id) {
  const normalized = normalizeId(id);
  return rosterButtons().find((button) => normalizeId(button.dataset.gacManualOwnToggle) === normalized) || null;
}

function unitMeta(id) {
  const normalized = normalizeId(id);
  const button = rosterButton(normalized) || [...document.querySelectorAll('[data-gac-manual-counter-planner] [data-gac-manual-own-toggle]')]
    .find((node) => normalizeId(node.dataset.gacManualOwnToggle) === normalized);
  const portrait = button?.querySelector('.gac-manual-unit');
  const image = clean(portrait?.querySelector('img')?.getAttribute('src'));
  const name = clean(button?.querySelector(':scope > span > strong')?.textContent || portrait?.querySelector('small')?.textContent || portrait?.querySelector('img')?.alt || normalized);
  return { id: normalized, name: name || normalized, image: /swgoh\.gg\/static\/img\//i.test(image) ? '' : image };
}

function knownUnitKind(id) {
  const normalized = normalizeId(id);
  const snapshots = [
    window.__swgohPlayerRosterSnapshot?.body,
    window.__swgohCanonicalPlayerSnapshot?.body,
    window.__swgohLiveSnapshot?.body,
  ].filter(Boolean);
  for (const body of snapshots) {
    const ships = Array.isArray(body?.ships) ? body.ships : [];
    if (ships.some((unit) => normalizeId(unit?.baseId) === normalized)) return 'fleet';
    const units = Array.isArray(body?.units) ? body.units : [];
    const match = units.find((unit) => normalizeId(unit?.baseId) === normalized);
    if (match) return clean(match?.unitType).toLowerCase() === 'ship' ? 'fleet' : 'squad';
  }
  return '';
}

function zoneCapacity(map, zone) {
  const config = ZONES.find((entry) => entry.zone === zone);
  const enemy = config ? map.querySelector(config.opponentSelector) : null;
  if (!enemy) return 0;
  const placements = enemy.querySelectorAll('.gac-league-placement');
  if (placements.length) return placements.length;
  return enemy.querySelectorAll('[data-gac-league-slot-add]').length;
}

function assignmentKey(row) { return `${row.zone}:${row.slot}`; }
function assignmentAt(rows, zone, slot) {
  return rows.find((row) => row.zone === zone && Number(row.slot) === Number(slot)) || null;
}
function assignedUnitMap(rows = readAssignments()) {
  const map = new Map();
  for (const row of rows) for (const id of row.members) map.set(normalizeId(id), row);
  return map;
}
function assignmentLabel(row) {
  const config = ZONES.find((entry) => entry.zone === row?.zone);
  return row ? `${config?.short || row.zone} ${Number(row.slot) + 1}` : '';
}

function isComplete(row) {
  if (!row) return false;
  if (row.kind === 'fleet') return row.members.length >= 4 && row.members.length <= 8 && row.members.includes(row.leaderBaseId);
  return row.members.length === squadSize() && row.members.includes(row.leaderBaseId);
}

function portraitMarkup(meta, cls = '') {
  const image = meta.image
    ? `<img src="${safeAttr(meta.image)}" alt="${safeAttr(meta.name)}" loading="lazy">`
    : `<b>${safeText(meta.name.slice(0, 2).toUpperCase())}</b>`;
  return `<span class="gac-own-defense-portrait ${cls}" title="${safeAttr(meta.name)}">${image}</span>`;
}

function ownSlotMarkup(row, zone, slot, kind) {
  const selected = ownState.selected?.zone === zone && Number(ownState.selected?.slot) === slot;
  if (!row) {
    return `<button type="button" class="gac-own-defense-slot is-empty ${selected ? 'is-selected' : ''}" data-gac-own-defense-slot data-zone="${zone}" data-slot="${slot}" data-kind="${kind}">
      <span class="gac-own-defense-empty-orbit">+</span><strong>${kind === 'fleet' ? 'FLEET' : 'SQUAD'} ${slot + 1}</strong><small>${selected ? 'BUILDING' : 'SELECT SLOT'}</small>
    </button>`;
  }
  const leader = unitMeta(row.leaderBaseId || row.members[0]);
  const others = row.members.filter((id) => id !== row.leaderBaseId).map(unitMeta);
  return `<button type="button" class="gac-own-defense-slot is-filled ${selected ? 'is-selected' : ''} ${isComplete(row) ? '' : 'is-incomplete'}" data-gac-own-defense-slot data-zone="${zone}" data-slot="${slot}" data-kind="${kind}">
    <span class="gac-own-defense-formation">${portraitMarkup(leader, 'is-leader')}<span class="gac-own-defense-pips">${others.map((meta) => portraitMarkup(meta)).join('')}</span></span>
    <strong>${safeText(leader.name)}</strong><small>${assignmentLabel(row)}</small>
  </button>`;
}

function renderOwnTerritories(map) {
  const rows = readAssignments();
  for (const config of ZONES) {
    const section = map.querySelector(`[data-gac-full-own-zone="${config.zone}"]`);
    if (!section) continue;
    const capacity = zoneCapacity(map, config.zone);
    const filled = rows.filter((row) => row.zone === config.zone && row.slot < capacity && isComplete(row)).length;
    const badge = section.querySelector(':scope > header > b');
    const badgeText = `${filled}/${capacity}`;
    if (badge && badge.textContent !== badgeText) badge.textContent = badgeText;
    let host = section.querySelector(':scope > [data-gac-own-defense-slots]');
    if (!host) {
      section.querySelector(':scope > .gac-full-own-focus')?.remove();
      host = document.createElement('div');
      host.className = 'gac-own-defense-slots';
      host.dataset.gacOwnDefenseSlots = config.zone;
      section.appendChild(host);
    }
    const signature = JSON.stringify({
      zone: config.zone,
      capacity,
      selected: ownState.selected?.zone === config.zone ? ownState.selected.slot : null,
      rows: rows.filter((row) => row.zone === config.zone && row.slot < capacity),
    });
    if (host.dataset.gacOwnDefenseSignature === signature) continue;
    host.dataset.gacOwnDefenseSignature = signature;
    host.innerHTML = Array.from({ length: capacity }, (_, slot) => ownSlotMarkup(assignmentAt(rows, config.zone, slot), config.zone, slot, config.kind)).join('');
  }
}

function ensureContext() {
  const key = storageKey();
  if (ownState.contextKey === key) return;
  ownState.contextKey = key;
  ownState.selected = null;
  ownState.selectedBaseIds = new Set();
  ownState.leaderBaseId = '';
}

function builderLimit() { return ownState.selected?.kind === 'fleet' ? 8 : squadSize(); }
function builderMinimum() { return ownState.selected?.kind === 'fleet' ? 4 : squadSize(); }
function selectedIds() { return [...ownState.selectedBaseIds]; }
function builderComplete() {
  const ids = selectedIds();
  return Boolean(ownState.selected) && ids.length >= builderMinimum() && ids.length <= builderLimit() && ids.includes(ownState.leaderBaseId) && (ownState.selected.kind === 'fleet' || ids.length === squadSize());
}

function selectSlot(zone, slot, kind) {
  ensureContext();
  ownState.selected = { zone: clean(zone).toUpperCase(), slot: Number(slot), kind: clean(kind) === 'fleet' ? 'fleet' : 'squad' };
  const current = assignmentAt(readAssignments(), ownState.selected.zone, ownState.selected.slot);
  ownState.selectedBaseIds = new Set(current?.members || []);
  ownState.leaderBaseId = current?.leaderBaseId || current?.members?.[0] || '';
  schedule();
  window.setTimeout(() => document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function toggleBuilderUnit(idInput) {
  if (!ownState.selected) return false;
  const id = normalizeId(idInput);
  if (!id) return false;
  const rows = readAssignments();
  const assigned = assignedUnitMap(rows).get(id);
  if (assigned && assignmentKey(assigned) !== `${ownState.selected.zone}:${ownState.selected.slot}`) return false;
  const kind = knownUnitKind(id);
  if (kind && kind !== ownState.selected.kind) return false;

  if (ownState.selectedBaseIds.has(id)) {
    ownState.selectedBaseIds.delete(id);
    if (ownState.leaderBaseId === id) ownState.leaderBaseId = selectedIds()[0] || '';
  } else {
    if (ownState.selectedBaseIds.size >= builderLimit()) return false;
    ownState.selectedBaseIds.add(id);
    if (!ownState.leaderBaseId) ownState.leaderBaseId = id;
  }
  schedule();
  return true;
}

function reservationButton(id) {
  const normalized = normalizeId(id);
  return [...document.querySelectorAll('[data-gac-manual-counter-planner] [data-gac-manual-own-toggle]')]
    .find((button) => normalizeId(button.dataset.gacManualOwnToggle) === normalized) || null;
}

function syncReservation(id, shouldReserve) {
  const normalized = normalizeId(id);
  const currentlyReserved = reservedSet().has(normalized);
  if (currentlyReserved === shouldReserve) return false;
  const button = reservationButton(normalized);
  if (!button) return false;
  ownState.syncingReservation = true;
  try { button.click(); } finally { ownState.syncingReservation = false; }
  return true;
}

function releaseManagedReservations(ids, nextRows) {
  const managed = readManagedReservations();
  const stillAssigned = new Set(nextRows.flatMap((row) => row.members).map(normalizeId));
  for (const id of ids) {
    const normalized = normalizeId(id);
    if (!managed.has(normalized) || stillAssigned.has(normalized)) continue;
    syncReservation(normalized, false);
    managed.delete(normalized);
  }
  writeManagedReservations(managed);
}

function submitSelected() {
  if (!builderComplete()) return;
  const rows = readAssignments();
  const current = assignmentAt(rows, ownState.selected.zone, ownState.selected.slot);
  const ids = selectedIds();
  const row = normalizeAssignment({ ...ownState.selected, members: ids, leaderBaseId: ownState.leaderBaseId || ids[0] });
  const next = rows.filter((item) => assignmentKey(item) !== assignmentKey(row));
  next.push(row);
  writeAssignments(next);

  const beforeReserved = reservedSet();
  const managed = readManagedReservations();
  for (const id of row.members) {
    if (!beforeReserved.has(id)) {
      syncReservation(id, true);
      managed.add(id);
    }
  }
  writeManagedReservations(managed);
  releaseManagedReservations((current?.members || []).filter((id) => !row.members.includes(id)), next);

  ownState.selectedBaseIds = new Set(row.members);
  ownState.leaderBaseId = row.leaderBaseId;
  schedule();
  window.setTimeout(() => document.querySelector(`[data-gac-full-own-zone="${row.zone}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
}

function clearSelected() {
  if (!ownState.selected) return;
  const rows = readAssignments();
  const current = assignmentAt(rows, ownState.selected.zone, ownState.selected.slot);
  const key = `${ownState.selected.zone}:${ownState.selected.slot}`;
  const next = rows.filter((row) => assignmentKey(row) !== key);
  writeAssignments(next);
  releaseManagedReservations(current?.members || [], next);
  ownState.selectedBaseIds = new Set();
  ownState.leaderBaseId = '';
  schedule();
}

function cancelSelected() {
  ownState.selected = null;
  ownState.selectedBaseIds = new Set();
  ownState.leaderBaseId = '';
  schedule();
}

function renderSummary(section) {
  const rows = readAssignments();
  const reserved = reservedIds();
  const assigned = new Set(rows.flatMap((row) => row.members));
  const squads = rows.filter((row) => row.kind === 'squad' && isComplete(row)).length;
  const fleets = rows.filter((row) => row.kind === 'fleet' && isComplete(row)).length;
  const unassigned = reserved.filter((id) => !assigned.has(id));
  let node = section.querySelector(':scope > [data-gac-own-defense-summary]');
  if (!node) {
    node = document.createElement('div');
    node.className = 'gac-own-defense-summary';
    node.dataset.gacOwnDefenseSummary = 'true';
    section.querySelector(':scope > header')?.insertAdjacentElement('afterend', node);
  }
  const signature = JSON.stringify({ reserved: reserved.length, squads, fleets, unassigned: unassigned.length, drawer: ownState.reservedDrawerOpen, unassigned });
  if (node.dataset.signature === signature) return;
  node.dataset.signature = signature;
  node.innerHTML = `<div class="gac-own-defense-summary-stats">
      <article><b>${rows.filter(isComplete).length}</b><span>DEFENSES ASSIGNED</span></article>
      <article><b>${squads}</b><span>SQUADS</span></article>
      <article><b>${fleets}</b><span>FLEETS</span></article>
      <article class="${unassigned.length ? 'has-warning' : ''}"><b>${unassigned.length}</b><span>UNASSIGNED RESERVED</span></article>
    </div>
    <button type="button" data-gac-own-reserved-drawer>${ownState.reservedDrawerOpen ? 'HIDE RESERVED' : `VIEW RESERVED (${reserved.length})`}</button>
    ${ownState.reservedDrawerOpen ? `<div class="gac-own-defense-reserved-drawer">${reserved.length ? reserved.map((id) => {
      const meta = unitMeta(id);
      const row = assignedUnitMap(rows).get(id);
      return `<span class="${row ? 'is-assigned' : ''}">${portraitMarkup(meta)}<b>${safeText(meta.name)}</b><small>${row ? assignmentLabel(row) : 'RESERVED ONLY'}</small></span>`;
    }).join('') : '<em>No reserved units.</em>'}</div>` : ''}`;
}

function builderSlotMarkup(id, index) {
  const meta = id ? unitMeta(id) : null;
  const leader = id && id === ownState.leaderBaseId;
  if (!meta) return `<div class="gac-own-builder-unit is-empty"><span>+</span><small>${index === 0 ? 'LEADER' : `UNIT ${index + 1}`}</small></div>`;
  return `<button type="button" class="gac-own-builder-unit ${leader ? 'is-leader' : ''}" data-gac-own-defense-leader="${safeAttr(id)}">
    ${portraitMarkup(meta)}<strong>${safeText(meta.name)}</strong><small>${leader ? (ownState.selected?.kind === 'fleet' ? 'CAPITAL' : 'LEADER') : 'SET LEADER'}</small>
  </button>`;
}

function renderBuilder(section) {
  let node = section.querySelector(':scope > [data-gac-own-defense-builder]');
  if (!node) {
    node = document.createElement('aside');
    node.className = 'gac-own-defense-builder';
    node.dataset.gacOwnDefenseBuilder = 'true';
    section.appendChild(node);
  }

  if (!ownState.selected) {
    const markup = `<div class="gac-own-builder-empty"><span>DEFENSE SLOT BUILDER</span><strong>Select a slot on Your Battlefield</strong><p>Choose the exact territory position first. Then pick units from the roster here and submit the defense.</p><div class="gac-own-builder-steps"><b>1</b> Slot <b>2</b> Units <b>3</b> Leader <b>4</b> Submit</div></div>`;
    if (node.dataset.signature !== 'empty') {
      node.dataset.signature = 'empty';
      node.innerHTML = markup;
    }
    return;
  }

  const rows = readAssignments();
  const current = assignmentAt(rows, ownState.selected.zone, ownState.selected.slot);
  const ids = selectedIds();
  const limit = builderLimit();
  const complete = builderComplete();
  const signature = JSON.stringify({ selected: ownState.selected, ids, leader: ownState.leaderBaseId, current, complete });
  if (node.dataset.signature === signature) return;
  node.dataset.signature = signature;
  const config = ZONES.find((entry) => entry.zone === ownState.selected.zone);
  const countLabel = ownState.selected.kind === 'fleet' ? `${ids.length}/${builderMinimum()} min · ${limit} max` : `${ids.length}/${limit}`;
  node.innerHTML = `<header>
      <div><span>DEFENSE SLOT BUILDER</span><strong>${safeText(ownState.selected.zone.replaceAll('-', ' '))} · SLOT ${ownState.selected.slot + 1}</strong><small>${safeText(config?.kind === 'fleet' ? 'Fleet defense' : `${currentFormat()} squad defense`)}</small></div>
      <b class="${complete ? 'is-ready' : ''}">${countLabel}</b>
    </header>
    <div class="gac-own-builder-formation">${Array.from({ length: limit }, (_, index) => builderSlotMarkup(ids[index], index)).join('')}</div>
    <p>${ids.length ? 'Click a selected portrait to choose the leader. Click roster cards to add or remove units.' : 'Choose units from the roster. Assigned units in other slots are locked.'}</p>
    <div class="gac-own-builder-actions">
      <button type="button" data-gac-own-defense-submit ${complete ? '' : 'disabled'}>SUBMIT DEFENSE</button>
      ${current ? '<button type="button" data-gac-own-defense-clear>CLEAR SLOT</button>' : ''}
      <button type="button" data-gac-own-defense-cancel>CANCEL</button>
    </div>`;
}

function decorateRoster(section) {
  const rows = readAssignments();
  const assigned = assignedUnitMap(rows);
  const reserved = reservedSet();
  const selected = ownState.selectedBaseIds;
  for (const button of rosterButtons()) {
    const id = normalizeId(button.dataset.gacManualOwnToggle);
    const row = assigned.get(id);
    let state = 'available';
    let label = 'AVAILABLE';
    if (selected.has(id)) { state = 'selected'; label = 'SELECTED'; }
    else if (row) { state = 'assigned'; label = assignmentLabel(row); }
    else if (reserved.has(id)) { state = 'reserved'; label = 'RESERVED'; }
    button.dataset.gacDefenseState = state;
    button.classList.toggle('gac-defense-builder-active', Boolean(ownState.selected));
    const badge = button.querySelector(':scope > b');
    if (badge && badge.textContent !== label) badge.textContent = label;
  }
  section.classList.add('gac-own-defense-professional');
  const header = section.querySelector(':scope > header > div');
  const title = header?.querySelector('strong');
  const copy = header?.querySelector('small');
  if (title && title.textContent !== 'Build your round defenses') title.textContent = 'Build your round defenses';
  if (copy && copy.textContent !== 'Select a battlefield slot, choose units from the roster, set the leader, then submit. Assigned units stay excluded from offense.') {
    copy.textContent = 'Select a battlefield slot, choose units from the roster, set the leader, then submit. Assigned units stay excluded from offense.';
  }
}

function enhance() {
  ensureContext();
  const map = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-gac-map.gac-full-battlefield');
  const section = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense');
  if (!map || !section) return false;
  renderOwnTerritories(map);
  renderSummary(section);
  renderBuilder(section);
  decorateRoster(section);
  return true;
}

function schedule() {
  if (ownState.scheduled) return;
  ownState.scheduled = true;
  queueMicrotask(() => {
    ownState.scheduled = false;
    enhance();
  });
}

function bind() {
  if (window.__gacOwnDefenseSlotsBound) return;
  window.__gacOwnDefenseSlotsBound = true;
  document.addEventListener('click', (event) => {
    const slot = event.target.closest?.('[data-gac-own-defense-slot]');
    if (slot) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectSlot(slot.dataset.zone, slot.dataset.slot, slot.dataset.kind);
      return;
    }

    const roster = event.target.closest?.('.gac-manual-roster-grid [data-gac-manual-own-toggle]');
    if (roster && ownState.selected && !ownState.syncingReservation) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleBuilderUnit(roster.dataset.gacManualOwnToggle);
      return;
    }

    const leader = event.target.closest?.('[data-gac-own-defense-leader]');
    if (leader) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = normalizeId(leader.dataset.gacOwnDefenseLeader);
      if (ownState.selectedBaseIds.has(id)) ownState.leaderBaseId = id;
      schedule();
      return;
    }
    if (event.target.closest?.('[data-gac-own-defense-submit]')) { event.preventDefault(); event.stopImmediatePropagation(); submitSelected(); return; }
    if (event.target.closest?.('[data-gac-own-defense-clear]')) { event.preventDefault(); event.stopImmediatePropagation(); clearSelected(); return; }
    if (event.target.closest?.('[data-gac-own-defense-cancel]')) { event.preventDefault(); event.stopImmediatePropagation(); cancelSelected(); return; }
    if (event.target.closest?.('[data-gac-own-reserved-drawer]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ownState.reservedDrawerOpen = !ownState.reservedDrawerOpen;
      schedule();
    }
  }, true);
}

function injectStyle() {
  if (document.querySelector('link[data-gac-own-defense-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-own-defense-slots.css?v=20260822-ownslots-pro1';
  link.dataset.gacOwnDefenseStyle = 'true';
  document.head.appendChild(link);
}

if (typeof window !== 'undefined') {
  injectStyle();
  bind();
  window.addEventListener('swgoh:gac-battlefield-ready', schedule);
  window.addEventListener('swgoh:workspace-activated', schedule);
  window.addEventListener('swgoh:gac-own-defense-updated', schedule);
  window.addEventListener('hashchange', schedule);
  new MutationObserver((records) => {
    if (records.some((record) => record.addedNodes?.length || record.removedNodes?.length)) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}

export {
  assignedUnitMap,
  builderComplete,
  readAssignments,
  storageKey,
  zoneCapacity,
};
