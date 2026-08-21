import { LEAGUES, RULES } from './gac-league-board-rules.js';
import { boardSnapshot, openSquadSlot } from './gac-manual-board-workspace.js';

const state = {
  selectedKey: '',
  rosterQuery: '',
  timer: null,
  bound: false,
};

const ZONE_LABELS = Object.freeze({
  'BACK-TOP': 'Fleet Territory',
  'FRONT-TOP': 'Front Top',
  'BACK-BOTTOM': 'Back Bottom',
  'FRONT-BOTTOM': 'Front Bottom',
});

const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
const escapeAttr = escapeHtml;

function unitRows(body = {}) {
  const rows = [];
  if (Array.isArray(body?.units)) rows.push(...body.units);
  if (Array.isArray(body?.ships)) rows.push(...body.ships);
  return rows;
}

function unitIndex(snapshot = {}) {
  const map = new Map();
  const add = (unit) => {
    const id = normalizeId(unit?.baseId || unit?.id);
    if (id && !map.has(id)) map.set(id, unit);
  };
  unitRows(snapshot?.catalog).forEach(add);
  unitRows(snapshot?.opponentRoster).forEach(add);
  return map;
}

function unitImage(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}

function portrait(unit = {}, className = '') {
  const name = clean(unit?.name || unit?.baseId || 'Unknown');
  const id = normalizeId(unit?.baseId);
  const image = unitImage(unit);
  return `<span class="gac-arena-portrait ${escapeAttr(className)}" ${id ? `data-inspect-base-id="${escapeAttr(id)}"` : ''} title="${escapeAttr(name)}">
    ${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}
  </span>`;
}

function defenseKey(zone, slot) { return `${clean(zone).toUpperCase()}|${Number(slot)}`; }

function defenseFor(snapshot, zone, slot) {
  return (Array.isArray(snapshot?.defenses) ? snapshot.defenses : []).find((row) =>
    clean(row?.zone).toUpperCase() === clean(zone).toUpperCase() && Number(row?.slot) === Number(slot)
  ) || null;
}

function fleetOperations() { return window.__gacFleetCanonicalOperations || {}; }
function fleetRows() { return Array.isArray(fleetOperations()?.enemyFleets) ? fleetOperations().enemyFleets : []; }
function fleetFor(slot) { return fleetRows().find((row) => Number(row?.slot) === Number(slot)) || null; }

function territory(snapshot, zone) {
  return snapshot?.rule?.territories?.find((row) => row.value === zone) || null;
}

function squadMembers(defense = {}, index = new Map()) {
  return (Array.isArray(defense?.members) ? defense.members : [])
    .map((id) => index.get(normalizeId(id)) || { baseId: normalizeId(id), name: normalizeId(id) })
    .filter((unit) => normalizeId(unit?.baseId));
}

function leaderFor(defense = {}, index = new Map()) {
  const id = normalizeId(defense?.leaderBaseId || defense?.members?.[0]);
  return index.get(id) || (id ? { baseId:id, name:id } : null);
}

function memberPips(defense, index) {
  const leaderId = normalizeId(defense?.leaderBaseId || defense?.members?.[0]);
  return squadMembers(defense, index)
    .filter((unit) => normalizeId(unit?.baseId) !== leaderId)
    .slice(0, 4)
    .map((unit) => portrait(unit, 'is-pip'))
    .join('');
}

function squadNode(snapshot, zone, slot, index) {
  const defense = defenseFor(snapshot, zone, slot);
  const leader = defense ? leaderFor(defense, index) : null;
  const key = defenseKey(zone, slot);
  const selected = state.selectedKey === key;
  const storage = clean(defense?.storage).toLowerCase();
  return `<button type="button" class="gac-arena-node is-squad ${defense ? 'is-filled' : 'is-open'} ${selected ? 'is-selected' : ''}" data-gac-redesign-slot="${escapeAttr(zone)}" data-gac-redesign-slot-index="${slot}" aria-label="${escapeAttr(`${ZONE_LABELS[zone]} slot ${slot + 1}${defense ? `, ${leader?.name || 'defense placed'}` : ', empty'}`)}">
    <span class="gac-arena-node-ring">${leader ? portrait(leader, 'is-leader') : '<b>+</b>'}</span>
    <span class="gac-arena-node-pips">${defense ? memberPips(defense, index) : ''}</span>
    <small>${defense ? escapeHtml(leader?.name || `Squad ${slot + 1}`) : `SLOT ${slot + 1}`}</small>
    ${defense ? `<i class="${storage === 'server' ? 'is-saved' : 'is-draft'}">${storage === 'server' ? 'SAVED' : 'DRAFT'}</i>` : ''}
  </button>`;
}

