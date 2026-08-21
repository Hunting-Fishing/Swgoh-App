import {
  SQUAD_ZONES,
  evidenceMapFromBatch,
  normalizeAllyCode,
  normalizeBaseId,
  normalizeFormat,
  normalizePlannerState,
  planManualBoard,
  plannerStorageKey,
  resolveDefenseUnits,
  rosterCharacters,
  squadSize,
  teamStats,
} from './gac-manual-counter-planner-model.js';

const state = {
  ownRoster: null,
  opponentRoster: null,
  opponentCode: localStorage.getItem('swgoh:gac-manual-counter:last-opponent') || '',
  format: normalizeFormat(localStorage.getItem('swgoh:gac-manual-counter:format') || '5v5'),
  reservedBaseIds: new Set(),
  defenses: [],
  evidenceByLeader: new Map(),
  enemyEditor: null,
  ownQuery: '',
  loading: false,
  error: '',
  legacyVisible: false,
  evidenceTimer: null,
};

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const number = new Intl.NumberFormat('en-US');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;

function ownerCode() {
  return normalizeAllyCode(
    document.getElementById('allyCode')?.value ||
    window.__swgohAccountAllyCode ||
    window.__swgohPlayerRosterSnapshot?.allyCode ||
    window.__swgohLiveSnapshot?.allyCode
  );
}

function formatAllyCode(value) {
  return normalizeAllyCode(value).replace(/(\d{3})(?=\d)/g, '$1-');
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache: options.cache || 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

async function fetchRoster(code) {
  const ally = normalizeAllyCode(code);
  if (!ally) throw new Error('A valid 9-digit Ally Code is required.');
  const body = await fetchJson(`/api/player/${ally}`);
  if (!body?.player || !Array.isArray(body?.units)) throw new Error(`No usable roster was returned for ${formatAllyCode(ally)}.`);
  return body;
}

function unitImage(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}

function portrait(unit = {}, cls = '') {
  const id = normalizeBaseId(unit?.baseId);
  const name = clean(unit?.name || id || 'Unknown');
  const image = unitImage(unit);
  return `<span class="gac-manual-unit ${escapeAttr(cls)}" ${id ? `data-inspect-base-id="${escapeAttr(id)}"` : ''} title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(name.slice(0, 2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}

function statValue(unit = {}, keys = []) {
  const sources = [unit, unit?.stats, unit?.calculatedStats, unit?.stat];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      const value = Number(source?.[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

function aggregateOptionalStat(units = [], keys = []) {
  const values = units.map((unit) => statValue(unit, keys));
  if (!values.length || values.some((value) => value === null)) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function signed(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const parsed = Number(value);
  return `${parsed > 0 ? '+' : ''}${number.format(Math.round(parsed))}`;
}

function currentStorageKey() {
  return plannerStorageKey({ ownerAllyCode: ownerCode(), opponentAllyCode: state.opponentCode, format: state.format });
}

function loadPairingState() {
  let value = {};
  try { value = JSON.parse(localStorage.getItem(currentStorageKey()) || '{}'); } catch { value = {}; }
  const normalized = normalizePlannerState(value, state.format);
  state.reservedBaseIds = new Set(normalized.reservedBaseIds);
  state.defenses = normalized.defenses.map((row) => ({ ...row, members: [...row.members] }));
  state.enemyEditor = null;
  state.evidenceByLeader = new Map();
}

function persistPairingState() {
  if (!normalizeAllyCode(state.opponentCode)) return;
  localStorage.setItem(currentStorageKey(), JSON.stringify({
    format: state.format,
    reservedBaseIds: [...state.reservedBaseIds],
    defenses: state.defenses,
  }));
}

function ownRosterRows() {
  const query = clean(state.ownQuery).toLowerCase();
  return rosterCharacters(state.ownRoster)
    .filter((unit) => !query || clean(unit?.name).toLowerCase().includes(query) || normalizeBaseId(unit?.baseId).toLowerCase().includes(query))
    .slice(0, 96);
}

function opponentRows(query = '') {
  const needle = clean(query).toLowerCase();
  return rosterCharacters(state.opponentRoster)
    .filter((unit) => !needle || clean(unit?.name).toLowerCase().includes(needle) || normalizeBaseId(unit?.baseId).toLowerCase().includes(needle))
    .slice(0, 96);
}

function rosterIndex(body = {}) {
  return new Map(rosterCharacters(body).map((unit) => [normalizeBaseId(unit?.baseId), unit]).filter(([id]) => Boolean(id)));
}

function rosterCapability(body = {}, key) {
  if (body?.capabilities && Object.prototype.hasOwnProperty.call(body.capabilities, key)) return body.capabilities[key] === true;
  return true;
}

function rosterSource(body = {}) {
  const source = clean(body?.source || body?.sourceDetail || 'roster');
  return source || 'roster';
}

function summaryMarkup() {
  const owner = state.ownRoster?.player || {};
  const enemy = state.opponentRoster?.player || {};
  const ownChars = rosterCharacters(state.ownRoster).length;
  const enemyChars = rosterCharacters(state.opponentRoster).length;
  const remaining = Math.max(0, ownChars - state.reservedBaseIds.size);
  if (!state.opponentRoster) {
    return `<div class="gac-manual-empty"><strong>1 · Load the opponent</strong><span>Enter the opponent's Ally Code. Command Center will load that public roster only; the GAC board itself remains manual.</span></div>`;
  }
  return `<div class="gac-manual-versus">
    <article><span>YOUR LIVE ROSTER</span><strong>${escapeHtml(owner.name || formatAllyCode(ownerCode()))}</strong><small>${number.format(n(owner.galacticPower))} GP · ${ownChars} chars · ${state.reservedBaseIds.size} marked defense · ${remaining} remaining</small></article>
    <b>VS</b>
    <article class="enemy"><span>OPPONENT ALLY CODE</span><strong>${escapeHtml(enemy.name || formatAllyCode(state.opponentCode))}</strong><small>${number.format(n(enemy.galacticPower))} GP · ${enemyChars} chars · ${escapeHtml(rosterSource(state.opponentRoster))}</small></article>
  </div>`;
}

