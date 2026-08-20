import { hybridBoardPlan } from './gac-hybrid-board-plan.js';
import { boardRule, divisionFromRoster, LEAGUES, leagueFromRoster } from './gac-league-board-rules.js';
import { ZONES, zoneLabel } from './gac-board-position.js';

const state = {
  ownerRoster: null,
  opponentRoster: null,
  opponentLoadKey: '',
  catalog: null,
  leagueOverride: localStorage.getItem('swgoh:gac-manual-board:league') || '',
  serverDefenses: [],
  drafts: [],
  editor: null,
  plan: null,
  planMode: 'none',
  busy: false,
  requestId: 0,
  timer: null,
  mounted: false,
};

const number = new Intl.NumberFormat('en-US');
const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0, 9);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function ownerCode() {
  return allyCode(document.getElementById('allyCode')?.value || window.__swgohAccountAllyCode || window.__swgohPlayerRosterSnapshot?.allyCode);
}
function opponentCode() {
  return allyCode(document.querySelector('[data-gacv2-opponent]')?.value || document.getElementById('gacOpponentCode')?.value);
}
function currentRound() {
  const value = Number(document.querySelector('[data-gacv2-round]')?.value || document.getElementById('gacBracketRound')?.value);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}
function squadSize() {
  return Number(document.querySelector('[data-gac-manual-format]')?.value || document.querySelector('[data-gacv2-mode]')?.value) === 3 ? 3 : 5;
}
function format() { return squadSize() === 3 ? '3v3' : '5v5'; }

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: options.cache || 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function characters(roster = {}) {
  return (Array.isArray(roster?.units) ? roster.units : []).filter((unit) => String(unit?.unitType || '').toLowerCase() !== 'ship');
}
function unitImage(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function unitPortrait(unit = {}, tiny = false) {
  const name = clean(unit.name || unit.baseId || 'Unknown');
  const src = unitImage(unit);
  return `<span class="gac-manual-unit ${tiny ? 'is-tiny' : ''}" data-inspect-base-id="${escapeAttr(unit.baseId || '')}" title="${escapeAttr(name)}">${src ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}

function selectedLeague() {
  return state.leagueOverride || leagueFromRoster(state.ownerRoster) || 'Carbonite';
}
function currentRule() { return boardRule(selectedLeague(), format()); }
function currentDivision() { return divisionFromRoster(state.ownerRoster); }

function draftKey(code = opponentCode()) {
  const owner = ownerCode() || 'anonymous';
  const round = currentRound() || 0;
  return `swgoh:gac-manual-board:v1:${owner}:${code || 'manual'}:${round}:${format()}`;
}
function readDrafts(code = opponentCode()) {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey(code)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function writeDrafts() {
  localStorage.setItem(draftKey(), JSON.stringify(state.drafts));
}
function migrateManualDrafts() {
  const code = opponentCode();
  if (!code || readDrafts(code).length) return;
  const manual = readDrafts('');
  if (!manual.length) return;
  state.drafts = manual.map((row) => ({...row, opponentAllyCode: code}));
  writeDrafts();
  localStorage.removeItem(draftKey(''));
}

function defenseKey(defense = {}) {
  const zone = clean(defense.zone).toUpperCase();
  const slot = defense.slot == null ? '' : Number(defense.slot);
  return `${zone}|${slot}`;
}
function mergedDefenses() {
  const merged = new Map();
  for (const row of state.drafts) merged.set(defenseKey(row), {...row, storage:'draft'});
  for (const row of state.serverDefenses) merged.set(defenseKey(row), {...row, storage:'server'});
  return [...merged.values()].sort((a,b) => clean(a.zone).localeCompare(clean(b.zone)) || n(a.slot)-n(b.slot));
}
function zoneDefenses(zone) { return mergedDefenses().filter((row) => clean(row.zone).toUpperCase() === zone); }
function nextSlot(zone) {
  const used = new Set(zoneDefenses(zone).map((row) => Number(row.slot)).filter((value) => Number.isInteger(value) && value >= 0));
  for (let slot = 0; slot < 100; slot += 1) if (!used.has(slot)) return slot;
  return 0;
}

function rosterIndex() {
  const source = characters(state.opponentRoster).length ? characters(state.opponentRoster) : characters({units: state.catalog?.units || []});
  return new Map(source.map((unit) => [normalizeId(unit.baseId), unit]).filter(([id]) => Boolean(id)));
}
function resolveDefenseUnits(defense) {
  const index = rosterIndex();
  return (Array.isArray(defense?.members) ? defense.members : []).map((id) => index.get(normalizeId(id)) || {baseId:normalizeId(id),name:normalizeId(id)});
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson('/data/catalog.json?gac-manual-board=1', {cache:'force-cache'});
  state.catalog = body || {units:[]};
  return state.catalog;
}
async function loadOwnerRoster(force = false) {
  const owner = ownerCode();
  if (!/^\d{9}$/.test(owner)) return null;
  if (!force && state.ownerRoster && allyCode(state.ownerRoster?.player?.allyCode) === owner) return state.ownerRoster;
  try {
    state.ownerRoster = await fetchJson(`/api/player/${owner}`);
    return state.ownerRoster;
  } catch { return state.ownerRoster; }
}
async function loadOpponentRoster(force = false) {
  const code = opponentCode();
  if (!/^\d{9}$/.test(code)) {
    state.opponentRoster = null;
    state.opponentLoadKey = '';
    return null;
  }
  if (!force && state.opponentLoadKey === code && state.opponentRoster) return state.opponentRoster;
  try {
    const body = await fetchJson(`/api/player/${code}`);
    state.opponentRoster = body;
    state.opponentLoadKey = code;
    return body;
  } catch {
    state.opponentRoster = null;
    state.opponentLoadKey = code;
    return null;
  }
}

async function loadServerBoard() {
  const owner = ownerCode();
  const opponent = opponentCode();
  const round = currentRound();
  if (!/^\d{9}$/.test(owner) || !/^\d{9}$/.test(opponent) || !round) {
    state.serverDefenses = [];
    return [];
  }
  try {
    const body = await fetchJson(`/api/gac/current-board/${owner}/defense?round=${round}`);
    if (allyCode(body?.opponent?.allyCode) !== opponent) {
      state.serverDefenses = [];
      return [];
    }
    state.serverDefenses = Array.isArray(body?.defenses) ? body.defenses : [];
    const serverKeys = new Set(state.serverDefenses.map(defenseKey));
    if (serverKeys.size) {
      state.drafts = state.drafts.filter((row) => !serverKeys.has(defenseKey(row)));
      writeDrafts();
    }
    return state.serverDefenses;
  } catch {
    state.serverDefenses = [];
    return [];
  }
}

async function reservedOwnDefenseIds() {
  const owner = ownerCode();
  const round = currentRound();
  if (!/^\d{9}$/.test(owner) || !round) return [];
  try {
    const body = await fetchJson(`/api/gac/current-board/${owner}/my-defense?round=${round}`);
    return [...new Set((Array.isArray(body?.defenses) ? body.defenses : []).flatMap((row) => Array.isArray(row?.members) ? row.members : []).map(normalizeId).filter(Boolean))];
  } catch { return []; }
}

function evidenceMap(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : []).map((row) => [normalizeId(row?.enemyLeaderBaseId), row]).filter(([id]) => Boolean(id)));
}
async function loadEvidence(defenses = []) {
  const leaders = [...new Set(defenses.map((row) => normalizeId(row?.leaderBaseId || row?.members?.[0])).filter(Boolean))];
  if (!leaders.length) return new Map();
  try {
    const body = await fetchJson(`/api/gac/counters/batch?format=${format()}&leaders=${encodeURIComponent(leaders.join(','))}&limit=60`);
    return evidenceMap(body);
  } catch { return new Map(); }
}

function fallbackOpponentBody(defenses) {
  const index = rosterIndex();
  const ids = [...new Set(defenses.flatMap((row) => Array.isArray(row.members) ? row.members : []).map(normalizeId).filter(Boolean))];
  return {source:'static-catalog-identity-only', player:{allyCode:opponentCode(),name:'Manual opponent board'}, units:ids.map((id)=>index.get(id)||{baseId:id,name:id,unitType:'Character'})};
}

async function buildSmartPlan() {
  const defenses = mergedDefenses().filter((row) => Array.isArray(row.members) && row.members.length === squadSize());
  if (!state.ownerRoster || !defenses.length) {
    state.plan = null;
    state.planMode = 'none';
    return null;
  }
  const opponentBody = state.opponentRoster || fallbackOpponentBody(defenses);
  const evidence = await loadEvidence(defenses);
  const excludeBaseIds = await reservedOwnDefenseIds();
  const entries = defenses.map((defense,index) => ({
    defenseId: Number.isInteger(Number(defense.id)) && Number(defense.id) > 0 ? Number(defense.id) : 900000 + index,
    defense,
    sourceDefenseIndex:index,
  }));
  state.plan = hybridBoardPlan(state.ownerRoster, opponentBody, entries, evidence, {size:squadSize(),excludeBaseIds});
  state.planMode = state.opponentRoster ? 'full-roster' : 'identity-only';
  return state.plan;
}

function assignmentFor(defense) {
  if (!state.plan?.assignments?.length) return null;
  const defenses = mergedDefenses().filter((row) => Array.isArray(row.members) && row.members.length === squadSize());
  const index = defenses.findIndex((row) => defenseKey(row) === defenseKey(defense));
  return index >= 0 ? state.plan.assignments.find((row) => Number(row.sourceIndex) === index) || state.plan.assignments[index] || null : null;
}

function planCounterHtml(defense) {
  const assignment = assignmentFor(defense);
  const recommendation = assignment?.recommendation;
  if (!recommendation?.squad?.length) return `<div class="gac-manual-counter is-empty"><strong>SMART COUNTER</strong><span>No non-overlapping counter allocated yet.</span></div>`;
  const source = assignment.source === 'historical-counter-evidence' ? 'HISTORICAL EVIDENCE' : state.planMode === 'identity-only' ? 'IDENTITY-ONLY HEURISTIC' : 'ROSTER-FIT HEURISTIC';
  const observed = assignment.source === 'historical-counter-evidence' && Number(recommendation.battles) > 0
    ? ` · ${number.format(Number(recommendation.wins || 0))}/${number.format(Number(recommendation.battles || 0))} observed wins`
    : '';
  return `<div class="gac-manual-counter ${assignment.source === 'historical-counter-evidence' ? 'is-evidence' : ''}"><div><strong>${escapeHtml(source)}</strong><span>${escapeHtml(assignment.allocationReason || recommendation.confidence || 'Board-wide allocation')}${escapeHtml(observed)}</span></div><div class="gac-manual-counter-units">${recommendation.squad.map((unit)=>unitPortrait(unit,true)).join('')}</div></div>`;
}

function boardSourceLabel() {
  if (state.opponentRoster) return 'PUBLIC OPPONENT ROSTER + MANUAL BOARD';
  if (opponentCode()) return 'STATIC UNIT CATALOG FALLBACK · OPPONENT ROSTER UNAVAILABLE';
  return 'STATIC UNIT CATALOG FALLBACK · NO OPPONENT ALLY CODE';
}

function editorSourceUnits() {
  const roster = characters(state.opponentRoster);
  if (roster.length) return roster.slice().sort((a,b)=>n(b.power)-n(a.power) || clean(a.name).localeCompare(clean(b.name)));
  return characters({units:state.catalog?.units || []}).slice().sort((a,b)=>clean(a.name).localeCompare(clean(b.name)));
}

function editorUnit(id) {
  const index = rosterIndex();
  return index.get(normalizeId(id)) || {baseId:normalizeId(id),name:normalizeId(id)};
}

function editorMarkup() {
  if (!state.editor) return `<div class="gac-manual-editor-empty"><strong>Select a territory slot</strong><span>Choose “Enter Defense” on the position you are looking at in-game.</span></div>`;
  const size = squadSize();
  const selected = state.editor.members.map(editorUnit);
  const query = clean(state.editor.query).toLowerCase();
  const results = editorSourceUnits().filter((unit) => !state.editor.members.includes(normalizeId(unit.baseId)) && (!query || clean(unit.name).toLowerCase().includes(query) || normalizeId(unit.baseId).toLowerCase().includes(query))).slice(0,70);
  const slots = Array.from({length:size},(_,index)=>{
    const unit = selected[index];
    if (!unit) return `<div class="gac-manual-selected-slot is-empty"><span>${index===0?'LEADER':'UNIT '+(index+1)}</span><b>+</b></div>`;
    const leader = normalizeId(unit.baseId) === normalizeId(state.editor.leaderBaseId);
    return `<button type="button" class="gac-manual-selected-slot ${leader?'is-leader':''}" data-gac-manual-selected="${escapeAttr(unit.baseId)}"><span>${leader?'LEADER':'UNIT '+(index+1)}</span>${unitPortrait(unit,true)}<small>${leader?'Leader selected':'Click to make leader / remove'}</small></button>`;
  }).join('');
  return `<div class="gac-manual-editor">
    <div class="gac-manual-editor-head"><div><span>ENTER VISIBLE DEFENSE</span><strong>${escapeHtml(zoneLabel(state.editor.zone))} · Slot ${Number(state.editor.slot)+1}</strong><small>${size} characters required · first selected becomes leader until changed</small></div><button type="button" data-gac-manual-close>Close</button></div>
    <div class="gac-manual-selected">${slots}</div>
    <div class="gac-manual-searchbar"><input data-gac-manual-search placeholder="Search ${state.opponentRoster?'opponent roster':'all SWGOH characters'}…" value="${escapeAttr(state.editor.query||'')}"><span>${state.editor.members.length}/${size}</span></div>
    <div class="gac-manual-unit-results">${results.map((unit)=>`<button type="button" data-gac-manual-add="${escapeAttr(unit.baseId)}">${unitPortrait(unit,true)}<span><strong>${escapeHtml(unit.name)}</strong><small>${state.opponentRoster?`R${n(unit.relic)} · ${number.format(n(unit.power))} GP · ${number.format(n(unit.speed))} spd`:'Static game catalog'}</small></span></button>`).join('') || `<div class="gac-manual-no-results">No matching available characters.</div>`}</div>
    <div class="gac-manual-editor-actions"><label>Datacron truth<select data-gac-manual-dc><option value="unknown" ${state.editor.datacronState==='unknown'?'selected':''}>Not confirmed</option><option value="none" ${state.editor.datacronState==='none'?'selected':''}>Confirmed none</option></select></label><button type="button" data-gac-manual-save ${state.editor.members.length===size && state.editor.members.includes(state.editor.leaderBaseId)?'':'disabled'}>${state.busy?'Saving…':'Save Defense to This Slot'}</button></div>
    <p class="gac-manual-editor-note">If the opponent/round is verified, this saves to the canonical current-board store. Otherwise it remains a local manual draft and still feeds the counter planner.</p>
  </div>`;
}

function defenseTile(defense) {
  const units = resolveDefenseUnits(defense);
  const source = defense.storage === 'server' ? 'VERIFIED SAVED' : 'LOCAL DRAFT';
  return `<article class="gac-manual-defense" data-gac-manual-defense="${escapeAttr(defenseKey(defense))}">
    <header><div><span>SLOT ${Number(defense.slot)+1}</span><strong>${escapeHtml(units[0]?.name || defense.leaderBaseId || 'Defense')}</strong></div><b class="${defense.storage==='server'?'is-server':''}">${source}</b></header>
    <div class="gac-manual-defense-units">${units.map((unit)=>unitPortrait(unit,true)).join('')}</div>
    ${planCounterHtml(defense)}
    <footer><button type="button" data-gac-manual-edit="${escapeAttr(defenseKey(defense))}">Edit</button><button type="button" data-gac-manual-delete="${escapeAttr(defenseKey(defense))}">Delete</button></footer>
  </article>`;
}

function zoneCard(entry) {
  const defenses = zoneDefenses(entry.value);
  return `<section class="gac-manual-zone" data-gac-manual-zone="${escapeAttr(entry.value)}"><header><div><span>${escapeHtml(entry.label.toUpperCase())}</span><strong>${defenses.length} observed defense${defenses.length===1?'':'s'}</strong></div><button type="button" data-gac-manual-add-zone="${escapeAttr(entry.value)}">+ Enter Defense</button></header><div class="gac-manual-zone-list">${defenses.map(defenseTile).join('') || `<div class="gac-manual-zone-empty">No squad entered here yet.</div>`}</div></section>`;
}

function render() {
  const root = document.querySelector('[data-gac-manual-board]');
  if (!root) return;
  const rule = currentRule();
  const observed = mergedDefenses().length;
  const division = currentDivision();
  root.innerHTML = `<section class="gac-manual-command">
    <div class="gac-manual-command-head"><div><span>MANUAL CURRENT-BOARD INPUT</span><strong>Rebuild exactly what you see in Grand Arena</strong><p>Enter each visible enemy squad by territory and slot. Command Center then allocates counters from your remaining roster without reusing attackers.</p></div><div class="gac-manual-source"><b>${escapeHtml(boardSourceLabel())}</b><small>${state.opponentRoster?'Exact opponent relic/speed/ability data can be compared.':'Lineup identity can still drive sourced counter evidence; opponent relic/speed comparison remains unavailable.'}</small></div></div>
    <div class="gac-manual-config">
      <label>League<select data-gac-manual-league>${LEAGUES.map((league)=>`<option value="${league}" ${league===selectedLeague()?'selected':''}>${league}</option>`).join('')}</select></label>
      <label>Format<select data-gac-manual-format><option value="5" ${squadSize()===5?'selected':''}>5v5</option><option value="3" ${squadSize()===3?'selected':''}>3v3</option></select></label>
      <div><span>EXPECTED SQUADS</span><strong>${rule.squadTeams}</strong><small>${observed} currently observed</small></div>
      <div><span>EXPECTED FLEETS</span><strong>${rule.fleetTeams}</strong><small>Fleet board input is separate</small></div>
      <div><span>LEAGUE STATUS</span><strong>${escapeHtml(rule.league)}${division?` ${division}`:''}</strong><small>${state.leagueOverride?'Manual override':'Auto from your roster when available'}</small></div>
      <button type="button" data-gac-manual-sync>${state.busy?'Working…':'Confirm Opponent + Sync Drafts'}</button>
    </div>
    <div class="gac-manual-progress"><span style="--progress:${Math.min(100,rule.squadTeams?observed/rule.squadTeams*100:0)}%"></span><b>${observed}/${rule.squadTeams} squad defenses entered</b><small>You can enter only currently revealed territories and continue as the back wall unlocks.</small></div>
    <div class="gac-manual-zones">${ZONES.map(zoneCard).join('')}</div>
    <div data-gac-manual-editor-host>${editorMarkup()}</div>
    <details class="gac-manual-quick-test" data-gac-manual-quick><summary>Quick single-squad sandbox</summary><div data-gac-manual-legacy-host></div></details>
  </section>`;
  moveLegacyQuickSelector();
}

function moveLegacyQuickSelector() {
  const panel = document.querySelector('[data-gacv2-panel="board"]');
  const host = document.querySelector('[data-gac-manual-legacy-host]');
  if (!panel || !host) return;
  for (const node of [...panel.children]) {
    if (node.matches?.('[data-gac-manual-board]')) continue;
    if (node.closest?.('[data-gac-manual-board]')) continue;
    host.appendChild(node);
  }
}

function startEditor(zone, defense = null) {
  const row = defense || null;
  state.editor = {
    zone,
    slot: row?.slot == null ? nextSlot(zone) : Number(row.slot),
    members: Array.isArray(row?.members) ? row.members.map(normalizeId).filter(Boolean) : [],
    leaderBaseId: normalizeId(row?.leaderBaseId),
    datacronState: clean(row?.datacronState).toLowerCase() === 'none' ? 'none' : 'unknown',
    query: '',
    existingKey: row ? defenseKey(row) : '',
  };
  if (!state.editor.leaderBaseId && state.editor.members.length) state.editor.leaderBaseId = state.editor.members[0];
  render();
  document.querySelector('[data-gac-manual-editor-host]')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}

function addEditorUnit(baseId) {
  if (!state.editor || state.editor.members.length >= squadSize()) return;
  const id = normalizeId(baseId);
  if (!id || state.editor.members.includes(id)) return;
  state.editor.members.push(id);
  if (!state.editor.leaderBaseId) state.editor.leaderBaseId = id;
  state.editor.query = '';
  render();
}
function selectedEditorUnit(baseId) {
  if (!state.editor) return;
  const id = normalizeId(baseId);
  if (state.editor.leaderBaseId !== id) {
    state.editor.leaderBaseId = id;
  } else {
    state.editor.members = state.editor.members.filter((value)=>value!==id);
    state.editor.leaderBaseId = state.editor.members[0] || '';
  }
  render();
}

function localDefenseFromEditor() {
  if (!state.editor) return null;
  return {
    id:`local:${state.editor.zone}:${state.editor.slot}`,
    leaderBaseId:state.editor.leaderBaseId,
    members:[...state.editor.members],
    zone:state.editor.zone,
    slot:Number(state.editor.slot),
    datacron:null,
    datacronState:state.editor.datacronState,
    source:'user-entered-manual-board',
    observedAt:new Date().toISOString(),
    opponentAllyCode:opponentCode(),
  };
}
function saveDraft(defense) {
  const key = defenseKey(defense);
  state.drafts = state.drafts.filter((row)=>defenseKey(row)!==key);
  state.drafts.push(defense);
  writeDrafts();
}

async function persistDefense(defense) {
  const owner = ownerCode();
  const opponent = opponentCode();
  const round = currentRound();
  if (!/^\d{9}$/.test(owner) || !/^\d{9}$/.test(opponent) || !round) return null;
  return fetchJson(`/api/gac/current-board/${owner}/defense`, {
    method:'POST',
    body:JSON.stringify({
      opponentAllyCode:opponent,
      round,
      size:squadSize(),
      leaderBaseId:defense.leaderBaseId,
      members:defense.members,
      datacronId:'',
      datacronState:defense.datacronState || 'unknown',
      zone:defense.zone,
      slot:defense.slot,
      sourceRef:'gac-manual-board-builder',
    }),
  });
}

async function saveEditor() {
  if (!state.editor || state.editor.members.length !== squadSize() || !state.editor.members.includes(state.editor.leaderBaseId)) return;
  const defense = localDefenseFromEditor();
  state.busy = true;
  render();
  let persisted = false;
  try {
    const result = await persistDefense(defense);
    if (result?.saved) {
      persisted = true;
      state.drafts = state.drafts.filter((row)=>defenseKey(row)!==defenseKey(defense));
      writeDrafts();
      await loadServerBoard();
      window.dispatchEvent(new CustomEvent('gac-board-evidence-updated',{detail:{owner:'opponent',action:'saved',round:currentRound()}}));
    }
  } catch (error) {
    if (![401,409].includes(Number(error?.status))) console.warn('Manual GAC defense persistence unavailable',error);
  }
  if (!persisted) saveDraft(defense);
  state.editor = null;
  state.busy = false;
  await buildSmartPlan();
  render();
}

async function deleteDefenseByKey(key) {
  const defense = mergedDefenses().find((row)=>defenseKey(row)===key);
  if (!defense) return;
  if (defense.storage === 'server' && Number.isInteger(Number(defense.id)) && currentRound()) {
    try {
      await fetchJson(`/api/gac/current-board/${ownerCode()}/defense`, {method:'DELETE',body:JSON.stringify({id:Number(defense.id),round:currentRound()})});
      await loadServerBoard();
      window.dispatchEvent(new CustomEvent('gac-board-evidence-updated',{detail:{owner:'opponent',action:'deleted',round:currentRound()}}));
    } catch (error) {
      console.warn('Saved GAC defense could not be deleted',error);
      return;
    }
  } else {
    state.drafts = state.drafts.filter((row)=>defenseKey(row)!==key);
    writeDrafts();
  }
  await buildSmartPlan();
  render();
}

async function confirmAndSync() {
  const owner = ownerCode();
  const opponent = opponentCode();
  const round = currentRound();
  if (!/^\d{9}$/.test(owner) || !/^\d{9}$/.test(opponent) || !round) {
    const status = document.querySelector('[data-gacv2-status]');
    if (status) status.innerHTML = '<strong>Manual board can stay local</strong><span>Enter opponent Ally Code and select Round 1/2/3 to confirm and sync it.</span>';
    return;
  }
  state.busy = true; render();
  try {
    await fetchJson(`/api/gac/current-opponent/${owner}/confirm`, {method:'POST',body:JSON.stringify({opponentAllyCode:opponent,round})});
    const pending = [...state.drafts];
    for (const defense of pending) {
      try {
        const result = await persistDefense(defense);
        if (result?.saved) state.drafts = state.drafts.filter((row)=>defenseKey(row)!==defenseKey(defense));
      } catch (error) {
        console.warn('Manual board draft sync failed',defenseKey(defense),error);
      }
    }
    writeDrafts();
    await Promise.all([loadOpponentRoster(true),loadServerBoard()]);
    window.dispatchEvent(new CustomEvent('gac-current-opponent-manually-confirmed',{detail:{ownerAllyCode:owner,opponentAllyCode:opponent,round}}));
    window.dispatchEvent(new CustomEvent('gac-board-evidence-updated',{detail:{owner:'opponent',action:'updated',round}}));
  } catch (error) {
    console.warn('Opponent confirmation/sync unavailable',error);
  } finally {
    state.busy = false;
    await buildSmartPlan();
    render();
  }
}

async function refresh({force=false}={}) {
  const requestId = ++state.requestId;
  await loadCatalog().catch(()=>({units:[]}));
  await Promise.all([loadOwnerRoster(force),loadOpponentRoster(force)]);
  if (requestId !== state.requestId) return;
  migrateManualDrafts();
  state.drafts = readDrafts();
  await loadServerBoard();
  if (requestId !== state.requestId) return;
  await buildSmartPlan();
  render();
}

function mount() {
  if (document.querySelector('[data-gac-manual-board]')) return true;
  const panel = document.querySelector('[data-gacv2-panel="board"]');
  if (!panel) return false;
  const host = document.createElement('div');
  host.dataset.gacManualBoard = 'true';
  panel.prepend(host);
  state.mounted = true;
  render();
  return true;
}

function bind() {
  if (document.documentElement.dataset.gacManualBoardBound === 'true') return;
  document.documentElement.dataset.gacManualBoardBound = 'true';
  document.addEventListener('click',(event)=>{
    const add = event.target.closest?.('[data-gac-manual-add-zone]');
    if (add) { startEditor(add.dataset.gacManualAddZone); return; }
    const addUnit = event.target.closest?.('[data-gac-manual-add]');
    if (addUnit) { addEditorUnit(addUnit.dataset.gacManualAdd); return; }
    const selected = event.target.closest?.('[data-gac-manual-selected]');
    if (selected) { selectedEditorUnit(selected.dataset.gacManualSelected); return; }
    const edit = event.target.closest?.('[data-gac-manual-edit]');
    if (edit) { const defense=mergedDefenses().find((row)=>defenseKey(row)===edit.dataset.gacManualEdit); if(defense)startEditor(defense.zone,defense); return; }
    const remove = event.target.closest?.('[data-gac-manual-delete]');
    if (remove) { void deleteDefenseByKey(remove.dataset.gacManualDelete); return; }
    if (event.target.closest?.('[data-gac-manual-close]')) { state.editor=null; render(); return; }
    if (event.target.closest?.('[data-gac-manual-save]')) { void saveEditor(); return; }
    if (event.target.closest?.('[data-gac-manual-sync]')) { void confirmAndSync(); return; }
  },true);
  document.addEventListener('input',(event)=>{
    if (event.target?.matches?.('[data-gac-manual-search]') && state.editor) {
      state.editor.query = event.target.value;
      const selection = event.target.selectionStart;
      render();
      const input = document.querySelector('[data-gac-manual-search]');
      input?.focus();
      if (Number.isInteger(selection)) input?.setSelectionRange?.(selection,selection);
    }
  },true);
  document.addEventListener('change',(event)=>{
    if (event.target?.matches?.('[data-gac-manual-league]')) {
      state.leagueOverride = clean(event.target.value);
      localStorage.setItem('swgoh:gac-manual-board:league',state.leagueOverride);
      render();
      return;
    }
    if (event.target?.matches?.('[data-gac-manual-format]')) {
      const mode = document.querySelector('[data-gacv2-mode]');
      if (mode) { mode.value = Number(event.target.value)===3?'3':'5'; mode.dispatchEvent(new Event('change',{bubbles:true})); }
      state.editor=null; state.drafts=readDrafts(); void refresh({force:false}); return;
    }
    if (event.target?.matches?.('[data-gac-manual-dc]') && state.editor) { state.editor.datacronState=event.target.value==='none'?'none':'unknown'; }
    if (event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode]') || ['allyCode'].includes(event.target?.id)) schedule(180,true);
  },true);
  window.addEventListener('gac-current-opponent-manually-confirmed',()=>schedule(100,true));
  window.addEventListener('gac-board-evidence-updated',()=>schedule(120,true));
  window.addEventListener('gac-v2-matchup-loaded',()=>schedule(80,true));
}

function schedule(delay=120,force=false) {
  clearTimeout(state.timer);
  state.timer=setTimeout(()=>{ if(mount()) void refresh({force}); },Math.max(0,delay));
}

function injectStyle() {
  if (document.querySelector('link[data-gac-manual-board-style]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet'; link.href='/gac-manual-board-builder.css?v=20260821-b07'; link.dataset.gacManualBoardStyle='true'; document.head.appendChild(link);
}

if (typeof document !== 'undefined') {
  injectStyle(); bind(); schedule(260,true);
  document.addEventListener('DOMContentLoaded',()=>schedule(120,true),{once:true});
  window.addEventListener('hashchange',()=>schedule(160,true));
  new MutationObserver(()=>{ if(!state.mounted || !document.querySelector('[data-gac-manual-board]')) schedule(80,false); }).observe(document.documentElement,{childList:true,subtree:true});
}

export { currentRule, defenseKey, mergedDefenses, nextSlot, selectedLeague };
