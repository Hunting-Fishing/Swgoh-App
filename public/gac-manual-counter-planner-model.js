import './gac-manual-selection-guard.js';
import { hybridBoardPlan } from './gac-hybrid-board-plan.js';
import { allocateFleetCounters } from './gac-fleet-war-room-model.js';
import { PLAYER_FACTIONS, canonicalFaction, unitPlayerFactions } from './gac-player-facing-factions.js';

const SQUAD_ZONES = Object.freeze(['FRONT-TOP', 'FRONT-BOTTOM', 'BACK-BOTTOM']);
const BOARD_ZONES = Object.freeze([
  Object.freeze({ value: 'BACK-TOP', label: 'Fleet Territory', shortLabel: 'Back Top', type: 'fleet' }),
  Object.freeze({ value: 'FRONT-TOP', label: 'Front Top', shortLabel: 'Front Top', type: 'squad' }),
  Object.freeze({ value: 'BACK-BOTTOM', label: 'Back Bottom', shortLabel: 'Back Bottom', type: 'squad' }),
  Object.freeze({ value: 'FRONT-BOTTOM', label: 'Front Bottom', shortLabel: 'Front Bottom', type: 'squad' }),
]);

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function normalizeBaseId(value) {
  return clean(value?.baseId || value).split(':')[0].toUpperCase();
}

function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? code : '';
}

function normalizeFormat(value) {
  return Number(value) === 3 || clean(value).toLowerCase() === '3v3' ? '3v3' : '5v5';
}

function normalizeDefenseType(value, zone = '') {
  if (clean(zone).toUpperCase() === 'BACK-TOP') return 'fleet';
  return clean(value).toLowerCase() === 'fleet' ? 'fleet' : 'squad';
}

function squadSize(value) {
  return normalizeFormat(value) === '3v3' ? 3 : 5;
}

function normalizeIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeBaseId).filter(Boolean))];
}

function plannerStorageKey({ ownerAllyCode, opponentAllyCode, format } = {}) {
  return `swgoh:gac-manual-counter:v1:${normalizeAllyCode(ownerAllyCode) || 'anonymous'}:${normalizeAllyCode(opponentAllyCode) || 'manual'}:${normalizeFormat(format)}`;
}

function normalizeDefense(value = {}, format = '5v5', index = 0) {
  const zoneInput = clean(value.zone).toUpperCase();
  const type = normalizeDefenseType(value.type, zoneInput);
  const slotRaw = Number(value.slot);
  const slot = Number.isInteger(slotRaw) && slotRaw >= 0 ? slotRaw : 0;
  const id = clean(value.id) || `manual-defense-${index + 1}`;

  if (type === 'fleet') {
    const supplied = normalizeIds(value.members);
    const capital = normalizeBaseId(value.capitalShipBaseId || value.leaderBaseId || supplied[0]);
    const members = normalizeIds([capital, ...supplied]).slice(0, 8);
    const ships = members.filter((member) => member !== capital);
    const submittedStarters = normalizeIds(value.starters).filter((member) => member !== capital);
    const submittedReinforcements = normalizeIds(value.reinforcements).filter((member) => member !== capital);
    const starters = (submittedStarters.length ? submittedStarters : ships.slice(0, 3)).slice(0, 3);
    const starterSet = new Set(starters);
    const reinforcements = (submittedReinforcements.length ? submittedReinforcements : ships.filter((member) => !starterSet.has(member))).slice(0, 4);
    return Object.freeze({
      id,
      type: 'fleet',
      zone: 'BACK-TOP',
      slot,
      members: Object.freeze(members),
      leaderBaseId: capital,
      capitalShipBaseId: capital,
      starters: Object.freeze(starters),
      reinforcements: Object.freeze(reinforcements),
      complete: Boolean(capital) && ships.length >= 3,
      source: 'manual-opponent-board',
    });
  }

  const size = squadSize(format);
  const members = normalizeIds(value.members).slice(0, size);
  const leader = normalizeBaseId(value.leaderBaseId || members[0]);
  const zone = SQUAD_ZONES.includes(zoneInput) ? zoneInput : 'FRONT-TOP';
  return Object.freeze({
    id,
    type: 'squad',
    zone,
    slot,
    members: Object.freeze(members),
    leaderBaseId: members.includes(leader) ? leader : (members[0] || ''),
    capitalShipBaseId: '',
    starters: Object.freeze([]),
    reinforcements: Object.freeze([]),
    complete: members.length === size,
    source: 'manual-opponent-board',
  });
}

function normalizePlannerState(value = {}, format = '5v5') {
  const normalizedFormat = normalizeFormat(format || value.format);
  return Object.freeze({
    format: normalizedFormat,
    reservedBaseIds: Object.freeze(normalizeIds(value.reservedBaseIds)),
    defenses: Object.freeze((Array.isArray(value.defenses) ? value.defenses : []).map((row, index) => normalizeDefense(row, normalizedFormat, index))),
  });
}

function teamStats(units = []) {
  const rows = Array.isArray(units) ? units : [];
  const speeds = rows.map((unit) => n(unit?.speed)).filter((value) => value > 0).sort((a, b) => a - b);
  const medianSpeed = speeds.length
    ? (speeds.length % 2 ? speeds[Math.floor(speeds.length / 2)] : Math.round((speeds[speeds.length / 2 - 1] + speeds[speeds.length / 2]) / 2))
    : null;
  return Object.freeze({
    power: rows.reduce((sum, unit) => sum + n(unit?.power), 0),
    relics: rows.reduce((sum, unit) => sum + n(unit?.relic), 0),
    zetas: rows.reduce((sum, unit) => sum + n(unit?.zetas), 0),
    omicrons: rows.reduce((sum, unit) => sum + n(unit?.omicrons), 0),
    fastestSpeed: speeds.length ? speeds[speeds.length - 1] : null,
    medianSpeed,
  });
}

