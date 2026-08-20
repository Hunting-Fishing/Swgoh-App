const FRONT_ZONES = Object.freeze(['FRONT-TOP', 'FRONT-BOTTOM']);
const BACK_ZONES = Object.freeze(['BACK-TOP', 'BACK-BOTTOM']);
const ZONE_SEQUENCE = Object.freeze(['FRONT-TOP', 'FRONT-BOTTOM', 'BACK-BOTTOM', 'BACK-TOP']);

const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function boardKey(defense = {}) {
  const zone = clean(defense?.zone).toUpperCase();
  const slot = Number(defense?.slot);
  return `${zone}|${Number.isInteger(slot) && slot >= 0 ? slot : ''}`;
}

function defaultRevealState() {
  return Object.freeze({
    'FRONT-TOP': true,
    'FRONT-BOTTOM': true,
    'BACK-TOP': false,
    'BACK-BOTTOM': false,
  });
}

function normalizeRevealState(input = {}) {
  const defaults = defaultRevealState();
  return Object.freeze({
    'FRONT-TOP': true,
    'FRONT-BOTTOM': true,
    'BACK-TOP': input?.['BACK-TOP'] === true || defaults['BACK-TOP'],
    'BACK-BOTTOM': input?.['BACK-BOTTOM'] === true || defaults['BACK-BOTTOM'],
  });
}

function territoryModel(rule = {}, zoneInput, defenses = [], revealInput = {}) {
  const zone = clean(zoneInput).toUpperCase();
  const territory = (Array.isArray(rule?.territories) ? rule.territories : []).find((entry) => entry.value === zone) || null;
  if (!territory) return null;
  const reveal = normalizeRevealState(revealInput);
  const revealed = FRONT_ZONES.includes(zone) || reveal[zone] === true;
  const capacity = Math.max(0, Math.floor(n(territory.capacity)));
  const bySlot = new Map((Array.isArray(defenses) ? defenses : [])
    .filter((row) => clean(row?.zone).toUpperCase() === zone)
    .map((row) => [Number(row.slot), row])
    .filter(([slot]) => Number.isInteger(slot) && slot >= 0 && slot < capacity));
  const slots = Array.from({ length: capacity }, (_, slot) => Object.freeze({
    zone,
    slot,
    displaySlot: slot + 1,
    defense: bySlot.get(slot) || null,
    occupied: bySlot.has(slot),
    revealed,
    kind: territory.kind,
  }));
  return Object.freeze({ ...territory, zone, revealed, slots: Object.freeze(slots), entered: bySlot.size, complete: capacity > 0 && bySlot.size === capacity });
}

function boardTerritories(rule = {}, squadDefenses = [], fleetDefenses = [], revealInput = {}) {
  const rows = [];
  for (const territory of Array.isArray(rule?.territories) ? rule.territories : []) {
    rows.push(territoryModel(rule, territory.value, territory.kind === 'fleet' ? fleetDefenses : squadDefenses, revealInput));
  }
  return Object.freeze(rows.filter(Boolean));
}

function validFleetDraft(value = {}) {
  const capitalShipBaseId = normalizeId(value.capitalShipBaseId);
  const starters = [...new Set((Array.isArray(value.starters) ? value.starters : []).map(normalizeId).filter(Boolean))].slice(0, 3);
  const reinforcements = [...new Set((Array.isArray(value.reinforcements) ? value.reinforcements : []).map(normalizeId).filter(Boolean))]
    .filter((id) => !starters.includes(id) && id !== capitalShipBaseId)
    .slice(0, 4);
  const zone = clean(value.zone).toUpperCase() === 'BACK-TOP' ? 'BACK-TOP' : '';
  const slot = Number(value.slot);
  return Object.freeze({
    id: clean(value.id),
    zone,
    slot: Number.isInteger(slot) && slot >= 0 ? slot : null,
    capitalShipBaseId,
    starters: Object.freeze(starters.filter((id) => id !== capitalShipBaseId)),
    reinforcements: Object.freeze(reinforcements),
    source: clean(value.source || 'user-entered-manual-fleet'),
    observedAt: clean(value.observedAt),
    opponentAllyCode: clean(value.opponentAllyCode),
    complete: Boolean(zone && Number.isInteger(slot) && slot >= 0 && capitalShipBaseId && starters.filter((id) => id !== capitalShipBaseId).length === 3),
  });
}

