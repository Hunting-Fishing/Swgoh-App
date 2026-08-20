import {
  assignmentIndex,
  boardKey,
  boardTerritories,
  defaultRevealState,
  normalizeRevealState,
  proposedAttackOrder,
  rosterAvailability,
  territoryProgress,
  validFleetDraft,
} from './gac-board-v2-model.js';
import { boardSnapshot, openSquadSlot } from './gac-manual-board-workspace.js';

const state = {
  contextKey: '',
  fleetDrafts: [],
  reveal: defaultRevealState(),
  fleetEditor: null,
  availabilityFilter: 'all',
  availabilityQuery: '',
  timer: null,
};

const number = new Intl.NumberFormat('en-US');
const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;

function contextBase(snapshot) {
  return `swgoh:gac-visible-board:v1:${snapshot.ownerCode || 'anonymous'}:${snapshot.opponentCode || 'manual'}:${snapshot.round || 0}:${snapshot.format}`;
}
function fleetKey(snapshot) { return `${contextBase(snapshot)}:fleet`; }
function revealKey(snapshot) { return `${contextBase(snapshot)}:reveal`; }
function parseRows(key) {
  try {
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function parseObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function writeFleet(snapshot) { localStorage.setItem(fleetKey(snapshot), JSON.stringify(state.fleetDrafts)); }
function writeReveal(snapshot) { localStorage.setItem(revealKey(snapshot), JSON.stringify(state.reveal)); }
function syncContext(snapshot) {
  const key = contextBase(snapshot);
  if (state.contextKey === key) return;
  state.contextKey = key;
  state.fleetDrafts = parseRows(fleetKey(snapshot)).map(validFleetDraft).filter((row) => row.zone && row.slot !== null);
  state.reveal = normalizeRevealState(parseObject(revealKey(snapshot)));
  if (snapshot.defenses.some((row) => clean(row.zone).toUpperCase() === 'BACK-BOTTOM')) state.reveal = normalizeRevealState({ ...state.reveal, 'BACK-BOTTOM': true });
  if (state.fleetDrafts.length) state.reveal = normalizeRevealState({ ...state.reveal, 'BACK-TOP': true });
  state.fleetEditor = null;
}

function units(body = {}, type = '') {
  const expected = clean(type).toLowerCase();
  return (Array.isArray(body?.units) ? body.units : []).filter((unit) => !expected || clean(unit?.unitType).toLowerCase() === expected);
}
function sourceShips(snapshot) {
  const opponent = units(snapshot.opponentRoster, 'ship');
  return opponent.length ? opponent : units({ units: snapshot.catalog?.units || [] }, 'ship');
}
function isCapitalShip(unit = {}) {
  const id = normalizeId(unit?.baseId);
  if (id.startsWith('CAPITAL')) return true;
  const values = [unit?.categories, unit?.factions, unit?.tags].flatMap((value) => Array.isArray(value) ? value : []).map((value) => clean(value).toLowerCase());
  return values.some((value) => value.includes('capital ship'));
}
function imageUrl(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function unitIndex(snapshot, side = 'opponent') {
  const source = side === 'owner'
    ? units(snapshot.ownerRoster)
    : units(snapshot.opponentRoster).length ? units(snapshot.opponentRoster) : units({ units: snapshot.catalog?.units || [] });
  return new Map(source.map((unit) => [normalizeId(unit?.baseId), unit]).filter(([id]) => id));
}
function portrait(unit = {}, cls = '') {
  const name = clean(unit?.name || unit?.baseId || 'Unknown');
  const id = normalizeId(unit?.baseId);
  const image = imageUrl(unit);
  return `<span class="gac-board-v2-unit ${escapeAttr(cls)}" ${id ? `data-inspect-base-id="${escapeAttr(id)}"` : ''} title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function unitFor(index, id) {
  const key = normalizeId(id);
  return index.get(key) || { baseId: key, name: key };
}

function fleetBoardKey(row = {}) { return `BACK-TOP|${Number(row?.slot)}`; }
function fleetAt(slot) { return state.fleetDrafts.find((row) => Number(row.slot) === Number(slot)) || null; }
function saveFleetDraft(snapshot, value) {
  const draft = validFleetDraft(value);
  if (!draft.complete) return false;
  state.fleetDrafts = state.fleetDrafts.filter((row) => fleetBoardKey(row) !== fleetBoardKey(draft));
  state.fleetDrafts.push(draft);
  state.fleetDrafts.sort((a, b) => a.slot - b.slot);
  writeFleet(snapshot);
  return true;
}
function deleteFleetDraft(snapshot, slot) {
  state.fleetDrafts = state.fleetDrafts.filter((row) => Number(row.slot) !== Number(slot));
  writeFleet(snapshot);
}

function setReveal(snapshot, zone, value) {
  if (!['BACK-TOP','BACK-BOTTOM'].includes(zone)) return;
  state.reveal = normalizeRevealState({ ...state.reveal, [zone]: value === true });
  writeReveal(snapshot);
}

function assignmentLabel(assignment, snapshot) {
  if (!assignment?.recommendation?.squad?.length) return Object.freeze({ label: 'NO COUNTER ALLOCATED', className: 'is-none', detail: 'No non-overlapping attack squad is available from the current planner state.' });
  if (assignment.source === 'historical-counter-evidence') {
    const battles = n(assignment.recommendation?.battles);
    const wins = n(assignment.recommendation?.wins);
    return Object.freeze({ label: 'HISTORICAL EVIDENCE', className: 'is-evidence', detail: battles > 0 ? `${number.format(wins)}/${number.format(battles)} observed wins · not a predicted win rate` : 'Exact-team evidence allocated' });
  }
  return Object.freeze({
    label: snapshot.planMode === 'identity-only' ? 'IDENTITY-ONLY HEURISTIC' : 'ROSTER-FIT HEURISTIC',
    className: 'is-heuristic',
    detail: clean(assignment.allocationReason || assignment.recommendation?.confidence || 'Board-wide allocation'),
  });
}

function squadSlotHtml(slot, snapshot, assignments) {
  if (!slot.defense) {
    return `<button type="button" class="gac-board-v2-slot is-empty" data-gac-board-v2-squad-slot="${escapeAttr(slot.zone)}|${slot.slot}"><span>SLOT ${slot.displaySlot}</span><strong>+ ENTER DEFENSE</strong><small>${snapshot.squadSize} characters</small></button>`;
  }
  const enemyIndex = unitIndex(snapshot, 'opponent');
  const ownerIndex = unitIndex(snapshot, 'owner');
  const assignment = assignments.get(boardKey(slot.defense)) || null;
  const status = assignmentLabel(assignment, snapshot);
  const enemy = (Array.isArray(slot.defense.members) ? slot.defense.members : []).map((id) => unitFor(enemyIndex, id));
  const counter = (Array.isArray(assignment?.recommendation?.squad) ? assignment.recommendation.squad : []).map((unit) => ownerIndex.get(normalizeId(unit?.baseId)) || unit);
  return `<article class="gac-board-v2-slot is-filled ${escapeAttr(status.className)}" data-gac-board-v2-key="${escapeAttr(boardKey(slot.defense))}">
    <header><span>SLOT ${slot.displaySlot}</span><button type="button" data-gac-board-v2-squad-slot="${escapeAttr(slot.zone)}|${slot.slot}">Edit</button></header>
    <div class="gac-board-v2-enemy"><div>${enemy.map((unit) => portrait(unit)).join('')}</div><strong>${escapeHtml(enemy[0]?.name || slot.defense.leaderBaseId || 'Enemy defense')}</strong></div>
    <div class="gac-board-v2-counter"><span>${escapeHtml(status.label)}</span><div>${counter.map((unit) => portrait(unit, 'is-counter')).join('') || '<small>Counter unresolved</small>'}</div><p>${escapeHtml(status.detail)}</p></div>
  </article>`;
}

function fleetSummary(row, snapshot) {
  const index = new Map(sourceShips(snapshot).map((unit) => [normalizeId(unit?.baseId), unit]));
  const capital = unitFor(index, row.capitalShipBaseId);
  const starters = row.starters.map((id) => unitFor(index, id));
  const reinforcements = row.reinforcements.map((id) => unitFor(index, id));
  return `<article class="gac-board-v2-slot is-filled is-fleet"><header><span>FLEET ${row.slot + 1}</span><button type="button" data-gac-board-v2-fleet-edit="${row.slot}">Edit</button></header><div class="gac-board-v2-fleet-team"><div class="gac-board-v2-capital">${portrait(capital)}<strong>CAPITAL</strong></div><div>${starters.map((unit) => portrait(unit)).join('')}</div></div>${reinforcements.length ? `<div class="gac-board-v2-reinforcements"><span>REINFORCEMENTS</span><div>${reinforcements.map((unit) => portrait(unit)).join('')}</div></div>` : ''}<div class="gac-board-v2-fleet-gate"><strong>FLEET COUNTER INTELLIGENCE</strong><span>Identity captured. Counter execution remains source-gated until B12/B13 fleet evidence is loaded.</span></div></article>`;
}
function fleetSlotHtml(slot, snapshot) {
  const row = fleetAt(slot.slot);
  if (row) return fleetSummary(row, snapshot);
  return `<button type="button" class="gac-board-v2-slot is-empty is-fleet" data-gac-board-v2-fleet-slot="${slot.slot}"><span>FLEET ${slot.displaySlot}</span><strong>+ ENTER FLEET</strong><small>Capital + 3 starters · reinforcements optional</small></button>`;
}

function territoryHtml(territory, snapshot, assignments) {
  const progress = territoryProgress(territory);
  const rear = Boolean(territory.unlockFrom);
  if (!territory.revealed) {
    return `<section class="gac-board-v2-territory is-locked ${escapeAttr(territory.position)}"><header><div><span>${escapeHtml(territory.label.toUpperCase())}</span><strong>${territory.kind === 'fleet' ? `${territory.capacity} fleet slot${territory.capacity===1?'':'s'}` : `${territory.capacity} squad slot${territory.capacity===1?'':'s'}`}</strong></div><b>HIDDEN IN-GAME</b></header><div class="gac-board-v2-lock"><strong>⌁ BACK TERRITORY NOT REVEALED</strong><p>Unlocks after ${escapeHtml(territory.unlockFrom === 'FRONT-TOP' ? 'Front Top' : 'Front Bottom')} is conquered. Command Center will not infer its lineup.</p><button type="button" data-gac-board-v2-reveal="${escapeAttr(territory.value)}">Mark Revealed From Game</button></div></section>`;
  }
  return `<section class="gac-board-v2-territory ${progress.complete ? 'is-complete' : ''} ${territory.kind === 'fleet' ? 'is-fleet' : ''} ${escapeAttr(territory.position)}"><header><div><span>${escapeHtml(territory.label.toUpperCase())}</span><strong>${progress.entered}/${progress.capacity} ${territory.kind === 'fleet' ? 'fleets' : 'squads'} entered</strong></div>${rear ? `<button type="button" data-gac-board-v2-hide="${escapeAttr(territory.value)}">Mark Hidden</button>` : `<b>VISIBLE FRONT</b>`}</header><div class="gac-board-v2-territory-progress"><i style="--territory-progress:${progress.percent}%"></i><span>${progress.complete ? 'ENTRY COMPLETE' : `${Math.max(0, progress.capacity-progress.entered)} SLOT${progress.capacity-progress.entered===1?'':'S'} REMAIN`}</span></div><div class="gac-board-v2-slots">${territory.slots.map((slot) => territory.kind === 'fleet' ? fleetSlotHtml(slot, snapshot) : squadSlotHtml(slot, snapshot, assignments)).join('')}</div></section>`;
}

function attackOrderHtml(snapshot) {
  if (!snapshot.ownerRoster) return `<section class="gac-board-v2-attack-order"><header><div><span>ATTACK ORDER</span><strong>Load your roster to allocate counters</strong></div></header><p class="gac-board-v2-note">Board entry still works without roster data. Attack sequencing stays withheld.</p></section>`;
  const rows = proposedAttackOrder(snapshot.defenses, snapshot.plan || {}, state.reveal);
  const enemyIndex = unitIndex(snapshot, 'opponent');
  const ownerIndex = unitIndex(snapshot, 'owner');
  return `<section class="gac-board-v2-attack-order"><header><div><span>SUGGESTED EXECUTION ORDER</span><strong>${rows.length} revealed squad defense${rows.length===1?'':'s'} in planner</strong></div><small>Unlock constraints first · allocation sequence, not a predicted win guarantee</small></header><div>${rows.map((row) => {
    const leader = unitFor(enemyIndex, row.defense?.leaderBaseId || row.defense?.members?.[0]);
    const counter = (Array.isArray(row.recommendation?.squad) ? row.recommendation.squad : []).map((unit) => ownerIndex.get(normalizeId(unit?.baseId)) || unit);
    const evidence = row.source === 'historical-counter-evidence';
    return `<article class="${counter.length ? (evidence ? 'is-evidence' : 'is-ready') : 'is-blocked'}"><b>${row.order}</b><div><span>${escapeHtml(row.zone.replaceAll('-',' '))} · SLOT ${row.slot+1}</span><strong>${escapeHtml(leader?.name || 'Enemy defense')}</strong><small>${escapeHtml(clean(row.assignment?.allocationReason || (counter.length ? 'Board-wide allocation' : 'No non-overlapping counter allocated')))}</small></div><div class="gac-board-v2-order-counter"><span>${evidence ? 'EVIDENCE' : counter.length ? 'ALLOCATED' : 'BLOCKED'}</span><div>${counter.slice(0,5).map((unit) => portrait(unit,'is-counter')).join('')}</div></div></article>`;
  }).join('') || '<p class="gac-board-v2-note">Enter a revealed squad defense to build the attack sequence.</p>'}</div></section>`;
}

function availabilityHtml(snapshot) {
  if (!snapshot.ownerRoster) return '';
  const model = rosterAvailability(snapshot.ownerRoster, snapshot.plan || {}, snapshot.reservedBaseIds || []);
  const filter = state.availabilityFilter;
  const query = clean(state.availabilityQuery).toLowerCase();
  const visible = model.rows.filter((row) => (filter === 'all' || row.status === filter) && (!query || clean(row.unit?.name).toLowerCase().includes(query) || row.baseId.toLowerCase().includes(query))).slice(0,100);
  const statusLabel = { allocated:'ALLOCATED', reserved:'DEFENSE RESERVED', available:'AVAILABLE' };
  return `<details class="gac-board-v2-availability" open><summary><span>ATTACK ROSTER STATUS</span><strong>${model.counts.available} available · ${model.counts.allocated} allocated · ${model.counts.reserved} on defense</strong></summary><div class="gac-board-v2-availability-tools"><div>${['all','available','allocated','reserved'].map((value) => `<button type="button" class="${filter===value?'active':''}" data-gac-board-v2-filter="${value}">${value === 'all' ? 'ALL' : statusLabel[value]}</button>`).join('')}</div><input data-gac-board-v2-roster-search placeholder="Search your roster…" value="${escapeAttr(state.availabilityQuery)}"></div><div class="gac-board-v2-roster-grid">${visible.map((row) => `<article class="is-${row.status}">${portrait(row.unit)}<div><strong>${escapeHtml(row.unit?.name || row.baseId)}</strong><small>R${n(row.unit?.relic)} · ${number.format(n(row.unit?.power))} GP · ${number.format(n(row.unit?.speed))} spd</small></div><b>${statusLabel[row.status]}</b></article>`).join('') || '<p class="gac-board-v2-note">No units match this filter.</p>'}</div></details>`;
}

function fleetEditorHtml(snapshot) {
  const editor = state.fleetEditor;
  if (!editor) return '';
  const allShips = sourceShips(snapshot).slice().sort((a,b) => n(b.power)-n(a.power) || clean(a.name).localeCompare(clean(b.name)));
  const capitals = allShips.filter(isCapitalShip);
  const normalShips = allShips.filter((unit) => !isCapitalShip(unit));
  const pool = editor.mode === 'capital' ? (capitals.length ? capitals : allShips) : normalShips;
  const selected = new Set([editor.capitalShipBaseId, ...editor.starters, ...editor.reinforcements].map(normalizeId).filter(Boolean));
  const query = clean(editor.query).toLowerCase();
  const results = pool.filter((unit) => !selected.has(normalizeId(unit.baseId)) && (!query || clean(unit.name).toLowerCase().includes(query) || normalizeId(unit.baseId).toLowerCase().includes(query))).slice(0,64);
  const index = new Map(allShips.map((unit) => [normalizeId(unit.baseId), unit]));
  const capital = editor.capitalShipBaseId ? unitFor(index, editor.capitalShipBaseId) : null;
  const selectedRow = (label, ids, type) => `<div class="gac-board-v2-fleet-selected"><span>${label}</span><div>${ids.map((id) => `<button type="button" data-gac-board-v2-fleet-remove="${type}|${escapeAttr(id)}">${portrait(unitFor(index,id))}<b>×</b></button>`).join('') || '<small>None selected</small>'}</div></div>`;
  const complete = Boolean(editor.capitalShipBaseId && editor.starters.length === 3);
  return `<section class="gac-board-v2-fleet-editor"><header><div><span>VISIBLE ENEMY FLEET</span><strong>Fleet Territory · Slot ${editor.slot+1}</strong><small>Enter only ships you can confirm in-game. Fleet observations remain local in this slice.</small></div><button type="button" data-gac-board-v2-fleet-close>Close</button></header><div class="gac-board-v2-fleet-selected"><span>CAPITAL SHIP</span><div>${capital ? `<button type="button" data-gac-board-v2-fleet-remove="capital|${escapeAttr(capital.baseId)}">${portrait(capital)}<b>×</b></button>` : '<small>Choose a capital ship</small>'}</div></div>${selectedRow('STARTING 3',editor.starters,'starter')}${selectedRow('REINFORCEMENTS · OPTIONAL',editor.reinforcements,'reinforcement')}<div class="gac-board-v2-fleet-modes"><button type="button" class="${editor.mode==='capital'?'active':''}" data-gac-board-v2-fleet-mode="capital">Capital</button><button type="button" class="${editor.mode==='starter'?'active':''}" data-gac-board-v2-fleet-mode="starter">Starter</button><button type="button" class="${editor.mode==='reinforcement'?'active':''}" data-gac-board-v2-fleet-mode="reinforcement">Reinforcement</button></div><div class="gac-board-v2-fleet-search"><input data-gac-board-v2-fleet-search placeholder="Search ${editor.mode} ships…" value="${escapeAttr(editor.query)}"><b>${editor.capitalShipBaseId?1:0}+${editor.starters.length}+${editor.reinforcements.length}</b></div><div class="gac-board-v2-fleet-results">${results.map((unit) => `<button type="button" data-gac-board-v2-fleet-add="${escapeAttr(unit.baseId)}">${portrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>${snapshot.opponentRoster?`${number.format(n(unit.power))} GP`:'Static game catalog fallback'}</small></span></button>`).join('') || '<p class="gac-board-v2-note">No matching ships.</p>'}</div><footer><button type="button" data-gac-board-v2-fleet-delete="${editor.slot}" ${fleetAt(editor.slot)?'':'disabled'}>Delete Fleet</button><button type="button" data-gac-board-v2-fleet-save ${complete?'':'disabled'}>Save Local Fleet Observation</button></footer></section>`;
}

function render() {
  const snapshot = boardSnapshot();
  const host = document.querySelector('[data-gac-board-workspace] .gac-visible-board');
  if (!host || !snapshot?.rule) return;
  syncContext(snapshot);
  const existing = host.querySelector('[data-gac-board-v2]');
  if (existing) existing.remove();
  host.classList.add('gac-board-v2-active');
  const assignments = assignmentIndex(snapshot.defenses, snapshot.plan || {});
  const territories = boardTerritories(snapshot.rule, snapshot.defenses, state.fleetDrafts, state.reveal);
  const squadEntered = snapshot.defenses.length;
  const fleetEntered = state.fleetDrafts.length;
  const totalEntered = squadEntered + fleetEntered;
  const visibleCapacity = territories.filter((row) => row.revealed).reduce((sum,row) => sum + row.capacity,0);
  const visibleEntered = territories.filter((row) => row.revealed).reduce((sum,row) => sum + row.entered,0);
  const legacyWarning = snapshot.legacyFleetZoneSquads?.length
    ? `<div class="gac-board-v2-warning"><strong>LEGACY BOARD POSITION NEEDS REVIEW</strong><span>${snapshot.legacyFleetZoneSquads.length} squad observation${snapshot.legacyFleetZoneSquads.length===1?' is':'s are'} stored in Back Top from the older four-squad-zone UI. Board v2 excludes ${snapshot.legacyFleetZoneSquads.length===1?'it':'them'} from squad counter allocation because Back Top is the Fleet Territory.</span></div>`
    : '';
  const section = document.createElement('section');
  section.dataset.gacBoardV2 = 'true';
  section.className = 'gac-board-v2-command';
  section.innerHTML = `<header class="gac-board-v2-head"><div><span>ENEMY BOARD v2</span><strong>Grand Arena Tactical Map</strong><p>Click the exact slot you see in-game. Front territories are visible first; rear territories remain locked until you explicitly mark them revealed.</p></div><div><b>${snapshot.rule.league} · ${snapshot.format}</b><strong>${totalEntered}/${snapshot.rule.totalDefenses}</strong><small>known defenses · ${visibleEntered}/${visibleCapacity} currently revealed capacity entered</small></div></header>${legacyWarning}<div class="gac-board-v2-progress"><i style="--board-v2-progress:${snapshot.rule.totalDefenses?Math.min(100,totalEntered/snapshot.rule.totalDefenses*100):0}%"></i><b>${totalEntered}/${snapshot.rule.totalDefenses} total defenses captured</b><span>${squadEntered}/${snapshot.rule.squadTeams} squads · ${fleetEntered}/${snapshot.rule.fleetTeams} fleets</span></div><div class="gac-board-v2-map">${territories.map((territory) => territoryHtml(territory,snapshot,assignments)).join('')}<div class="gac-board-v2-emblem" aria-hidden="true"><span>GAC</span><b>✦</b></div></div>${fleetEditorHtml(snapshot)}${attackOrderHtml(snapshot)}${availabilityHtml(snapshot)}`;
  const oldZones = host.querySelector('.gac-visible-zones');
  if (oldZones) oldZones.insertAdjacentElement('beforebegin', section);
  else host.append(section);
  window.dispatchEvent(new CustomEvent('gac-board-v2-rendered',{detail:{entered:totalEntered,expected:snapshot.rule.totalDefenses,squads:squadEntered,fleets:fleetEntered}}));
}

function startFleetEditor(slot) {
  const snapshot = boardSnapshot();
  syncContext(snapshot);
  const existing = fleetAt(slot);
  state.fleetEditor = {
    slot: Number(slot),
    capitalShipBaseId: normalizeId(existing?.capitalShipBaseId),
    starters: Array.isArray(existing?.starters) ? [...existing.starters] : [],
    reinforcements: Array.isArray(existing?.reinforcements) ? [...existing.reinforcements] : [],
    mode: existing?.capitalShipBaseId ? (existing?.starters?.length < 3 ? 'starter' : 'reinforcement') : 'capital',
    query: '',
  };
  render();
  document.querySelector('.gac-board-v2-fleet-editor')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function addFleetShip(id) {
  if (!state.fleetEditor) return;
  id = normalizeId(id);
  if (!id) return;
  const editor = state.fleetEditor;
  if (editor.mode === 'capital') {
    editor.capitalShipBaseId = id;
    editor.mode = editor.starters.length < 3 ? 'starter' : 'reinforcement';
  } else if (editor.mode === 'starter') {
    if (editor.starters.length < 3 && !editor.starters.includes(id)) editor.starters.push(id);
    if (editor.starters.length >= 3) editor.mode = 'reinforcement';
  } else if (editor.reinforcements.length < 4 && !editor.reinforcements.includes(id)) editor.reinforcements.push(id);
  editor.query = '';
  render();
}
function removeFleetShip(type,id) {
  if (!state.fleetEditor) return;
  id = normalizeId(id);
  if (type === 'capital') state.fleetEditor.capitalShipBaseId = '';
  if (type === 'starter') state.fleetEditor.starters = state.fleetEditor.starters.filter((value) => normalizeId(value) !== id);
  if (type === 'reinforcement') state.fleetEditor.reinforcements = state.fleetEditor.reinforcements.filter((value) => normalizeId(value) !== id);
  render();
}
function saveFleetEditor() {
  const snapshot = boardSnapshot();
  if (!state.fleetEditor) return;
  const value = {
    id: `fleet-local:BACK-TOP:${state.fleetEditor.slot}`,
    zone: 'BACK-TOP',
    slot: state.fleetEditor.slot,
    capitalShipBaseId: state.fleetEditor.capitalShipBaseId,
    starters: state.fleetEditor.starters,
    reinforcements: state.fleetEditor.reinforcements,
    source: 'user-entered-manual-fleet',
    observedAt: new Date().toISOString(),
    opponentAllyCode: snapshot.opponentCode,
  };
  if (!saveFleetDraft(snapshot,value)) return;
  setReveal(snapshot,'BACK-TOP',true);
  state.fleetEditor = null;
  render();
}

function bind() {
  if (document.documentElement.dataset.gacBoardV2Bound === 'true') return;
  document.documentElement.dataset.gacBoardV2Bound = 'true';
  document.addEventListener('click',(event) => {
    const squad = event.target.closest?.('[data-gac-board-v2-squad-slot]');
    if (squad) {
      const [zone,slot] = clean(squad.dataset.gacBoardV2SquadSlot).split('|');
      openSquadSlot(zone,Number(slot));
      return;
    }
    const reveal = event.target.closest?.('[data-gac-board-v2-reveal]');
    if (reveal) { setReveal(boardSnapshot(),reveal.dataset.gacBoardV2Reveal,true); render(); return; }
    const hide = event.target.closest?.('[data-gac-board-v2-hide]');
    if (hide) { setReveal(boardSnapshot(),hide.dataset.gacBoardV2Hide,false); render(); return; }
    const fleetSlot = event.target.closest?.('[data-gac-board-v2-fleet-slot],[data-gac-board-v2-fleet-edit]');
    if (fleetSlot) { startFleetEditor(Number(fleetSlot.dataset.gacBoardV2FleetSlot ?? fleetSlot.dataset.gacBoardV2FleetEdit)); return; }
    if (event.target.closest?.('[data-gac-board-v2-fleet-close]')) { state.fleetEditor=null; render(); return; }
    const fleetMode = event.target.closest?.('[data-gac-board-v2-fleet-mode]');
    if (fleetMode && state.fleetEditor) { state.fleetEditor.mode=fleetMode.dataset.gacBoardV2FleetMode; state.fleetEditor.query=''; render(); return; }
    const fleetAdd = event.target.closest?.('[data-gac-board-v2-fleet-add]');
    if (fleetAdd) { addFleetShip(fleetAdd.dataset.gacBoardV2FleetAdd); return; }
    const fleetRemove = event.target.closest?.('[data-gac-board-v2-fleet-remove]');
    if (fleetRemove) { const [type,id]=clean(fleetRemove.dataset.gacBoardV2FleetRemove).split('|'); removeFleetShip(type,id); return; }
    if (event.target.closest?.('[data-gac-board-v2-fleet-save]')) { saveFleetEditor(); return; }
    const fleetDelete = event.target.closest?.('[data-gac-board-v2-fleet-delete]');
    if (fleetDelete) { deleteFleetDraft(boardSnapshot(),Number(fleetDelete.dataset.gacBoardV2FleetDelete)); state.fleetEditor=null; render(); return; }
    const filter = event.target.closest?.('[data-gac-board-v2-filter]');
    if (filter) { state.availabilityFilter=filter.dataset.gacBoardV2Filter; render(); return; }
  },true);
  document.addEventListener('input',(event) => {
    if (event.target?.matches?.('[data-gac-board-v2-fleet-search]') && state.fleetEditor) {
      state.fleetEditor.query=event.target.value; const cursor=event.target.selectionStart; render(); const input=document.querySelector('[data-gac-board-v2-fleet-search]'); input?.focus(); if(Number.isInteger(cursor))input?.setSelectionRange?.(cursor,cursor); return;
    }
    if (event.target?.matches?.('[data-gac-board-v2-roster-search]')) {
      state.availabilityQuery=event.target.value; const cursor=event.target.selectionStart; render(); const input=document.querySelector('[data-gac-board-v2-roster-search]'); input?.focus(); if(Number.isInteger(cursor))input?.setSelectionRange?.(cursor,cursor);
    }
  },true);
  window.addEventListener('gac-visible-board-rendered',() => schedule(0));
  window.addEventListener('gac-v2-matchup-loaded',() => schedule(80));
  window.addEventListener('gac-board-evidence-updated',() => schedule(100));
  document.addEventListener('change',(event) => {
    if (event.target?.matches?.('[data-gac-board-league],[data-gac-board-format],[data-gacv2-round],[data-gacv2-opponent],[data-gacv2-mode]') || event.target?.id === 'allyCode') schedule(120);
  },true);
}
function injectStyle() {
  if (document.querySelector('link[data-gac-board-v2-style]')) return;
  const link=document.createElement('link'); link.rel='stylesheet'; link.href='/gac-board-v2-slot-command.css?v=20260821-boardv2'; link.dataset.gacBoardV2Style='true'; document.head.append(link);
}
function schedule(delay=30) { clearTimeout(state.timer); state.timer=setTimeout(render,Math.max(0,delay)); }

if (typeof document !== 'undefined') {
  injectStyle(); bind(); schedule(320); document.addEventListener('DOMContentLoaded',()=>schedule(120),{once:true}); window.addEventListener('hashchange',()=>{state.contextKey='';schedule(150);});
}

export { contextBase, fleetKey, isCapitalShip, revealKey, sourceShips };