function rosterCharacters(body = {}) {
  return (Array.isArray(body?.units) ? body.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() !== 'ship');
}

function rosterShips(body = {}) {
  const rows = [
    ...(Array.isArray(body?.ships) ? body.ships : []),
    ...(Array.isArray(body?.units) ? body.units.filter((unit) => clean(unit?.unitType).toLowerCase() === 'ship') : []),
  ];
  const index = new Map();
  for (const unit of rows) {
    const id = normalizeBaseId(unit);
    if (id && !index.has(id)) index.set(id, unit);
  }
  return [...index.values()];
}

function rosterAllUnits(body = {}) {
  return [...rosterCharacters(body), ...rosterShips(body)];
}

function unitFactions(unit = {}) {
  return [...new Set([
    ...(Array.isArray(unit?.factions) ? unit.factions : []),
    ...(Array.isArray(unit?.tags) ? unit.tags : []),
    ...(Array.isArray(unit?.categories) ? unit.categories : []),
  ].map(clean).filter(Boolean))];
}

function availableFactions(_body = {}, _type = 'character') {
  return [...PLAYER_FACTIONS];
}

function filterRosterUnits(body = {}, { type = 'character', query = '', faction = '' } = {}) {
  const rows = clean(type).toLowerCase() === 'ship' ? rosterShips(body) : rosterCharacters(body);
  const needle = clean(query).toLowerCase();
  const canonicalNeedle = canonicalFaction(faction) || clean(faction);
  const factionNeedle = canonicalNeedle.toLowerCase();
  return rows.filter((unit) => {
    if (needle && !clean(unit?.name).toLowerCase().includes(needle) && !normalizeBaseId(unit).toLowerCase().includes(needle)) return false;
    if (factionNeedle && factionNeedle !== 'all') {
      const factions = unitPlayerFactions(unit).map((value) => value.toLowerCase());
      if (!factions.includes(factionNeedle)) return false;
    }
    return true;
  });
}

function resolveDefenseUnits(defense = {}, opponentRoster = {}) {
  const type = normalizeDefenseType(defense?.type, defense?.zone);
  const rows = type === 'fleet' ? rosterShips(opponentRoster) : rosterCharacters(opponentRoster);
  const index = new Map(rows.map((unit) => [normalizeBaseId(unit), unit]));
  return (Array.isArray(defense?.members) ? defense.members : []).map((id) => index.get(normalizeBaseId(id))).filter(Boolean);
}

function evidenceMapFromBatch(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : [])
    .map((row) => [normalizeBaseId(row?.enemyLeaderBaseId), row])
    .filter(([id]) => Boolean(id)));
}

function fleetRosterBody(body = {}) {
  return { ...body, units: rosterAllUnits(body) };
}

function planManualBoard({ ownRoster, opponentRoster, defenses = [], reservedBaseIds = [], evidenceByLeader = new Map(), format = '5v5' } = {}) {
  const normalizedFormat = normalizeFormat(format);
  const size = squadSize(normalizedFormat);
  const normalizedDefenses = defenses
    .map((row, index) => normalizeDefense(row, normalizedFormat, index))
    .filter((row) => row.type === 'squad' && row.complete);
  const entries = normalizedDefenses.map((defense, index) => ({ defenseId: index + 1, defense }));
  const plan = hybridBoardPlan(ownRoster || {}, opponentRoster || {}, entries, evidenceByLeader instanceof Map ? evidenceByLeader : new Map(), {
    size,
    excludeBaseIds: normalizeIds(reservedBaseIds),
  });
  const usedBaseIds = normalizeIds(plan.assignments.flatMap((assignment) => assignment?.recommendation?.squad || []).map((unit) => unit?.baseId));
  return Object.freeze({
    ...plan,
    format: normalizedFormat,
    defenses: Object.freeze(normalizedDefenses),
    reservedBaseIds: Object.freeze(normalizeIds(reservedBaseIds)),
    usedBaseIds: Object.freeze(usedBaseIds),
  });
}

function planManualFleets({ ownRoster, catalog = {}, defenses = [], reservedBaseIds = [], evidence = {}, format = '5v5' } = {}) {
  const normalizedFormat = normalizeFormat(format);
  const normalizedDefenses = defenses
    .map((row, index) => normalizeDefense(row, normalizedFormat, index))
    .filter((row) => row.type === 'fleet' && row.complete)
    .map((row) => Object.freeze({
      ...row,
      members: Object.freeze(row.members),
      starters: Object.freeze(row.starters),
      reinforcements: Object.freeze(row.reinforcements),
    }));
  const plan = allocateFleetCounters(
    fleetRosterBody(ownRoster || {}),
    catalog || {},
    normalizedDefenses,
    evidence || {},
    { reservedBaseIds: normalizeIds(reservedBaseIds) },
  );
  return Object.freeze({
    ...plan,
    format: normalizedFormat,
    defenses: Object.freeze(normalizedDefenses),
    usedBaseIds: Object.freeze(plan.newlyUsedBaseIds || []),
  });
}

export {
  BOARD_ZONES,
  SQUAD_ZONES,
  availableFactions,
  evidenceMapFromBatch,
  filterRosterUnits,
  normalizeAllyCode,
  normalizeBaseId,
  normalizeDefense,
  normalizeDefenseType,
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
  unitFactions,
};