function planUsedIds(plan = {}) {
  const ids = new Set();
  for (const assignment of Array.isArray(plan?.assignments) ? plan.assignments : []) {
    for (const unit of Array.isArray(assignment?.recommendation?.squad) ? assignment.recommendation.squad : []) {
      const id = normalizeId(unit?.baseId || unit);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function rosterAvailability(ownerRoster = {}, plan = {}, reservedBaseIds = []) {
  const reserved = new Set((Array.isArray(reservedBaseIds) ? reservedBaseIds : []).map(normalizeId).filter(Boolean));
  const allocated = planUsedIds(plan);
  const rows = (Array.isArray(ownerRoster?.units) ? ownerRoster.units : [])
    .filter((unit) => clean(unit?.unitType).toLowerCase() !== 'ship')
    .map((unit) => {
      const baseId = normalizeId(unit?.baseId);
      const status = reserved.has(baseId) ? 'reserved' : allocated.has(baseId) ? 'allocated' : 'available';
      return Object.freeze({ baseId, unit, status });
    })
    .filter((row) => row.baseId)
    .sort((a, b) => {
      const rank = { allocated: 0, reserved: 1, available: 2 };
      return rank[a.status] - rank[b.status] || n(b.unit?.power) - n(a.unit?.power) || clean(a.unit?.name).localeCompare(clean(b.unit?.name));
    });
  const counts = Object.freeze({
    allocated: rows.filter((row) => row.status === 'allocated').length,
    reserved: rows.filter((row) => row.status === 'reserved').length,
    available: rows.filter((row) => row.status === 'available').length,
  });
  return Object.freeze({ rows: Object.freeze(rows), counts });
}

function assignmentIndex(defenses = [], plan = {}) {
  const sorted = (Array.isArray(defenses) ? defenses : []).slice().sort((a, b) => clean(a.zone).localeCompare(clean(b.zone)) || n(a.slot) - n(b.slot));
  const map = new Map();
  for (let index = 0; index < sorted.length; index += 1) {
    const assignment = (Array.isArray(plan?.assignments) ? plan.assignments : []).find((row) => Number(row?.sourceIndex) === index) || plan?.assignments?.[index] || null;
    if (assignment) map.set(boardKey(sorted[index]), assignment);
  }
  return map;
}

function proposedAttackOrder(defenses = [], plan = {}, revealInput = {}) {
  const reveal = normalizeRevealState(revealInput);
  const assignments = assignmentIndex(defenses, plan);
  const zoneRank = new Map(ZONE_SEQUENCE.map((zone, index) => [zone, index]));
  const sourceRank = (assignment) => assignment?.source === 'historical-counter-evidence' ? 0 : assignment?.recommendation?.squad?.length ? 1 : 2;
  const rows = (Array.isArray(defenses) ? defenses : [])
    .filter((defense) => {
      const zone = clean(defense?.zone).toUpperCase();
      return FRONT_ZONES.includes(zone) || reveal[zone] === true;
    })
    .map((defense) => {
      const assignment = assignments.get(boardKey(defense)) || null;
      const recommendation = assignment?.recommendation || null;
      return {
        zone: clean(defense.zone).toUpperCase(),
        slot: Number(defense.slot),
        defense,
        assignment,
        recommendation,
        source: assignment?.source || 'unassigned',
        alternativesRemaining: n(assignment?.alternativesRemaining),
      };
    })
    .sort((a, b) => {
      const zone = (zoneRank.get(a.zone) ?? 99) - (zoneRank.get(b.zone) ?? 99);
      if (zone) return zone;
      const source = sourceRank(a.assignment) - sourceRank(b.assignment);
      if (source) return source;
      if (a.alternativesRemaining !== b.alternativesRemaining) return a.alternativesRemaining - b.alternativesRemaining;
      return a.slot - b.slot;
    })
    .map((row, index) => Object.freeze({ ...row, order: index + 1 }));
  return Object.freeze(rows);
}

function territoryProgress(territory = {}) {
  const capacity = Math.max(0, n(territory.capacity));
  const entered = Math.max(0, n(territory.entered));
  return Object.freeze({
    capacity,
    entered,
    percent: capacity > 0 ? Math.min(100, Math.round((entered / capacity) * 1000) / 10) : 0,
    complete: capacity > 0 && entered >= capacity,
  });
}

export {
  BACK_ZONES,
  FRONT_ZONES,
  ZONE_SEQUENCE,
  assignmentIndex,
  boardKey,
  boardTerritories,
  defaultRevealState,
  normalizeRevealState,
  planUsedIds,
  proposedAttackOrder,
  rosterAvailability,
  territoryModel,
  territoryProgress,
  validFleetDraft,
};