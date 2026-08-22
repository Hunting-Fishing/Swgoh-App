const ownState = {
  selected: null,
  leaderBaseId: '',
  scheduled: false,
};

const ZONES = Object.freeze([
  Object.freeze({ zone: 'BACK-TOP', kind: 'fleet', opponentSelector: '.gac-manual-map-zone.is-back-top' }),
  Object.freeze({ zone: 'FRONT-TOP', kind: 'squad', opponentSelector: '.gac-manual-map-zone.is-front-top' }),
  Object.freeze({ zone: 'BACK-BOTTOM', kind: 'squad', opponentSelector: '.gac-manual-map-zone.is-back-bottom' }),
  Object.freeze({ zone: 'FRONT-BOTTOM', kind: 'squad', opponentSelector: '.gac-manual-map-zone.is-front-bottom' }),
]);

function clean(value) { return String(value ?? '').trim(); }
function digits(value) { return clean(value).replace(/\D/g, '').slice(0, 9); }
function normalizeId(value) { return clean(value).split(':')[0].toUpperCase(); }
function currentFormat() { return clean(document.querySelector('[data-gac-manual-format]')?.value).toLowerCase() === '3v3' ? '3v3' : '5v5'; }
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

function normalizeAssignment(value = {}) {
  const zone = clean(value.zone).toUpperCase();
  const slot = Math.max(0, Number.isInteger(Number(value.slot)) ? Number(value.slot) : 0);
  const kind = zone === 'BACK-TOP' ? 'fleet' : 'squad';
  const members = [...new Set((Array.isArray(value.members) ? value.members : []).map(normalizeId).filter(Boolean))].slice(0, kind === 'fleet' ? 8 : squadSize());
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

function reservedIds() {
  return [...document.querySelectorAll('[data-gac-manual-counter-planner] .gac-manual-reserved [data-gac-manual-own-toggle]')]
    .map((button) => normalizeId(button.dataset.gacManualOwnToggle))
    .filter(Boolean);
}

function rosterButton(id) {
  const normalized = normalizeId(id);
  return [...document.querySelectorAll('[data-gac-manual-counter-planner] [data-gac-manual-own-toggle]')]
    .find((button) => normalizeId(button.dataset.gacManualOwnToggle) === normalized) || null;
}

function unitMeta(id) {
  const normalized = normalizeId(id);
  const button = rosterButton(normalized);
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
function assignmentAt(rows, zone, slot) { return rows.find((row) => row.zone === zone && Number(row.slot) === Number(slot)) || null; }

function eligiblePending(rows, selected) {
  if (!selected) return [];
  const occupiedElsewhere = new Set(rows
    .filter((row) => assignmentKey(row) !== `${selected.zone}:${selected.slot}`)
    .flatMap((row) => row.members));
  return reservedIds().filter((id) => {
    if (occupiedElsewhere.has(id)) return false;
    const kind = knownUnitKind(id);
    return !kind || kind === selected.kind;
  });
}

function isComplete(row) {
  if (!row) return false;
  if (row.kind === 'fleet') return row.members.length >= 4 && row.members.length <= 8 && row.members.includes(row.leaderBaseId);
  return row.members.length === squadSize() && row.members.includes(row.leaderBaseId);
}

function safeAttr(value) { return clean(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function safeText(value) { return clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function portraitMarkup(meta, cls = '') {
  const image = meta.image ? `<img src="${safeAttr(meta.image)}" alt="${safeAttr(meta.name)}" loading="lazy">` : `<b>${safeText(meta.name.slice(0, 2).toUpperCase())}</b>`;
  return `<span class="gac-own-defense-portrait ${cls}" title="${safeAttr(meta.name)}">${image}</span>`;
}

function ownSlotMarkup(row, zone, slot, kind) {
  const selected = ownState.selected?.zone === zone && Number(ownState.selected?.slot) === slot;
  if (!row) {
    return `<button type="button" class="gac-own-defense-slot is-empty ${selected ? 'is-selected' : ''}" data-gac-own-defense-slot data-zone="${zone}" data-slot="${slot}" data-kind="${kind}">
      <span class="gac-own-defense-empty-orbit">+</span><strong>${kind === 'fleet' ? 'FLEET' : 'SQUAD'} ${slot + 1}</strong><small>Select slot</small>
    </button>`;
  }
  const leader = unitMeta(row.leaderBaseId || row.members[0]);
  const others = row.members.filter((id) => id !== row.leaderBaseId).map(unitMeta);
  return `<button type="button" class="gac-own-defense-slot is-filled ${selected ? 'is-selected' : ''} ${isComplete(row) ? '' : 'is-incomplete'}" data-gac-own-defense-slot data-zone="${zone}" data-slot="${slot}" data-kind="${kind}">
    <span class="gac-own-defense-formation">${portraitMarkup(leader, 'is-leader')}<span class="gac-own-defense-pips">${others.map((meta) => portraitMarkup(meta)).join('')}</span></span>
    <strong>${safeText(leader.name)}</strong><small>${isComplete(row) ? `SLOT ${slot + 1}` : 'INCOMPLETE · EDIT'}</small>
  </button>`;
}

function renderOwnTerritories(map) {
  const rows = readAssignments();
  const reserved = reservedIds();
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
      reserved,
    });
    if (host.dataset.gacOwnDefenseSignature === signature) continue;
    host.dataset.gacOwnDefenseSignature = signature;
    host.innerHTML = Array.from({ length: capacity }, (_, slot) => ownSlotMarkup(assignmentAt(rows, config.zone, slot), config.zone, slot, config.kind)).join('');
  }
}

function ensureOwnDefenseExpanded() {
  const section = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense');
  if (!section) return null;
  if (section.classList.contains('gac-ux-collapsed')) {
    section.querySelector('[data-gac-ux-collapse-defense]')?.click();
    return null;
  }
  return section;
}

function assignmentEditorMarkup(current, pending, canSubmit) {
  return `<div class="gac-own-defense-editor-copy">
      <span>ROUND DEFENSE SLOT</span>
      <strong>${safeText(ownState.selected.zone.replaceAll('-', ' '))} · SLOT ${ownState.selected.slot + 1}</strong>
      <small>${pending.length}/${ownState.selected.kind === 'fleet' ? '4–8' : squadSize()} ${ownState.selected.kind === 'fleet' ? 'ships selected · choose capital ship' : 'units selected · choose leader'}</small>
    </div>
    <div class="gac-own-defense-editor-members">${pending.length ? pending.map((id) => {
      const meta = unitMeta(id);
      const leader = id === ownState.leaderBaseId;
      return `<button type="button" class="${leader ? 'is-leader' : ''}" data-gac-own-defense-leader="${id}" title="Set ${safeAttr(meta.name)} as ${ownState.selected.kind === 'fleet' ? 'capital' : 'leader'}">${portraitMarkup(meta)}<span>${leader ? (ownState.selected.kind === 'fleet' ? 'CAPITAL' : 'LEADER') : 'SET LEADER'}</span></button>`;
    }).join('') : '<em>Mark units below as ON DEFENSE. Unassigned reserved units become the pending squad for this slot.</em>'}</div>
    <div class="gac-own-defense-editor-actions">
      <button type="button" data-gac-own-defense-submit ${canSubmit ? '' : 'disabled'}>SUBMIT DEFENSE</button>
      ${current ? '<button type="button" data-gac-own-defense-clear>CLEAR SLOT</button>' : ''}
      <button type="button" data-gac-own-defense-cancel>CANCEL</button>
    </div>`;
}

function renderAssignmentEditor() {
  const existing = document.querySelector('[data-gac-own-defense-editor]');
  if (!ownState.selected) {
    existing?.remove();
    return;
  }
  const section = ensureOwnDefenseExpanded();
  if (!section) {
    schedule();
    return;
  }
  const rows = readAssignments();
  const current = assignmentAt(rows, ownState.selected.zone, ownState.selected.slot);
  const pending = eligiblePending(rows, ownState.selected);
  if (!ownState.leaderBaseId || !pending.includes(ownState.leaderBaseId)) ownState.leaderBaseId = current?.leaderBaseId && pending.includes(current.leaderBaseId) ? current.leaderBaseId : (pending[0] || '');
  const canSubmit = ownState.selected.kind === 'fleet'
    ? pending.length >= 4 && pending.length <= 8 && pending.includes(ownState.leaderBaseId)
    : pending.length === squadSize() && pending.includes(ownState.leaderBaseId);
  const signature = JSON.stringify({ selected: ownState.selected, leader: ownState.leaderBaseId, pending, current, canSubmit });
  const markup = assignmentEditorMarkup(current, pending, canSubmit);
  if (existing && existing.dataset.gacOwnDefenseSignature === signature) return;
  if (existing) {
    existing.dataset.gacOwnDefenseSignature = signature;
    existing.innerHTML = markup;
    return;
  }
  const editor = document.createElement('div');
  editor.className = 'gac-own-defense-editor';
  editor.dataset.gacOwnDefenseEditor = 'true';
  editor.dataset.gacOwnDefenseSignature = signature;
  editor.innerHTML = markup;
  section.insertBefore(editor, section.querySelector('.gac-manual-reserved'));
}

function selectSlot(zone, slot, kind) {
  ownState.selected = { zone: clean(zone).toUpperCase(), slot: Number(slot), kind: clean(kind) === 'fleet' ? 'fleet' : 'squad' };
  const current = assignmentAt(readAssignments(), ownState.selected.zone, ownState.selected.slot);
  ownState.leaderBaseId = current?.leaderBaseId || '';
  const section = ensureOwnDefenseExpanded();
  schedule();
  window.setTimeout(() => (section || document.querySelector('[data-gac-manual-counter-planner] .gac-manual-own-defense'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

function submitSelected() {
  if (!ownState.selected) return;
  const rows = readAssignments();
  const pending = eligiblePending(rows, ownState.selected);
  const valid = ownState.selected.kind === 'fleet' ? pending.length >= 4 && pending.length <= 8 : pending.length === squadSize();
  if (!valid) return;
  const row = normalizeAssignment({ ...ownState.selected, members: pending, leaderBaseId: ownState.leaderBaseId || pending[0] });
  const next = rows.filter((item) => assignmentKey(item) !== assignmentKey(row));
  next.push(row);
  writeAssignments(next);
  schedule();
  document.querySelector(`[data-gac-full-own-zone="${row.zone}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearSelected() {
  if (!ownState.selected) return;
  const key = `${ownState.selected.zone}:${ownState.selected.slot}`;
  writeAssignments(readAssignments().filter((row) => assignmentKey(row) !== key));
  ownState.leaderBaseId = '';
  schedule();
}

function cancelSelected() {
  ownState.selected = null;
  ownState.leaderBaseId = '';
  schedule();
}

function enhance() {
  const map = document.querySelector('[data-gac-manual-counter-planner] .gac-manual-gac-map.gac-full-battlefield');
  if (!map) return false;
  renderOwnTerritories(map);
  renderAssignmentEditor();
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
    const leader = event.target.closest?.('[data-gac-own-defense-leader]');
    if (leader) {
      event.preventDefault();
      ownState.leaderBaseId = normalizeId(leader.dataset.gacOwnDefenseLeader);
      schedule();
      return;
    }
    if (event.target.closest?.('[data-gac-own-defense-submit]')) { event.preventDefault(); submitSelected(); return; }
    if (event.target.closest?.('[data-gac-own-defense-clear]')) { event.preventDefault(); clearSelected(); return; }
    if (event.target.closest?.('[data-gac-own-defense-cancel]')) { event.preventDefault(); cancelSelected(); return; }
  }, true);
}

function injectStyle() {
  if (document.querySelector('link[data-gac-own-defense-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-own-defense-slots.css?v=20260822-ownslots1';
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

export { eligiblePending, isComplete, readAssignments, storageKey, zoneCapacity };