function fleetNode(snapshot, slot, index) {
  const fleet = fleetFor(slot);
  const capId = normalizeId(fleet?.capitalShipBaseId || fleet?.leaderBaseId);
  const capital = index.get(capId) || (capId ? { baseId:capId, name:capId } : null);
  const key = defenseKey('BACK-TOP', slot);
  const selected = state.selectedKey === key;
  return `<button type="button" class="gac-arena-node is-fleet ${fleet ? 'is-filled' : 'is-open'} ${selected ? 'is-selected' : ''}" data-gac-redesign-fleet-slot="${slot}" data-gac-manual-fleet-planner-focus aria-label="${escapeAttr(`Fleet Territory slot ${slot + 1}${fleet ? `, ${capital?.name || 'fleet placed'}` : ', empty'}`)}">
    <span class="gac-arena-node-ring">${capital ? portrait(capital, 'is-leader') : '<b>+</b>'}</span>
    <span class="gac-arena-node-pips">${fleet ? '<em>FLEET</em>' : ''}</span>
    <small>${fleet ? escapeHtml(capital?.name || `Fleet ${slot + 1}`) : `FLEET ${slot + 1}`}</small>
  </button>`;
}

function zoneHtml(snapshot, zone, index) {
  const rule = territory(snapshot, zone);
  const capacity = Math.max(0, Number(rule?.capacity || 0));
  const fleet = zone === 'BACK-TOP';
  const placed = fleet
    ? Array.from({ length:capacity }, (_, slot) => Boolean(fleetFor(slot))).filter(Boolean).length
    : Array.from({ length:capacity }, (_, slot) => Boolean(defenseFor(snapshot, zone, slot))).filter(Boolean).length;
  const nodes = Array.from({ length:capacity }, (_, slot) => fleet ? fleetNode(snapshot, slot, index) : squadNode(snapshot, zone, slot, index)).join('');
  return `<section class="gac-arena-territory is-${zone.toLowerCase()}" data-gac-arena-zone="${zone}" style="--slot-count:${Math.max(1, capacity)}">
    <header><div><span>${escapeHtml(ZONE_LABELS[zone])}</span><small>${fleet ? 'FLEET' : 'SQUAD'} TERRITORY</small></div><b>${placed}/${capacity}</b></header>
    <div class="gac-arena-slots">${nodes}</div>
  </section>`;
}

function battlefieldHtml(snapshot) {
  const index = unitIndex(snapshot);
  const rule = snapshot?.rule || {};
  const fleetPlaced = fleetRows().filter((row) => Number.isInteger(Number(row?.slot)) && Number(row.slot) < Number(rule?.fleetTeams || 0)).length;
  const squadPlaced = Array.isArray(snapshot?.defenses) ? snapshot.defenses.length : 0;
  const totalPlaced = squadPlaced + fleetPlaced;
  return `<section class="gac-arena-board" data-gac-arena-board>
    <header class="gac-arena-board-head">
      <div><span>ENEMY BOARD</span><strong>${escapeHtml(rule.league || 'GAC')} · ${escapeHtml(String(rule.format || '').toUpperCase())}</strong></div>
      <div class="gac-arena-board-count"><b>${totalPlaced}/${Number(rule.totalDefenses || 0)}</b><small>DEFENSES ENTERED</small></div>
    </header>
    <div class="gac-arena-stage">
      ${zoneHtml(snapshot, 'BACK-TOP', index)}
      ${zoneHtml(snapshot, 'FRONT-TOP', index)}
      ${zoneHtml(snapshot, 'BACK-BOTTOM', index)}
      ${zoneHtml(snapshot, 'FRONT-BOTTOM', index)}
      <div class="gac-arena-emblem" aria-hidden="true"><span>GAC</span><b>◆</b></div>
    </div>
  </section>`;
}