function setupMarkup() {
  return `<section class="gac-manual-setup">
    <div class="gac-manual-step"><b>1</b><div><span>OPPONENT ALLY CODE</span><strong>Load roster + mods/stats</strong></div></div>
    <input data-gac-manual-opponent inputmode="numeric" maxlength="11" placeholder="123-456-789" value="${escapeAttr(state.opponentCode ? formatAllyCode(state.opponentCode) : '')}">
    <select data-gac-manual-format><option value="5v5" ${state.format === '5v5' ? 'selected' : ''}>5v5</option><option value="3v3" ${state.format === '3v3' ? 'selected' : ''}>3v3</option></select>
    <button type="button" data-gac-manual-load ${state.loading ? 'disabled' : ''}>${state.loading ? 'LOADING…' : 'LOAD OPPONENT ROSTER'}</button>
  </section>`;
}

function ownDefenseMarkup() {
  if (!state.ownRoster) return `<section class="gac-manual-block"><header><div><span>2 · YOUR DEFENSE / UNAVAILABLE</span><strong>Your roster is still loading</strong></div></header></section>`;
  const index = rosterIndex(state.ownRoster);
  const reserved = [...state.reservedBaseIds].map((id) => index.get(id)).filter(Boolean);
  const rows = ownRosterRows();
  return `<section class="gac-manual-block gac-manual-own-defense">
    <header><div><span>2 · YOUR DEFENSE / UNAVAILABLE</span><strong>Mark every character you placed on defense</strong><small>These characters are removed from all offense counters. This is local manual GAC state; no bracket API is required.</small></div><div class="gac-manual-count"><b>${reserved.length}</b><small>RESERVED</small></div></header>
    <div class="gac-manual-reserved">${reserved.length ? reserved.map((unit) => `<button type="button" data-gac-manual-own-toggle="${escapeAttr(unit.baseId)}" class="is-reserved">${portrait(unit)}<span>ON DEFENSE ×</span></button>`).join('') : '<p>No units marked on defense yet.</p>'}</div>
    <div class="gac-manual-search"><input data-gac-manual-own-search placeholder="Search your roster…" value="${escapeAttr(state.ownQuery)}"><span>Click a unit to toggle ON DEFENSE</span></div>
    <div class="gac-manual-roster-grid">${rows.map((unit) => {
      const id = normalizeBaseId(unit.baseId);
      const reservedUnit = state.reservedBaseIds.has(id);
      return `<button type="button" data-gac-manual-own-toggle="${escapeAttr(id)}" class="${reservedUnit ? 'is-reserved' : ''}">${portrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>R${n(unit.relic)} · ${number.format(n(unit.speed))} SPD · Z${n(unit.zetas)} · O${n(unit.omicrons)}</small></span><b>${reservedUnit ? 'DEFENSE' : 'AVAILABLE'}</b></button>`;
    }).join('')}</div>
  </section>`;
}

function enemySelectedMarkup(editor) {
  const index = rosterIndex(state.opponentRoster);
  return `<div class="gac-manual-enemy-selected">${Array.from({ length: squadSize(state.format) }, (_, slot) => {
    const id = editor.members[slot];
    const unit = id ? index.get(id) : null;
    if (!unit) return `<div class="is-empty"><span>${slot === 0 ? 'LEADER' : `UNIT ${slot + 1}`}</span><b>+</b></div>`;
    const leader = editor.leaderBaseId === id;
    return `<div class="${leader ? 'is-leader' : ''}"><span>${leader ? 'LEADER' : `UNIT ${slot + 1}`}</span>${portrait(unit)}<button type="button" data-gac-manual-make-leader="${escapeAttr(id)}" ${leader ? 'disabled' : ''}>Leader</button><button type="button" data-gac-manual-enemy-remove="${escapeAttr(id)}">×</button></div>`;
  }).join('')}</div>`;
}

function enemyEditorMarkup() {
  if (!state.enemyEditor) return '';
  const editor = state.enemyEditor;
  const size = squadSize(state.format);
  const rows = opponentRows(editor.query);
  const selected = new Set(editor.members);
  const canSave = editor.members.length === size && selected.has(editor.leaderBaseId);
  return `<section class="gac-manual-editor">
    <header><div><span>VISIBLE ENEMY SQUAD</span><strong>${editor.id ? 'Edit defense' : 'Add defense'} · select exactly ${size}</strong><small>Pick only the characters you can see in-game. First selection becomes leader until you change it.</small></div><button type="button" data-gac-manual-editor-close>Close</button></header>
    <div class="gac-manual-editor-position"><label>Territory<select data-gac-manual-editor-zone>${SQUAD_ZONES.map((zone) => `<option value="${zone}" ${editor.zone === zone ? 'selected' : ''}>${zone.replaceAll('-', ' ')}</option>`).join('')}</select></label><label>Slot<input data-gac-manual-editor-slot type="number" min="1" max="9" value="${Number(editor.slot) + 1}"></label></div>
    ${enemySelectedMarkup(editor)}
    <div class="gac-manual-search"><input data-gac-manual-enemy-search placeholder="Search opponent roster…" value="${escapeAttr(editor.query)}"><span>${editor.members.length}/${size} selected</span></div>
    <div class="gac-manual-roster-grid is-enemy">${rows.map((unit) => {
      const id = normalizeBaseId(unit.baseId);
      const chosen = selected.has(id);
      return `<button type="button" data-gac-manual-enemy-toggle="${escapeAttr(id)}" class="${chosen ? 'is-selected' : ''}">${portrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>R${n(unit.relic)} · ${number.format(n(unit.speed))} SPD · Z${n(unit.zetas)} · O${n(unit.omicrons)}</small></span><b>${chosen ? 'SELECTED' : 'ADD'}</b></button>`;
    }).join('')}</div>
    <footer><button type="button" data-gac-manual-editor-save ${canSave ? '' : 'disabled'}>${editor.id ? 'SAVE CHANGES' : 'ADD TO ENEMY BOARD'}</button></footer>
  </section>`;
}

function defenseCard(defense, index) {
  const units = resolveDefenseUnits(defense, state.opponentRoster);
  const stats = teamStats(units);
  return `<article class="gac-manual-defense-card"><header><div><span>${escapeHtml(defense.zone.replaceAll('-', ' '))} · SLOT ${Number(defense.slot) + 1}</span><strong>${escapeHtml(units[0]?.name || defense.leaderBaseId)}</strong></div><b>#${index + 1}</b></header><div class="gac-manual-team">${units.map((unit) => portrait(unit)).join('')}</div><div class="gac-manual-mini-stats"><span>R ${stats.relics}</span><span>Z ${stats.zetas}</span><span>O ${stats.omicrons}</span><span>FAST ${stats.fastestSpeed ?? '—'}</span></div><footer><button type="button" data-gac-manual-defense-edit="${escapeAttr(defense.id)}">Edit</button><button type="button" data-gac-manual-defense-delete="${escapeAttr(defense.id)}">Delete</button></footer></article>`;
}

function enemyBoardMarkup() {
  if (!state.opponentRoster) return '';
  return `<section class="gac-manual-block gac-manual-enemy-board"><header><div><span>3 · ENEMY BOARD</span><strong>Enter only the squads you actually see</strong><small>Example: SEE/Sith on the front wall, Gungans on the back wall. Nothing is inferred from Comlink.</small></div><button type="button" data-gac-manual-defense-add>+ ADD VISIBLE DEFENSE</button></header><div class="gac-manual-defense-list">${state.defenses.length ? state.defenses.map(defenseCard).join('') : '<p>No enemy defenses entered yet.</p>'}</div>${enemyEditorMarkup()}</section>`;
}

function recommendationMetrics(assignment, defense) {
  const squad = Array.isArray(assignment?.recommendation?.squad) ? assignment.recommendation.squad : [];
  const enemy = resolveDefenseUnits(defense, state.opponentRoster);
  const own = teamStats(squad);
  const theirs = teamStats(enemy);
  const zetaKnown = rosterCapability(state.ownRoster, 'zetas') && rosterCapability(state.opponentRoster, 'zetas');
  const omiKnown = rosterCapability(state.ownRoster, 'omicrons') && rosterCapability(state.opponentRoster, 'omicrons');
  const speedKnown = own.fastestSpeed !== null && theirs.fastestSpeed !== null;
  const ownHealth = aggregateOptionalStat(squad, ['health', 'maxHealth', '1']);
  const enemyHealth = aggregateOptionalStat(enemy, ['health', 'maxHealth', '1']);
  const ownProtection = aggregateOptionalStat(squad, ['protection', 'maxProtection', '28']);
  const enemyProtection = aggregateOptionalStat(enemy, ['protection', 'maxProtection', '28']);
  const ownOffense = aggregateOptionalStat(squad, ['physicalDamage', 'offense', 'damage', '6']);
  const enemyOffense = aggregateOptionalStat(enemy, ['physicalDamage', 'offense', 'damage', '6']);
  return Object.freeze({
    squad,
    enemy,
    relicDelta: own.relics - theirs.relics,
    zetaDelta: zetaKnown ? own.zetas - theirs.zetas : null,
    omicronDelta: omiKnown ? own.omicrons - theirs.omicrons : null,
    fastestSpeedDelta: speedKnown ? own.fastestSpeed - theirs.fastestSpeed : null,
    medianSpeedDelta: own.medianSpeed !== null && theirs.medianSpeed !== null ? own.medianSpeed - theirs.medianSpeed : null,
    powerDelta: own.power - theirs.power,
    healthDelta: ownHealth !== null && enemyHealth !== null ? ownHealth - enemyHealth : null,
    protectionDelta: ownProtection !== null && enemyProtection !== null ? ownProtection - enemyProtection : null,
    offenseDelta: ownOffense !== null && enemyOffense !== null ? ownOffense - enemyOffense : null,
  });
}

function counterCard(assignment, defense, index) {
  if (!assignment?.recommendation?.squad?.length) return `<article class="gac-manual-counter-card is-blocked"><header><span>COUNTER ${index + 1}</span><strong>NO LEGAL COUNTER ALLOCATED</strong></header><p>Your remaining roster could not produce a non-overlapping ${escapeHtml(state.format)} squad for this defense after current defense reservations and earlier allocations.</p></article>`;
  const metrics = recommendationMetrics(assignment, defense);
  const recommendation = assignment.recommendation;
  const evidence = assignment.source === 'historical-counter-evidence';
  const battles = n(recommendation?.battles);
  const wins = n(recommendation?.wins);
  const calculatedStatsKnown = state.ownRoster?.capabilities?.calculatedStats === true && state.opponentRoster?.capabilities?.calculatedStats === true;
  return `<article class="gac-manual-counter-card ${evidence ? 'is-evidence' : 'is-heuristic'}"><header><div><span>${escapeHtml(defense.zone.replaceAll('-', ' '))} · SLOT ${Number(defense.slot) + 1}</span><strong>${evidence ? 'HISTORICAL COUNTER EVIDENCE' : 'REMAINING-ROSTER COUNTER'}</strong><small>${escapeHtml(recommendation.confidence || assignment.allocationReason || 'Roster-fit allocation')}</small></div><b>#${index + 1}</b></header>
    <div class="gac-manual-counter-versus"><div><span>ENEMY</span>${metrics.enemy.map((unit) => portrait(unit, 'is-enemy')).join('')}</div><strong>VS</strong><div><span>USE</span>${metrics.squad.map((unit) => portrait(unit, 'is-counter')).join('')}</div></div>
    <div class="gac-manual-deltas"><span><small>RELIC Δ</small><b>${signed(metrics.relicDelta)}</b></span><span><small>ZETA Δ</small><b>${signed(metrics.zetaDelta)}</b></span><span><small>OMICRON Δ</small><b>${signed(metrics.omicronDelta)}</b></span><span><small>FASTEST SPD Δ</small><b>${signed(metrics.fastestSpeedDelta)}</b></span><span><small>MEDIAN SPD Δ</small><b>${signed(metrics.medianSpeedDelta)}</b></span><span><small>TEAM GP Δ</small><b>${signed(metrics.powerDelta)}</b></span></div>
    <div class="gac-manual-stat-foot">${calculatedStatsKnown ? `<span>Health Δ ${signed(metrics.healthDelta)}</span><span>Protection Δ ${signed(metrics.protectionDelta)}</span><span>Offense Δ ${signed(metrics.offenseDelta)}</span>` : '<span>Full calculated Health/Protection/Offense stats are not exposed by the current roster source; speed/mod profile remains usable.</span>'}</div>
    <footer>${evidence && battles ? `<strong>${wins}/${battles} observed wins</strong><span>Historical evidence · not a predicted win probability</span>` : `<strong>Roster-fit heuristic</strong><span>Uses real owned relics, Zetas, Omicrons, speed/mod profile and progression; not a guaranteed win rate.</span>`}</footer>
  </article>`;
}

function planMarkup() {
  if (!state.opponentRoster || !state.defenses.length || !state.ownRoster) return '';
  const plan = planManualBoard({
    ownRoster: state.ownRoster,
    opponentRoster: state.opponentRoster,
    defenses: state.defenses,
    reservedBaseIds: [...state.reservedBaseIds],
    evidenceByLeader: state.evidenceByLeader,
    format: state.format,
  });
  const assignmentByIndex = new Map(plan.assignments.map((row) => [Number(row.sourceIndex), row]));
  const totalChars = rosterCharacters(state.ownRoster).length;
  const remainingAfterPlan = Math.max(0, totalChars - state.reservedBaseIds.size - plan.usedBaseIds.length);
  return `<section class="gac-manual-block gac-manual-plan"><header><div><span>4 · COUNTER PLAN</span><strong>Remaining offense, allocated across the board</strong><small>Defense units are excluded first. Recommended counters cannot overlap each other.</small></div><div class="gac-manual-plan-count"><span><b>${state.reservedBaseIds.size}</b><small>ON DEFENSE</small></span><span><b>${plan.usedBaseIds.length}</b><small>ALLOCATED</small></span><span><b>${remainingAfterPlan}</b><small>STILL FREE</small></span></div></header><div class="gac-manual-counter-list">${plan.defenses.map((defense, index) => counterCard(assignmentByIndex.get(index), defense, index)).join('')}</div></section>`;
}

function truthBanner() {
  return `<div class="gac-manual-truth"><strong>MANUAL GAC MODE</strong><span>Comlink is used for public roster/progression intelligence only. Opponent pairing, territory placement and visible defense squads are entered by you from the game.</span></div>`;
}

function render() {
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  if (!host) return;
  host.innerHTML = `<header class="gac-manual-head"><div><span>SWGOH COMMAND CENTER · GAC</span><strong>Manual Board Counter Planner</strong><p>Load both public rosters, tell Command Center exactly what is on defense, and allocate counters only from units you still have available.</p></div><button type="button" data-gac-manual-legacy>${state.legacyVisible ? 'HIDE ADVANCED WAR ROOM' : 'SHOW ADVANCED WAR ROOM'}</button></header>${truthBanner()}${setupMarkup()}${state.error ? `<div class="gac-manual-error">${escapeHtml(state.error)}</div>` : ''}${summaryMarkup()}${ownDefenseMarkup()}${enemyBoardMarkup()}${planMarkup()}`;
  const legacy = document.querySelector('[data-gacv2-root]');
  legacy?.classList.toggle('gac-manual-legacy-visible', state.legacyVisible);
}

function newEnemyEditor(defense = null) {
  const size = squadSize(state.format);
  state.enemyEditor = {
    id: defense?.id || '',
    zone: defense?.zone || 'FRONT-TOP',
    slot: Number.isInteger(Number(defense?.slot)) ? Number(defense.slot) : 0,
    members: Array.isArray(defense?.members) ? defense.members.slice(0, size).map(normalizeBaseId) : [],
    leaderBaseId: normalizeBaseId(defense?.leaderBaseId),
    query: '',
  };
  if (!state.enemyEditor.leaderBaseId && state.enemyEditor.members.length) state.enemyEditor.leaderBaseId = state.enemyEditor.members[0];
}

function toggleOwnDefense(idInput) {
  const id = normalizeBaseId(idInput);
  if (!id) return;
  if (state.reservedBaseIds.has(id)) state.reservedBaseIds.delete(id);
  else state.reservedBaseIds.add(id);
  persistPairingState();
  render();
}

function toggleEnemyUnit(idInput) {
  if (!state.enemyEditor) return;
  const id = normalizeBaseId(idInput);
  const index = state.enemyEditor.members.indexOf(id);
  if (index >= 0) {
    state.enemyEditor.members.splice(index, 1);
    if (state.enemyEditor.leaderBaseId === id) state.enemyEditor.leaderBaseId = state.enemyEditor.members[0] || '';
  } else if (state.enemyEditor.members.length < squadSize(state.format)) {
    state.enemyEditor.members.push(id);
    if (!state.enemyEditor.leaderBaseId) state.enemyEditor.leaderBaseId = id;
  }
  render();
}

function saveEnemyEditor() {
  const editor = state.enemyEditor;
  if (!editor) return;
  const size = squadSize(state.format);
  const members = [...new Set(editor.members.map(normalizeBaseId).filter(Boolean))];
  if (members.length !== size || !members.includes(editor.leaderBaseId)) return;
  const row = {
    id: editor.id || `manual-defense-${Date.now()}`,
    zone: SQUAD_ZONES.includes(editor.zone) ? editor.zone : 'FRONT-TOP',
    slot: Math.max(0, Number(editor.slot) || 0),
    members,
    leaderBaseId: editor.leaderBaseId,
    source: 'manual-opponent-board',
  };
  state.defenses = state.defenses.filter((value) => value.id !== row.id);
  state.defenses.push(row);
  state.defenses.sort((a, b) => SQUAD_ZONES.indexOf(a.zone) - SQUAD_ZONES.indexOf(b.zone) || Number(a.slot) - Number(b.slot));
  state.enemyEditor = null;
  persistPairingState();
  scheduleEvidenceRefresh();
  render();
}

async function refreshEvidence() {
  const leaders = [...new Set(state.defenses.map((row) => normalizeBaseId(row.leaderBaseId)).filter(Boolean))];
  if (!leaders.length) { state.evidenceByLeader = new Map(); render(); return; }
  try {
    const body = await fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(state.format)}&leaders=${encodeURIComponent(leaders.join(','))}&limit=80`);
    state.evidenceByLeader = evidenceMapFromBatch(body);
  } catch {
    state.evidenceByLeader = new Map();
  }
  render();
}

function scheduleEvidenceRefresh() {
  clearTimeout(state.evidenceTimer);
  state.evidenceTimer = setTimeout(() => void refreshEvidence(), 120);
}

async function loadOpponent() {
  const input = document.querySelector('[data-gac-manual-opponent]');
  const opponent = normalizeAllyCode(input?.value || state.opponentCode);
  const owner = ownerCode();
  state.error = '';
  if (!owner) { state.error = 'Load your Player roster first so Command Center knows which units you own.'; render(); return; }
  if (!opponent || opponent === owner) { state.error = 'Enter a different valid 9-digit opponent Ally Code.'; render(); return; }
  state.loading = true;
  render();
  try {
    const [mine, enemy] = await Promise.all([fetchRoster(owner), fetchRoster(opponent)]);
    state.ownRoster = mine;
    state.opponentRoster = enemy;
    state.opponentCode = opponent;
    localStorage.setItem('swgoh:gac-manual-counter:last-opponent', opponent);
    localStorage.setItem('swgoh:gac-manual-counter:format', state.format);
    loadPairingState();
    scheduleEvidenceRefresh();
  } catch (error) {
    state.error = error?.message || 'Opponent roster could not be loaded.';
  } finally {
    state.loading = false;
    render();
  }
}

async function loadOwnRoster() {
  const owner = ownerCode();
  if (!owner) return;
  try { state.ownRoster = await fetchRoster(owner); }
  catch { state.ownRoster = null; }
  render();
}

function preserveInputFocus(selector, value, cursor) {
  render();
  const input = document.querySelector(selector);
  if (!input) return;
  input.focus();
  if (Number.isInteger(cursor)) input.setSelectionRange?.(cursor, cursor);
}

function bind(host) {
  if (host.dataset.bound === 'true') return;
  host.dataset.bound = 'true';
  host.addEventListener('click', (event) => {
    const own = event.target.closest?.('[data-gac-manual-own-toggle]');
    if (own) { toggleOwnDefense(own.dataset.gacManualOwnToggle); return; }
    const enemy = event.target.closest?.('[data-gac-manual-enemy-toggle]');
    if (enemy) { toggleEnemyUnit(enemy.dataset.gacManualEnemyToggle); return; }
    const remove = event.target.closest?.('[data-gac-manual-enemy-remove]');
    if (remove) { toggleEnemyUnit(remove.dataset.gacManualEnemyRemove); return; }
    const leader = event.target.closest?.('[data-gac-manual-make-leader]');
    if (leader && state.enemyEditor) { state.enemyEditor.leaderBaseId = normalizeBaseId(leader.dataset.gacManualMakeLeader); render(); return; }
    if (event.target.closest?.('[data-gac-manual-load]')) { void loadOpponent(); return; }
    if (event.target.closest?.('[data-gac-manual-defense-add]')) { newEnemyEditor(); render(); return; }
    const edit = event.target.closest?.('[data-gac-manual-defense-edit]');
    if (edit) { const row = state.defenses.find((value) => value.id === edit.dataset.gacManualDefenseEdit); if (row) newEnemyEditor(row); render(); return; }
    const del = event.target.closest?.('[data-gac-manual-defense-delete]');
    if (del) { state.defenses = state.defenses.filter((value) => value.id !== del.dataset.gacManualDefenseDelete); persistPairingState(); scheduleEvidenceRefresh(); render(); return; }
    if (event.target.closest?.('[data-gac-manual-editor-close]')) { state.enemyEditor = null; render(); return; }
    if (event.target.closest?.('[data-gac-manual-editor-save]')) { saveEnemyEditor(); return; }
    if (event.target.closest?.('[data-gac-manual-legacy]')) { state.legacyVisible = !state.legacyVisible; render(); return; }
  });
  host.addEventListener('input', (event) => {
    if (event.target.matches?.('[data-gac-manual-own-search]')) {
      state.ownQuery = event.target.value;
      preserveInputFocus('[data-gac-manual-own-search]', event.target.value, event.target.selectionStart);
      return;
    }
    if (event.target.matches?.('[data-gac-manual-enemy-search]') && state.enemyEditor) {
      state.enemyEditor.query = event.target.value;
      preserveInputFocus('[data-gac-manual-enemy-search]', event.target.value, event.target.selectionStart);
    }
  });
  host.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-gac-manual-format]')) {
      state.format = normalizeFormat(event.target.value);
      localStorage.setItem('swgoh:gac-manual-counter:format', state.format);
      loadPairingState();
      scheduleEvidenceRefresh();
      render();
      return;
    }
    if (event.target.matches?.('[data-gac-manual-editor-zone]') && state.enemyEditor) { state.enemyEditor.zone = clean(event.target.value).toUpperCase(); return; }
    if (event.target.matches?.('[data-gac-manual-editor-slot]') && state.enemyEditor) { state.enemyEditor.slot = Math.max(0, Number(event.target.value || 1) - 1); }
  });
  host.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches?.('[data-gac-manual-opponent]')) { event.preventDefault(); void loadOpponent(); }
  });
}

function injectStyle() {
  if (document.querySelector('link[data-gac-manual-counter-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/gac-manual-counter-planner.css?v=20260821-manual1';
  link.dataset.gacManualCounterStyle = 'true';
  document.head.appendChild(link);
}

function mount() {
  const legacy = document.querySelector('[data-gacv2-root]');
  if (!legacy) return false;
  let host = document.querySelector('[data-gac-manual-counter-planner]');
  if (!host) {
    host = document.createElement('section');
    host.dataset.gacManualCounterPlanner = 'true';
    host.className = 'gac-manual-counter-planner';
    legacy.insertAdjacentElement('beforebegin', host);
    legacy.classList.add('gac-manual-legacy-root');
    bind(host);
    void loadOwnRoster();
  }
  render();
  return true;
}

function scheduleMount(delay = 80) {
  setTimeout(() => mount(), Math.max(0, delay));
}

if (typeof document !== 'undefined') {
  injectStyle();
  scheduleMount(60);
  document.addEventListener('DOMContentLoaded', () => scheduleMount(80), { once: true });
  window.addEventListener('hashchange', () => scheduleMount(100));
  window.addEventListener('swgoh:workspace-activated', () => scheduleMount(100));
  new MutationObserver(() => { if (!document.querySelector('[data-gac-manual-counter-planner]') && document.querySelector('[data-gacv2-root]')) scheduleMount(20); }).observe(document.documentElement, { childList: true, subtree: true });
}

export { loadOpponent, mount, recommendationMetrics };
