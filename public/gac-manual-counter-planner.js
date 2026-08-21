import {
  BOARD_ZONES,
  SQUAD_ZONES,
  availableFactions,
  evidenceMapFromBatch,
  filterRosterUnits,
  normalizeAllyCode,
  normalizeBaseId,
  normalizeFormat,
  normalizePlannerState,
  planManualBoard,
  planManualFleets,
  plannerStorageKey,
  resolveDefenseUnits,
  rosterAllUnits,
  rosterCharacters,
  rosterShips,
  squadSize,
  teamStats,
} from './gac-manual-counter-planner-model.js';

const state = {
  ownRoster: null,
  opponentRoster: null,
  catalog: null,
  opponentCode: localStorage.getItem('swgoh:gac-manual-counter:last-opponent') || '',
  format: normalizeFormat(localStorage.getItem('swgoh:gac-manual-counter:format') || '5v5'),
  reservedBaseIds: new Set(),
  defenses: [],
  evidenceByLeader: new Map(),
  fleetEvidence: null,
  enemyEditor: null,
  ownQuery: '',
  ownFaction: 'all',
  ownType: 'character',
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

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  state.catalog = await fetchJson('/data/catalog.json?gac-manual-map=2', { cache: 'force-cache' }).catch(() => ({ units: [] }));
  return state.catalog;
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
  state.defenses = normalized.defenses.map((row) => ({
    ...row,
    members: [...row.members],
    starters: [...(row.starters || [])],
    reinforcements: [...(row.reinforcements || [])],
  }));
  state.enemyEditor = null;
  state.evidenceByLeader = new Map();
  state.fleetEvidence = null;
}

function persistPairingState() {
  if (!normalizeAllyCode(state.opponentCode)) return;
  localStorage.setItem(currentStorageKey(), JSON.stringify({
    format: state.format,
    reservedBaseIds: [...state.reservedBaseIds],
    defenses: state.defenses,
  }));
}

function rosterIndex(body = {}, type = 'all') {
  const rows = type === 'character' ? rosterCharacters(body) : type === 'ship' ? rosterShips(body) : rosterAllUnits(body);
  return new Map(rows.map((unit) => [normalizeBaseId(unit?.baseId), unit]).filter(([id]) => Boolean(id)));
}

function ownRosterRows() {
  return filterRosterUnits(state.ownRoster, {
    type: state.ownType,
    query: state.ownQuery,
    faction: state.ownFaction,
  }).sort((a, b) => n(b?.power) - n(a?.power) || clean(a?.name).localeCompare(clean(b?.name))).slice(0, 140);
}

function opponentRows(editor = {}) {
  return filterRosterUnits(state.opponentRoster, {
    type: editor.type === 'fleet' ? 'ship' : 'character',
    query: editor.query,
    faction: editor.faction,
  }).sort((a, b) => n(b?.power) - n(a?.power) || clean(a?.name).localeCompare(clean(b?.name))).slice(0, 160);
}

function factionOptions(body, type, selected = 'all') {
  const values = availableFactions(body, type);
  return `<option value="all" ${selected === 'all' ? 'selected' : ''}>All Factions</option>${values.map((value) => `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
}

function rosterCapability(body = {}, key) {
  if (body?.capabilities && Object.prototype.hasOwnProperty.call(body.capabilities, key)) return body.capabilities[key] === true;
  return true;
}

function rosterSource(body = {}) {
  const source = clean(body?.source || body?.sourceDetail || 'roster');
  return source || 'roster';
}

function unitDetailLine(unit = {}) {
  if (clean(unit?.unitType).toLowerCase() === 'ship') {
    return `${number.format(n(unit?.power))} GP · ${n(unit?.speed) ? `${number.format(n(unit.speed))} SPD` : 'SPD —'} · ${n(unit?.stars)}★`;
  }
  return `R${n(unit?.relic)} · ${number.format(n(unit?.speed))} SPD · Z${n(unit?.zetas)} · O${n(unit?.omicrons)}`;
}