function opponentCharacters(snapshot) {
  const rows = Array.isArray(snapshot?.opponentRoster?.units) ? snapshot.opponentRoster.units : [];
  return rows
    .filter((unit) => clean(unit?.unitType).toLowerCase() !== 'ship')
    .slice()
    .sort((a,b) => n(b?.power) - n(a?.power) || clean(a?.name).localeCompare(clean(b?.name)));
}

function rosterShelfHtml(snapshot) {
  const query = clean(state.rosterQuery).toLowerCase();
  const activeSquadSlot = state.selectedKey && !state.selectedKey.startsWith('BACK-TOP|');
  const rows = opponentCharacters(snapshot)
    .filter((unit) => !query || clean(unit?.name).toLowerCase().includes(query) || normalizeId(unit?.baseId).toLowerCase().includes(query))
    .slice(0, 42);
  return `<section class="gac-arena-roster">
    <header><div><span>DEFENSE ASSIGNMENT</span><strong>Opponent roster</strong></div><b>${rows.length}</b></header>
    <input data-gac-redesign-roster-search placeholder="Search opponent characters…" value="${escapeAttr(state.rosterQuery)}">
    <div class="gac-arena-roster-grid">${rows.map((unit) => `<button type="button" data-gac-board-add-unit="${escapeAttr(normalizeId(unit.baseId))}" data-gac-redesign-roster-unit data-name="${escapeAttr(clean(unit.name).toLowerCase())}" ${activeSquadSlot ? '' : 'disabled'}>
      ${portrait(unit, 'is-roster')}
      <span><strong>${escapeHtml(unit.name)}</strong><small>R${n(unit.relic)} · ${n(unit.power).toLocaleString()} GP</small></span>
    </button>`).join('') || '<p>No opponent character roster is available.</p>'}</div>
    <small class="gac-arena-roster-help">${activeSquadSlot ? 'Select characters below the highlighted board slot. The first selected unit becomes leader unless you change it.' : 'Select a squad circle on the board first.'}</small>
  </section>`;
}

function datacronLine(defense = {}) {
  const status = clean(defense?.datacronState).toLowerCase();
  const id = clean(defense?.datacron?.id || defense?.datacronId);
  if (status === 'assigned') return id ? `Assigned · ${id.slice(-8)}` : 'Assigned · exact ID unavailable';
  if (status === 'none') return 'Confirmed none';
  return 'Not confirmed';
}

function selectedSlotHtml(snapshot) {
  const [zoneRaw, slotRaw] = clean(state.selectedKey).split('|');
  const zone = clean(zoneRaw).toUpperCase();
  const slot = Number(slotRaw);
  const index = unitIndex(snapshot);
  const validSlot = Number.isInteger(slot) && slot >= 0 && territory(snapshot, zone) && slot < Number(territory(snapshot, zone)?.capacity || 0);
  const rule = snapshot?.rule || {};
  if (!validSlot) {
    return `<section class="gac-arena-selected"><header><span>SELECTED SLOT</span><strong>Choose a circle</strong></header><div class="gac-arena-selected-empty"><b>+</b><strong>No defense selected</strong><small>Click an open or occupied circle on the battleground.</small></div>${rulesHtml(rule)}</section>`;
  }
  if (zone === 'BACK-TOP') {
    const fleet = fleetFor(slot);
    const capId = normalizeId(fleet?.capitalShipBaseId || fleet?.leaderBaseId);
    const cap = index.get(capId) || (capId ? { baseId:capId, name:capId } : null);
    return `<section class="gac-arena-selected"><header><span>SELECTED SLOT</span><strong>${escapeHtml(ZONE_LABELS[zone])} · Fleet ${slot + 1}</strong></header>
      <div class="gac-arena-selected-leader">${cap ? portrait(cap, 'is-selected-leader') : '<div class="gac-arena-selected-placeholder">+</div>'}<div><span>CAPITAL SHIP</span><strong>${escapeHtml(cap?.name || 'Empty fleet slot')}</strong><small>${fleet ? 'Canonical fleet record linked' : 'Use Fleet Territory to enter the visible enemy fleet.'}</small></div></div>
      <button type="button" class="gac-arena-primary" data-gac-manual-fleet-planner-focus>${fleet ? 'OPEN FLEET DEFENSE' : 'ENTER FLEET DEFENSE'}</button>
      ${rulesHtml(rule)}
    </section>`;
  }
  const defense = defenseFor(snapshot, zone, slot);
  const leader = defense ? leaderFor(defense, index) : null;
  const members = defense ? squadMembers(defense, index) : [];
  const key = defenseKey(zone, slot);
  return `<section class="gac-arena-selected"><header><span>SELECTED SLOT</span><strong>${escapeHtml(ZONE_LABELS[zone])} · Slot ${slot + 1}</strong></header>
    <div class="gac-arena-selected-leader">${leader ? portrait(leader, 'is-selected-leader') : '<div class="gac-arena-selected-placeholder">+</div>'}<div><span>${leader ? 'LEADER' : 'EMPTY SLOT'}</span><strong>${escapeHtml(leader?.name || 'Assign a defense')}</strong><small>${defense ? escapeHtml(datacronLine(defense)) : `Select ${Number(rule.squadSize || 5)} opponent characters.`}</small></div></div>
    ${members.length ? `<div class="gac-arena-selected-members"><span>SQUAD MEMBERS</span><div>${members.map((unit) => portrait(unit, normalizeId(unit.baseId) === normalizeId(defense?.leaderBaseId) ? 'is-member is-leader' : 'is-member')).join('')}</div></div>` : ''}
    ${defense ? `<div class="gac-arena-selected-actions"><button type="button" data-gac-board-edit="${escapeAttr(key)}">EDIT DEFENSE</button><button type="button" class="is-danger" data-gac-board-delete="${escapeAttr(key)}">DELETE</button></div>` : '<small class="gac-arena-selected-tip">The highlighted circle is ready. Choose characters from the roster panel.</small>'}
    ${rulesHtml(rule)}
  </section>`;
}

