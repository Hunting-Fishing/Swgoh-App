import './gac-manual-selection-guard.js';
import { hybridBoardPlan } from './gac-hybrid-board-plan.js';

const SQUAD_ZONES = Object.freeze(['FRONT-TOP', 'FRONT-BOTTOM', 'BACK-BOTTOM']);

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function normalizeBaseId(value) {
  return clean(value).split(':')[0].toUpperCase();
}

function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0, 9);
  return /^\d{9}$/.test(code) ? code : '';
}

function normalizeFormat(value) {
  return Number(value) === 3 || clean(value).toLowerCase() === '3v3' ? '3v3' : '5v5';
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
  const size = squadSize(format);
  const members = normalizeIds(value.members).slice(0, size);
  const leader = normalizeBaseId(value.leaderBaseId || members[0]);
  const zoneInput = clean(value.zone).toUpperCase();
  const zone = SQUAD_ZONES.includes(zoneInput) ? zoneInput : 'FRONT-TOP';
  const slotRaw = Number(value.slot);
  const slot = Number.isInteger(slotRaw) && slotRaw >= 0 ? slotRaw : 0;
  const id = clean(value.id) || `manual-defense-${index + 1}`;
  return Object.freeze({
    id,
    zone,
    slot,
    members: Object.freeze(members),
    leaderBaseId: members.includes(leader) ? leader : (members[0] || ''),
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

function resolveDefenseUnits(defense = {}, opponentRoster = {}) {
  const index = new Map(rosterCharacters(opponentRoster).map((unit) => [normalizeBaseId(unit?.baseId), unit]));
  return (Array.isArray(defense?.members) ? defense.members : []).map((id) => index.get(normalizeBaseId(id))).filter(Boolean);
}

function evidenceMapFromBatch(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : [])
    .map((row) => [normalizeBaseId(row?.enemyLeaderBaseId), row])
    .filter(([id]) => Boolean(id)));
}

function planManualBoard({ ownRoster, opponentRoster, defenses = [], reservedBaseIds = [], evidenceByLeader = new Map(), format = '5v5' } = {}) {
  const normalizedFormat = normalizeFormat(format);
  const size = squadSize(normalizedFormat);
  const normalizedDefenses = defenses.map((row, index) => normalizeDefense(row, normalizedFormat, index)).filter((row) => row.complete);
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

export {
  SQUAD_ZONES,
  evidenceMapFromBatch,
  normalizeAllyCode,
  normalizeBaseId,
  normalizeDefense,
  normalizeFormat,
  normalizePlannerState,
  planManualBoard,
  plannerStorageKey,
  resolveDefenseUnits,
  rosterCharacters,
  squadSize,
  teamStats,
};