function summaryMarkup() {
  const owner = state.ownRoster?.player || {};
  const enemy = state.opponentRoster?.player || {};
  const ownChars = rosterCharacters(state.ownRoster).length;
  const ownShips = rosterShips(state.ownRoster).length;
  const enemyChars = rosterCharacters(state.opponentRoster).length;
  const enemyShips = rosterShips(state.opponentRoster).length;
  const reservedIndex = rosterIndex(state.ownRoster);
  const reservedChars = [...state.reservedBaseIds].filter((id) => clean(reservedIndex.get(id)?.unitType).toLowerCase() !== 'ship').length;
  const reservedShips = [...state.reservedBaseIds].filter((id) => clean(reservedIndex.get(id)?.unitType).toLowerCase() === 'ship').length;
  if (!state.opponentRoster) {
    return `<div class="gac-manual-empty"><strong>1 · Load the opponent</strong><span>Enter the opponent's Ally Code. Command Center loads their public roster; you enter the visible GAC board yourself.</span></div>`;
  }
  return `<div class="gac-manual-versus">
    <article><span>YOUR ROSTER</span><strong>${escapeHtml(owner.name || formatAllyCode(ownerCode()))}</strong><small>${number.format(n(owner.galacticPower))} GP · ${ownChars} chars · ${ownShips} ships · ${reservedChars} chars + ${reservedShips} ships reserved</small></article>
    <b>VS</b>
    <article class="enemy"><span>OPPONENT ALLY CODE</span><strong>${escapeHtml(enemy.name || formatAllyCode(state.opponentCode))}</strong><small>${number.format(n(enemy.galacticPower))} GP · ${enemyChars} chars · ${enemyShips} ships · ${escapeHtml(rosterSource(state.opponentRoster))}</small></article>
  </div>`;
}