function rulesHtml(rule = {}) {
  const format = clean(rule?.format) === '3v3' ? '3v3' : '5v5';
  return `<section class="gac-arena-rules"><header><span>DEFENSE REQUIREMENTS</span><b>${escapeHtml(format.toUpperCase())}</b></header>
    <div class="gac-arena-rule-current"><div><b>${Number(rule.squadTeams || 0)}</b><small>SQUAD</small></div><div><b>${Number(rule.fleetTeams || 0)}</b><small>FLEET</small></div><div><b>${Number(rule.totalDefenses || 0)}</b><small>TOTAL</small></div></div>
    <table><thead><tr><th>League</th><th>Squad</th><th>Fleet</th><th>Total</th></tr></thead><tbody>${LEAGUES.map((league) => {
      const row = RULES[league]?.[format] || {};
      const active = league === rule.league;
      return `<tr class="${active ? 'is-active' : ''}"><td>${escapeHtml(league)}</td><td>${Number(row.squadTeams || 0)}</td><td>${Number(row.fleetTeams || 0)}</td><td>${Number(row.squadTeams || 0) + Number(row.fleetTeams || 0)}</td></tr>`;
    }).join('')}</tbody></table>
  </section>`;
}

function collapseLegacyPlanner() {
  const legacy = document.querySelector('[data-gac-manual-counter-planner]');
  if (!legacy || legacy.closest('[data-gac-redesign-legacy-tools]')) return;
  const details = document.createElement('details');
  details.className = 'gac-redesign-legacy-tools';
  details.dataset.gacRedesignLegacyTools = 'true';
  details.innerHTML = '<summary>Advanced legacy roster tools <span>preserved fallback</span></summary>';
  legacy.insertAdjacentElement('beforebegin', details);
  details.appendChild(legacy);
}

function buildLayout(root, snapshot) {
  const oldShell = root.querySelector(':scope > [data-gac-redesign-shell]');
  if (oldShell) oldShell.remove();
  const editorHost = root.querySelector(':scope > [data-gac-board-editor-host]') || root.querySelector('[data-gac-board-editor-host]');
  const zones = root.querySelector(':scope > .gac-visible-zones') || root.querySelector('.gac-visible-zones');
  if (!editorHost || !zones) return false;

  const shell = document.createElement('section');
  shell.className = 'gac-redesign-shell';
  shell.dataset.gacRedesignShell = 'true';
  shell.innerHTML = `<div class="gac-redesign-main"><aside class="gac-redesign-left">${rosterShelfHtml(snapshot)}<div data-gac-redesign-editor-slot></div></aside><main class="gac-redesign-center">${battlefieldHtml(snapshot)}</main><aside class="gac-redesign-right">${selectedSlotHtml(snapshot)}</aside></div><section class="gac-redesign-counter"><header><div><span>COUNTER PLAN</span><strong>Saved defenses + War Room operations</strong></div><small>Lock counters, execute attempts and record results without leaving the board.</small></header><div data-gac-redesign-counter-host></div></section>`;

  const editorSlot = shell.querySelector('[data-gac-redesign-editor-slot]');
  const counterHost = shell.querySelector('[data-gac-redesign-counter-host]');
  editorSlot.appendChild(editorHost);
  counterHost.appendChild(zones);

  const progress = root.querySelector(':scope > .gac-board-progress');
  const warSummary = root.querySelector(':scope > [data-gac-manual-war-summary]');
  const anchor = warSummary || progress || root.querySelector(':scope > .gac-board-config') || root.firstElementChild;
  if (anchor) anchor.insertAdjacentElement('afterend', shell); else root.appendChild(shell);
  return true;
}

function enhance() {
  collapseLegacyPlanner();
  const root = document.querySelector('[data-gac-board-workspace] .gac-visible-board');
  if (!root) return false;
  let snapshot;
  try { snapshot = boardSnapshot(); } catch { return false; }
  const selectedParts = clean(state.selectedKey).split('|');
  const selectedRule = territory(snapshot, clean(selectedParts[0]).toUpperCase());
  if (state.selectedKey && (!selectedRule || !Number.isInteger(Number(selectedParts[1])) || Number(selectedParts[1]) >= Number(selectedRule.capacity || 0))) state.selectedKey = '';
  buildLayout(root, snapshot);
  root.dataset.gacBattlegroundRedesign = 'true';
  return true;
}

function filterRoster(value) {
  state.rosterQuery = clean(value);
  const query = state.rosterQuery.toLowerCase();
  for (const button of document.querySelectorAll('[data-gac-redesign-roster-unit]')) {
    button.hidden = Boolean(query && !clean(button.dataset.name).includes(query));
  }
}

function schedule(delay = 40) {
  clearTimeout(state.timer);
  state.timer = setTimeout(enhance, Math.max(0, delay));
}

function injectStyle() {
  if (document.querySelector('link[data-gac-battleground-redesign-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-battleground-redesign.css?v=20260822-arena1';
  link.dataset.gacBattlegroundRedesignStyle = 'true';
  document.head.appendChild(link);
}

function bind() {
  if (state.bound) return;
  state.bound = true;
  injectStyle();
  document.addEventListener('click', (event) => {
    const squad = event.target.closest?.('[data-gac-redesign-slot]');
    if (squad) {
      const zone = clean(squad.dataset.gacRedesignSlot).toUpperCase();
      const slot = Number(squad.dataset.gacRedesignSlotIndex);
      state.selectedKey = defenseKey(zone, slot);
      openSquadSlot(zone, slot);
      schedule(20);
      return;
    }
    const fleet = event.target.closest?.('[data-gac-redesign-fleet-slot]');
    if (fleet) {
      state.selectedKey = defenseKey('BACK-TOP', Number(fleet.dataset.gacRedesignFleetSlot));
      schedule(20);
    }
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target?.matches?.('[data-gac-redesign-roster-search]')) filterRoster(event.target.value);
  }, true);
  window.addEventListener('gac-visible-board-rendered', () => schedule(10));
  window.addEventListener('gac-board-evidence-updated', () => schedule(50));
  window.addEventListener('gac-fleet-round-state-updated', () => schedule(50));
  window.addEventListener('gac-war-room-updated', () => schedule(50));
  window.addEventListener('hashchange', () => schedule(80));
  document.addEventListener('DOMContentLoaded', () => schedule(120), { once:true });
  new MutationObserver(() => {
    if (document.querySelector('[data-gac-board-workspace] .gac-visible-board') && !document.querySelector('[data-gac-redesign-shell]')) schedule(30);
  }).observe(document.documentElement, { childList:true, subtree:true });
  schedule(200);
}

if (typeof document !== 'undefined') bind();

export { battlefieldHtml, defenseFor, enhance, rulesHtml, selectedSlotHtml, zoneHtml };