function setupMarkup() {
  return `<section class="gac-manual-setup">
    <div class="gac-manual-step"><b>1</b><div><span>OPPONENT ALLY CODE</span><strong>Load roster + stats</strong></div></div>
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
    <header><div><span>2 · YOUR DEFENSE / UNAVAILABLE</span><strong>Mark characters and ships you placed on defense</strong><small>Reserved units are removed from offense recommendations. Use Search + Type + Faction to find units quickly.</small></div><div class="gac-manual-count"><b>${reserved.length}</b><small>RESERVED</small></div></header>
    <div class="gac-manual-reserved">${reserved.length ? reserved.map((unit) => `<button type="button" data-gac-manual-own-toggle="${escapeAttr(unit.baseId)}" class="is-reserved">${portrait(unit)}<span>ON DEFENSE ×</span></button>`).join('') : '<p>No units marked on defense yet.</p>'}</div>
    <div class="gac-manual-filterbar">
      <input data-gac-manual-own-search placeholder="Search by character or ship name…" value="${escapeAttr(state.ownQuery)}">
      <select data-gac-manual-own-type><option value="character" ${state.ownType === 'character' ? 'selected' : ''}>Characters</option><option value="ship" ${state.ownType === 'ship' ? 'selected' : ''}>Ships</option></select>
      <select data-gac-manual-own-faction>${factionOptions(state.ownRoster, state.ownType, state.ownFaction)}</select>
      <span>${rows.length} shown</span>
    </div>
    <div class="gac-manual-roster-grid">${rows.map((unit) => {
      const id = normalizeBaseId(unit.baseId);
      const reservedUnit = state.reservedBaseIds.has(id);
      return `<button type="button" data-gac-manual-own-toggle="${escapeAttr(id)}" class="${reservedUnit ? 'is-reserved' : ''}">${portrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>${escapeHtml(unitDetailLine(unit))}</small></span><b>${reservedUnit ? 'DEFENSE' : 'AVAILABLE'}</b></button>`;
    }).join('')}</div>
  </section>`;
}

function editorSelectionLimit(editor) {
  return editor?.type === 'fleet' ? 8 : squadSize(state.format);
}

function editorMinimum(editor) {
  return editor?.type === 'fleet' ? 4 : squadSize(state.format);
}

function enemySelectedMarkup(editor) {
  const type = editor.type === 'fleet' ? 'ship' : 'character';
  const index = rosterIndex(state.opponentRoster, type);
  const slots = editor.type === 'fleet' ? 8 : squadSize(state.format);
  return `<div class="gac-manual-enemy-selected ${editor.type === 'fleet' ? 'is-fleet' : ''}">${Array.from({ length: slots }, (_, slot) => {
    const id = editor.members[slot];
    const unit = id ? index.get(id) : null;
    const role = editor.type === 'fleet' ? (slot === 0 ? 'CAPITAL' : slot <= 3 ? `SHIP ${slot}` : `REINF ${slot - 3}`) : (slot === 0 ? 'LEADER' : `UNIT ${slot + 1}`);
    if (!unit) return `<div class="is-empty"><span>${role}</span><b>+</b></div>`;
    const leader = editor.leaderBaseId === id;
    return `<div class="${leader ? 'is-leader' : ''}"><span>${leader ? (editor.type === 'fleet' ? 'CAPITAL' : 'LEADER') : role}</span>${portrait(unit)}<button type="button" data-gac-manual-make-leader="${escapeAttr(id)}" ${leader ? 'disabled' : ''}>${editor.type === 'fleet' ? 'Capital' : 'Leader'}</button><button type="button" data-gac-manual-enemy-remove="${escapeAttr(id)}">×</button></div>`;
  }).join('')}</div>`;
}

function enemyEditorMarkup() {
  if (!state.enemyEditor) return '';
  const editor = state.enemyEditor;
  const max = editorSelectionLimit(editor);
  const min = editorMinimum(editor);
  const rows = opponentRows(editor);
  const selected = new Set(editor.members);
  const canSave = editor.type === 'fleet'
    ? editor.members.length >= min && editor.members.length <= max && selected.has(editor.leaderBaseId)
    : editor.members.length === max && selected.has(editor.leaderBaseId);
  const typeLabel = editor.type === 'fleet' ? 'VISIBLE ENEMY FLEET' : 'VISIBLE ENEMY SQUAD';
  const instruction = editor.type === 'fleet'
    ? 'Select the capital ship plus at least 3 visible ships. Reinforcement roles are not inferred; add only ships you can confirm.'
    : `Select exactly ${max} characters. First selection becomes leader until you change it.`;
  const zones = editor.type === 'fleet' ? ['BACK-TOP'] : SQUAD_ZONES;
  return `<section class="gac-manual-editor">
    <header><div><span>${typeLabel}</span><strong>${editor.id ? 'Edit defense' : 'Add defense'}</strong><small>${instruction}</small></div><button type="button" data-gac-manual-editor-close>Close</button></header>
    <div class="gac-manual-editor-position is-wide">
      <label>Defense Type<select data-gac-manual-editor-type><option value="squad" ${editor.type === 'squad' ? 'selected' : ''}>Character Squad</option><option value="fleet" ${editor.type === 'fleet' ? 'selected' : ''}>Fleet / Ships</option></select></label>
      <label>Territory<select data-gac-manual-editor-zone>${zones.map((zone) => `<option value="${zone}" ${editor.zone === zone ? 'selected' : ''}>${zone === 'BACK-TOP' ? 'FLEET TERRITORY / BACK TOP' : zone.replaceAll('-', ' ')}</option>`).join('')}</select></label>
      <label>Slot<input data-gac-manual-editor-slot type="number" min="1" max="9" value="${Number(editor.slot) + 1}"></label>
    </div>
    ${enemySelectedMarkup(editor)}
    <div class="gac-manual-filterbar">
      <input data-gac-manual-enemy-search placeholder="Search ${editor.type === 'fleet' ? 'ships' : 'characters'} by name…" value="${escapeAttr(editor.query)}">
      <select data-gac-manual-enemy-faction>${factionOptions(state.opponentRoster, editor.type === 'fleet' ? 'ship' : 'character', editor.faction)}</select>
      <span>${editor.members.length}/${editor.type === 'fleet' ? `${min}-${max}` : max} selected</span>
    </div>
    <div class="gac-manual-roster-grid is-enemy">${rows.map((unit) => {
      const id = normalizeBaseId(unit.baseId);
      const chosen = selected.has(id);
      return `<button type="button" data-gac-manual-enemy-toggle="${escapeAttr(id)}" class="${chosen ? 'is-selected' : ''}">${portrait(unit)}<span><strong>${escapeHtml(unit.name)}</strong><small>${escapeHtml(unitDetailLine(unit))}</small></span><b>${chosen ? 'SELECTED' : 'ADD'}</b></button>`;
    }).join('')}</div>
    <footer><button type="button" data-gac-manual-editor-save ${canSave ? '' : 'disabled'}>${editor.id ? 'SAVE CHANGES' : 'ADD TO ENEMY BOARD'}</button></footer>
  </section>`;
}

function defenseCard(defense, index) {
  const units = resolveDefenseUnits(defense, state.opponentRoster);
  const stats = teamStats(units);
  const fleet = defense.type === 'fleet';
  return `<article class="gac-manual-defense-card ${fleet ? 'is-fleet' : ''}"><header><div><span>${fleet ? 'FLEET TERRITORY' : escapeHtml(defense.zone.replaceAll('-', ' '))} · SLOT ${Number(defense.slot) + 1}</span><strong>${escapeHtml(units[0]?.name || defense.leaderBaseId)}</strong></div><b>${fleet ? 'FLEET' : `#${index + 1}`}</b></header><div class="gac-manual-team">${units.map((unit) => portrait(unit)).join('')}</div><div class="gac-manual-mini-stats">${fleet ? `<span>${units.length} SHIPS</span><span>${number.format(stats.power)} GP</span><span>FAST ${stats.fastestSpeed ?? '—'}</span>` : `<span>R ${stats.relics}</span><span>Z ${stats.zetas}</span><span>O ${stats.omicrons}</span><span>FAST ${stats.fastestSpeed ?? '—'}</span>`}</div><footer><button type="button" data-gac-manual-defense-edit="${escapeAttr(defense.id)}">Edit</button><button type="button" data-gac-manual-defense-delete="${escapeAttr(defense.id)}">Delete</button></footer></article>`;
}

function zoneMapCard(zone) {
  const info = BOARD_ZONES.find((row) => row.value === zone);
  const rows = state.defenses.filter((row) => row.zone === zone);
  const isFleet = info?.type === 'fleet';
  return `<section class="gac-manual-map-zone is-${zone.toLowerCase()} ${isFleet ? 'is-fleet' : 'is-squad'}">
    <header><div><span>${escapeHtml(info?.shortLabel || zone)}</span><strong>${escapeHtml(info?.label || zone)}</strong><small>${isFleet ? 'Capital ship + visible ships' : `${state.format} character squads`}</small></div><button type="button" data-gac-manual-map-add="${escapeAttr(zone)}">+ ${isFleet ? 'ADD FLEET' : 'ADD SQUAD'}</button></header>
    <div class="gac-manual-map-slots">${rows.length ? rows.map(defenseCard).join('') : `<button type="button" class="gac-manual-empty-slot" data-gac-manual-map-add="${escapeAttr(zone)}"><b>+</b><span>${isFleet ? 'ENTER FLEET' : 'ENTER DEFENSE'}</span></button>`}</div>
  </section>`;
}

function enemyBoardMarkup() {
  if (!state.opponentRoster) return '';
  return `<section class="gac-manual-block gac-manual-enemy-board"><header><div><span>3 · ENEMY BOARD MAP</span><strong>Enter the board exactly as it appears in GAC</strong><small>Front territories are on the right, rear territories on the left. Fleet Territory is Back Top. Add only squads/fleets you actually see.</small></div></header>
    <div class="gac-manual-gac-map">
      ${zoneMapCard('BACK-TOP')}
      ${zoneMapCard('FRONT-TOP')}
      <div class="gac-manual-map-emblem"><span>GAC</span><b>✦</b></div>
      ${zoneMapCard('BACK-BOTTOM')}
      ${zoneMapCard('FRONT-BOTTOM')}
    </div>
    ${enemyEditorMarkup()}
  </section>`;
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
  if (!assignment?.recommendation?.squad?.length) return `<article class="gac-manual-counter-card is-blocked"><header><span>COUNTER ${index + 1}</span><strong>NO LEGAL COUNTER ALLOCATED</strong></header><p>Your remaining roster could not produce a non-overlapping ${escapeHtml(state.format)} squad for this defense after current reservations and earlier allocations.</p></article>`;
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
    <footer>${evidence && battles ? `<strong>${wins}/${battles} observed wins</strong><span>Historical evidence · not a predicted win probability</span>` : `<strong>Roster-fit heuristic</strong><span>Uses owned relics, Zetas, Omicrons, speed/mod profile and progression; not a guaranteed win rate.</span>`}</footer>
  </article>`;
}

function fleetCounterCard(assignment, defense, index) {
  const enemy = resolveDefenseUnits(defense, state.opponentRoster);
  if (!assignment?.recommendation) {
    return `<article class="gac-manual-counter-card is-blocked is-fleet"><header><div><span>FLEET TERRITORY · SLOT ${Number(defense.slot) + 1}</span><strong>NO EVIDENCE-BACKED FLEET COUNTER</strong></div><b>F${index + 1}</b></header><div class="gac-manual-counter-versus"><div><span>ENEMY FLEET</span>${enemy.map((unit) => portrait(unit, 'is-enemy')).join('')}</div></div><p>Fleet recommendations remain source-gated. Command Center will not invent a fleet counter when compatible historical fleet evidence is unavailable.</p></article>`;
  }
  const rec = assignment.recommendation;
  const ownerShips = rosterIndex(state.ownRoster, 'ship');
  const ids = [...new Set([rec.counterCapitalShipBaseId, ...(rec.counterMembers || [])].map(normalizeBaseId).filter(Boolean))];
  const fleet = ids.map((id) => ownerShips.get(id) || rec.fleet?.find((unit) => normalizeBaseId(unit) === id)).filter(Boolean);
  const ownStats = teamStats(fleet);
  const enemyStats = teamStats(enemy);
  return `<article class="gac-manual-counter-card is-evidence is-fleet"><header><div><span>FLEET TERRITORY · SLOT ${Number(defense.slot) + 1}</span><strong>HISTORICAL FLEET COUNTER</strong><small>${escapeHtml(rec.compositionMatch?.label || assignment.allocationReason || 'Fleet evidence')}</small></div><b>F${index + 1}</b></header>
    <div class="gac-manual-counter-versus"><div><span>ENEMY FLEET</span>${enemy.map((unit) => portrait(unit, 'is-enemy')).join('')}</div><strong>VS</strong><div><span>USE FLEET</span>${fleet.map((unit) => portrait(unit, 'is-counter')).join('')}</div></div>
    <div class="gac-manual-deltas is-fleet"><span><small>TEAM GP Δ</small><b>${signed(ownStats.power - enemyStats.power)}</b></span><span><small>FASTEST SPD Δ</small><b>${ownStats.fastestSpeed !== null && enemyStats.fastestSpeed !== null ? signed(ownStats.fastestSpeed - enemyStats.fastestSpeed) : '—'}</b></span><span><small>OBSERVED</small><b>${n(rec.wins)}/${n(rec.battles)}</b></span><span><small>COMPOSITION</small><b>${escapeHtml(rec.compositionMatch?.key || 'evidence')}</b></span></div>
    <footer><strong>${n(rec.wins)}/${n(rec.battles)} observed wins</strong><span>Historical fleet evidence · not a predicted win probability · starter/reinforcement roles are not inferred.</span></footer>
  </article>`;
}

function planMarkup() {
  if (!state.opponentRoster || !state.defenses.length || !state.ownRoster) return '';
  const squadPlan = planManualBoard({ ownRoster: state.ownRoster, opponentRoster: state.opponentRoster, defenses: state.defenses, reservedBaseIds: [...state.reservedBaseIds], evidenceByLeader: state.evidenceByLeader, format: state.format });
  const fleetPlan = planManualFleets({ ownRoster: state.ownRoster, catalog: state.catalog || {}, defenses: state.defenses, reservedBaseIds: [...state.reservedBaseIds], evidence: state.fleetEvidence || {}, format: state.format });
  const squadAssignments = new Map(squadPlan.assignments.map((row) => [Number(row.sourceIndex), row]));
  const fleetAssignments = new Map(fleetPlan.assignments.map((row) => [Number(row.sourceIndex), row]));
  const totalChars = rosterCharacters(state.ownRoster).length;
  const totalShips = rosterShips(state.ownRoster).length;
  const ownIndex = rosterIndex(state.ownRoster);
  const reservedChars = [...state.reservedBaseIds].filter((id) => clean(ownIndex.get(id)?.unitType).toLowerCase() !== 'ship').length;
  const reservedShips = [...state.reservedBaseIds].filter((id) => clean(ownIndex.get(id)?.unitType).toLowerCase() === 'ship').length;
  const remainingChars = Math.max(0, totalChars - reservedChars - squadPlan.usedBaseIds.length);
  const remainingShips = Math.max(0, totalShips - reservedShips - fleetPlan.usedBaseIds.length);
  return `<section class="gac-manual-block gac-manual-plan"><header><div><span>4 · COUNTER PLAN</span><strong>Remaining offense allocated across squads and fleets</strong><small>Reserved defense units are excluded first. Character counters never overlap each other; fleet counters use the existing evidence-only allocator.</small></div><div class="gac-manual-plan-count"><span><b>${remainingChars}</b><small>CHARS FREE</small></span><span><b>${remainingShips}</b><small>SHIPS FREE</small></span></div></header>
    ${squadPlan.defenses.length ? `<div class="gac-manual-subhead"><span>CHARACTER COUNTERS</span><strong>${squadPlan.defenses.length} visible squad${squadPlan.defenses.length === 1 ? '' : 's'}</strong></div><div class="gac-manual-counter-list">${squadPlan.defenses.map((defense, index) => counterCard(squadAssignments.get(index), defense, index)).join('')}</div>` : ''}
    ${fleetPlan.defenses.length ? `<div class="gac-manual-subhead is-fleet"><span>FLEET COUNTERS</span><strong>${fleetPlan.defenses.length} visible fleet${fleetPlan.defenses.length === 1 ? '' : 's'}</strong></div><div class="gac-manual-counter-list">${fleetPlan.defenses.map((defense, index) => fleetCounterCard(fleetAssignments.get(index), defense, index)).join('')}</div>` : ''}
  </section>`;
}

function truthBanner() {
  return `<div class="gac-manual-truth"><strong>MANUAL GAC MODE</strong><span>Comlink supplies public roster/progression intelligence only. You enter the opponent Ally Code, your unavailable defense units, and the visible squads/fleets on the GAC map.</span></div>`;
}

function render() {
  const host = document.querySelector('[data-gac-manual-counter-planner]');
  if (!host) return;
  host.innerHTML = `<header class="gac-manual-head"><div><span>SWGOH COMMAND CENTER · GAC</span><strong>Manual GAC Map + Counter Planner</strong><p>Mirror the board you see in-game, search/filter both rosters, and allocate counters only from units you still have available.</p></div><button type="button" data-gac-manual-legacy>${state.legacyVisible ? 'HIDE ADVANCED WAR ROOM' : 'SHOW ADVANCED WAR ROOM'}</button></header>${truthBanner()}${setupMarkup()}${state.error ? `<div class="gac-manual-error">${escapeHtml(state.error)}</div>` : ''}${summaryMarkup()}${ownDefenseMarkup()}${enemyBoardMarkup()}${planMarkup()}`;
  const legacy = document.querySelector('[data-gacv2-root]');
  legacy?.classList.toggle('gac-manual-legacy-visible', state.legacyVisible);
}

function newEnemyEditor(defense = null, zoneInput = '') {
  const requestedZone = clean(zoneInput || defense?.zone || 'FRONT-TOP').toUpperCase();
  const type = defense?.type === 'fleet' || requestedZone === 'BACK-TOP' ? 'fleet' : 'squad';
  const max = type === 'fleet' ? 8 : squadSize(state.format);
  state.enemyEditor = {
    id: defense?.id || '', type,
    zone: type === 'fleet' ? 'BACK-TOP' : (SQUAD_ZONES.includes(requestedZone) ? requestedZone : 'FRONT-TOP'),
    slot: Number.isInteger(Number(defense?.slot)) ? Number(defense.slot) : Math.max(0, state.defenses.filter((row) => row.zone === requestedZone).length),
    members: Array.isArray(defense?.members) ? defense.members.slice(0, max).map(normalizeBaseId) : [],
    leaderBaseId: normalizeBaseId(defense?.capitalShipBaseId || defense?.leaderBaseId), query: '', faction: 'all',
  };
  if (!state.enemyEditor.leaderBaseId && state.enemyEditor.members.length) state.enemyEditor.leaderBaseId = state.enemyEditor.members[0];
}

function toggleOwnDefense(idInput) {
  const id = normalizeBaseId(idInput);
  if (!id) return;
  if (state.reservedBaseIds.has(id)) state.reservedBaseIds.delete(id); else state.reservedBaseIds.add(id);
  persistPairingState(); render();
}

function toggleEnemyUnit(idInput) {
  if (!state.enemyEditor) return;
  const id = normalizeBaseId(idInput);
  const index = state.enemyEditor.members.indexOf(id);
  if (index >= 0) {
    state.enemyEditor.members.splice(index, 1);
    if (state.enemyEditor.leaderBaseId === id) state.enemyEditor.leaderBaseId = state.enemyEditor.members[0] || '';
  } else if (state.enemyEditor.members.length < editorSelectionLimit(state.enemyEditor)) {
    state.enemyEditor.members.push(id);
    if (!state.enemyEditor.leaderBaseId) state.enemyEditor.leaderBaseId = id;
  }
  render();
}

function saveEnemyEditor() {
  const editor = state.enemyEditor;
  if (!editor) return;
  const members = [...new Set(editor.members.map(normalizeBaseId).filter(Boolean))];
  const isFleet = editor.type === 'fleet';
  const min = editorMinimum(editor);
  const max = editorSelectionLimit(editor);
  if ((isFleet ? members.length < min || members.length > max : members.length !== max) || !members.includes(editor.leaderBaseId)) return;
  const ships = members.filter((id) => id !== editor.leaderBaseId);
  const row = { id: editor.id || `manual-defense-${Date.now()}`, type: isFleet ? 'fleet' : 'squad', zone: isFleet ? 'BACK-TOP' : (SQUAD_ZONES.includes(editor.zone) ? editor.zone : 'FRONT-TOP'), slot: Math.max(0, Number(editor.slot) || 0), members, leaderBaseId: editor.leaderBaseId, capitalShipBaseId: isFleet ? editor.leaderBaseId : '', starters: isFleet ? ships.slice(0, 3) : [], reinforcements: isFleet ? ships.slice(3, 7) : [], source: 'manual-opponent-board' };
  state.defenses = state.defenses.filter((value) => value.id !== row.id);
  state.defenses.push(row);
  const zoneOrder = BOARD_ZONES.map((item) => item.value);
  state.defenses.sort((a, b) => zoneOrder.indexOf(a.zone) - zoneOrder.indexOf(b.zone) || Number(a.slot) - Number(b.slot));
  state.enemyEditor = null; persistPairingState(); scheduleEvidenceRefresh(); render();
}

async function refreshEvidence() {
  const leaders = [...new Set(state.defenses.filter((row) => row.type !== 'fleet').map((row) => normalizeBaseId(row.leaderBaseId)).filter(Boolean))];
  const capitals = [...new Set(state.defenses.filter((row) => row.type === 'fleet').map((row) => normalizeBaseId(row.capitalShipBaseId || row.leaderBaseId)).filter(Boolean))];
  const [squadBody, fleetBody] = await Promise.all([
    leaders.length ? fetchJson(`/api/gac/counters/batch?format=${encodeURIComponent(state.format)}&leaders=${encodeURIComponent(leaders.join(','))}&limit=80`).catch(() => ({})) : {},
    capitals.length ? fetchJson(`/api/gac/fleet/counters/batch?format=${encodeURIComponent(state.format)}&capitals=${encodeURIComponent(capitals.join(','))}&limit=50`).catch(() => ({})) : {},
  ]);
  state.evidenceByLeader = leaders.length ? evidenceMapFromBatch(squadBody) : new Map();
  state.fleetEvidence = capitals.length ? fleetBody : null;
  render();
}

function scheduleEvidenceRefresh() { clearTimeout(state.evidenceTimer); state.evidenceTimer = setTimeout(() => void refreshEvidence(), 120); }

async function loadOpponent() {
  const input = document.querySelector('[data-gac-manual-opponent]');
  const opponent = normalizeAllyCode(input?.value || state.opponentCode);
  const owner = ownerCode();
  state.error = '';
  if (!owner) { state.error = 'Load your Player roster first so Command Center knows which units you own.'; render(); return; }
  if (!opponent || opponent === owner) { state.error = 'Enter a different valid 9-digit opponent Ally Code.'; render(); return; }
  state.loading = true; render();
  try {
    const [mine, enemy, catalog] = await Promise.all([fetchRoster(owner), fetchRoster(opponent), loadCatalog()]);
    state.ownRoster = mine; state.opponentRoster = enemy; state.catalog = catalog; state.opponentCode = opponent;
    localStorage.setItem('swgoh:gac-manual-counter:last-opponent', opponent);
    localStorage.setItem('swgoh:gac-manual-counter:format', state.format);
    loadPairingState(); scheduleEvidenceRefresh();
  } catch (error) { state.error = error?.message || 'Opponent roster could not be loaded.'; }
  finally { state.loading = false; render(); }
}

async function loadOwnRoster() {
  const owner = ownerCode();
  if (!owner) return;
  try { const [roster, catalog] = await Promise.all([fetchRoster(owner), loadCatalog()]); state.ownRoster = roster; state.catalog = catalog; }
  catch { state.ownRoster = null; }
  render();
}

function preserveInputFocus(selector, cursor) {
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
    const own = event.target.closest?.('[data-gac-manual-own-toggle]'); if (own) { toggleOwnDefense(own.dataset.gacManualOwnToggle); return; }
    const enemy = event.target.closest?.('[data-gac-manual-enemy-toggle]'); if (enemy) { toggleEnemyUnit(enemy.dataset.gacManualEnemyToggle); return; }
    const remove = event.target.closest?.('[data-gac-manual-enemy-remove]'); if (remove) { toggleEnemyUnit(remove.dataset.gacManualEnemyRemove); return; }
    const leader = event.target.closest?.('[data-gac-manual-make-leader]'); if (leader && state.enemyEditor) { state.enemyEditor.leaderBaseId = normalizeBaseId(leader.dataset.gacManualMakeLeader); render(); return; }
    if (event.target.closest?.('[data-gac-manual-load]')) { void loadOpponent(); return; }
    const mapAdd = event.target.closest?.('[data-gac-manual-map-add]'); if (mapAdd) { newEnemyEditor(null, mapAdd.dataset.gacManualMapAdd); render(); return; }
    const edit = event.target.closest?.('[data-gac-manual-defense-edit]'); if (edit) { const row = state.defenses.find((value) => value.id === edit.dataset.gacManualDefenseEdit); if (row) newEnemyEditor(row); render(); return; }
    const del = event.target.closest?.('[data-gac-manual-defense-delete]'); if (del) { state.defenses = state.defenses.filter((value) => value.id !== del.dataset.gacManualDefenseDelete); persistPairingState(); scheduleEvidenceRefresh(); render(); return; }
    if (event.target.closest?.('[data-gac-manual-editor-close]')) { state.enemyEditor = null; render(); return; }
    if (event.target.closest?.('[data-gac-manual-editor-save]')) { saveEnemyEditor(); return; }
    if (event.target.closest?.('[data-gac-manual-legacy]')) { state.legacyVisible = !state.legacyVisible; render(); }
  });
  host.addEventListener('input', (event) => {
    if (event.target.matches?.('[data-gac-manual-own-search]')) { state.ownQuery = event.target.value; preserveInputFocus('[data-gac-manual-own-search]', event.target.selectionStart); return; }
    if (event.target.matches?.('[data-gac-manual-enemy-search]') && state.enemyEditor) { state.enemyEditor.query = event.target.value; preserveInputFocus('[data-gac-manual-enemy-search]', event.target.selectionStart); }
  });
  host.addEventListener('change', (event) => {
    if (event.target.matches?.('[data-gac-manual-format]')) { state.format = normalizeFormat(event.target.value); localStorage.setItem('swgoh:gac-manual-counter:format', state.format); loadPairingState(); scheduleEvidenceRefresh(); render(); return; }
    if (event.target.matches?.('[data-gac-manual-own-type]')) { state.ownType = event.target.value === 'ship' ? 'ship' : 'character'; state.ownFaction = 'all'; render(); return; }
    if (event.target.matches?.('[data-gac-manual-own-faction]')) { state.ownFaction = event.target.value || 'all'; render(); return; }
    if (event.target.matches?.('[data-gac-manual-enemy-faction]') && state.enemyEditor) { state.enemyEditor.faction = event.target.value || 'all'; render(); return; }
    if (event.target.matches?.('[data-gac-manual-editor-type]') && state.enemyEditor) { state.enemyEditor.type = event.target.value === 'fleet' ? 'fleet' : 'squad'; state.enemyEditor.zone = state.enemyEditor.type === 'fleet' ? 'BACK-TOP' : 'FRONT-TOP'; state.enemyEditor.members = []; state.enemyEditor.leaderBaseId = ''; state.enemyEditor.query = ''; state.enemyEditor.faction = 'all'; render(); return; }
    if (event.target.matches?.('[data-gac-manual-editor-zone]') && state.enemyEditor) { state.enemyEditor.zone = clean(event.target.value).toUpperCase(); return; }
    if (event.target.matches?.('[data-gac-manual-editor-slot]') && state.enemyEditor) { state.enemyEditor.slot = Math.max(0, Number(event.target.value || 1) - 1); }
  });
  host.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches?.('[data-gac-manual-opponent]')) { event.preventDefault(); void loadOpponent(); } });
}

function injectStyle() {
  if (!document.querySelector('link[data-gac-manual-counter-style]')) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/gac-manual-counter-planner.css?v=20260821-manual2'; link.dataset.gacManualCounterStyle = 'true'; document.head.appendChild(link); }
  if (!document.querySelector('link[data-gac-manual-map-style]')) { const mapLink = document.createElement('link'); mapLink.rel = 'stylesheet'; mapLink.href = '/gac-manual-map-filters.css?v=20260821-map2'; mapLink.dataset.gacManualMapStyle = 'true'; document.head.appendChild(mapLink); }
}

function mount() {
  const legacy = document.querySelector('[data-gacv2-root]');
  if (!legacy) return false;
  let host = document.querySelector('[data-gac-manual-counter-planner]');
  if (!host) { host = document.createElement('section'); host.dataset.gacManualCounterPlanner = 'true'; host.className = 'gac-manual-counter-planner'; legacy.insertAdjacentElement('beforebegin', host); legacy.classList.add('gac-manual-legacy-root'); bind(host); void loadOwnRoster(); }
  render(); return true;
}

function scheduleMount(delay = 80) { setTimeout(() => mount(), Math.max(0, delay)); }

if (typeof document !== 'undefined') {
  injectStyle(); scheduleMount(60);
  document.addEventListener('DOMContentLoaded', () => scheduleMount(80), { once: true });
  window.addEventListener('hashchange', () => scheduleMount(100));
  window.addEventListener('swgoh:workspace-activated', () => scheduleMount(100));
  new MutationObserver(() => { if (!document.querySelector('[data-gac-manual-counter-planner]') && document.querySelector('[data-gacv2-root]')) scheduleMount(20); }).observe(document.documentElement, { childList: true, subtree: true });
}

export { loadOpponent, mount, recommendationMetrics };
