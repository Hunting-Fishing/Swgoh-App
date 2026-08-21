const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];

function uniqueIds(values = []) {
  return [...new Set(asArray(values).map((value) => normalizeId(value?.baseId || value)).filter(Boolean))];
}

function exactSlot(value) {
  if (value === null || value === undefined || value === '') return null;
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

function defenseDatacronTruth(defense = {}) {
  const state = clean(defense?.datacronState).toLowerCase();
  const id = clean(defense?.datacron?.id);
  if (state === 'assigned' && id) return Object.freeze({ state: 'assigned', id, exact: true, label: `Assigned · ${id.slice(-8)}` });
  if (state === 'none') return Object.freeze({ state: 'none', id: '', exact: true, label: 'Confirmed none' });
  return Object.freeze({ state: 'unknown', id: '', exact: false, label: 'Not confirmed' });
}

function attackerDatacronTruth(assignment = {}, roster = {}) {
  const id = clean(assignment?.datacron?.id);
  if (!id) return Object.freeze({ state: 'none', id: '', exact: true, current: true, label: 'No attacker Datacron locked' });
  if (!Array.isArray(roster?.datacrons)) {
    return Object.freeze({ state: 'assigned', id, exact: false, current: false, label: `Locked DC ${id.slice(-8)} · live inventory unavailable` });
  }
  const current = roster.datacrons.some((row) => clean(row?.id) === id);
  return Object.freeze({
    state: 'assigned',
    id,
    exact: current,
    current,
    label: current ? `Assigned · ${id.slice(-8)}` : `Locked DC ${id.slice(-8)} · no longer in live inventory`,
  });
}

function rosterUnitIndex(roster = {}) {
  return new Map(asArray(roster?.units).map((unit) => [normalizeId(unit?.baseId), unit]).filter(([id]) => id));
}

function ownDefenseIds(defenses = []) {
  return new Set(asArray(defenses).flatMap((row) => uniqueIds(row?.members)));
}

function executionFingerprint(assignment = {}, defense = {}) {
  const defenderDc = defenseDatacronTruth(defense);
  return Object.freeze({
    version: 'b08-v1',
    assignmentId: Number(assignment?.id) || null,
    defenseId: Number(assignment?.defenseId || defense?.id) || null,
    zone: clean(defense?.zone),
    slot: exactSlot(defense?.slot),
    attackerLeaderBaseId: normalizeId(assignment?.leaderBaseId),
    attackerMembers: Object.freeze(uniqueIds(assignment?.members)),
    attackerDatacronId: clean(assignment?.datacron?.id),
    defenderLeaderBaseId: normalizeId(defense?.leaderBaseId),
    defenderMembers: Object.freeze(uniqueIds(defense?.members)),
    defenderDatacronState: defenderDc.state,
    defenderDatacronId: defenderDc.id,
  });
}

function checklistRow(code, label, status, detail, blocker = false) {
  return Object.freeze({ code, label, status, detail, blocker: blocker === true });
}

function buildExecutionChecklist({ assignment = {}, defense = {}, roster = {}, ownDefenses = [], rosterIntegrity = null } = {}) {
  const status = clean(assignment?.status).toLowerCase();
  const members = uniqueIds(assignment?.members);
  const liveUnits = rosterUnitIndex(roster);
  const missing = members.filter((id) => !liveUnits.has(id));
  const reserved = ownDefenseIds(ownDefenses);
  const overlap = members.filter((id) => reserved.has(id));
  const defenderDc = defenseDatacronTruth(defense);
  const attackerDc = attackerDatacronTruth(assignment, roster);
  const expectedSize = asArray(defense?.members).length === 3 ? 3 : asArray(defense?.members).length === 5 ? 5 : 0;
  const slot = exactSlot(defense?.slot);
  const exactDefense = Boolean(Number(assignment?.defenseId) > 0 && Number(defense?.id) === Number(assignment?.defenseId) && expectedSize > 0 && clean(defense?.zone) && slot !== null);
  const exactAttack = Boolean(expectedSize > 0 && members.length === expectedSize && members.includes(normalizeId(assignment?.leaderBaseId)));
  const rosterTruthStatus = clean(rosterIntegrity?.status).toLowerCase();
  const rows = [
    checklistRow('plan', 'Canonical attack lock', status === 'planned' ? 'pass' : 'block', status === 'planned' ? 'Assignment is locked in the verified current round.' : `Assignment status is ${status || 'unknown'}.`, status !== 'planned'),
    checklistRow('defense', 'Exact saved defense', exactDefense ? 'pass' : 'block', exactDefense ? `${clean(defense?.zone)} · slot ${slot + 1}` : 'Saved defense identity, zone, or slot is unavailable or changed.', !exactDefense),
    checklistRow('defender-dc', 'Enemy Datacron truth', defenderDc.exact ? 'pass' : 'block', defenderDc.label, !defenderDc.exact),
    checklistRow('attack', 'Exact attacker squad + leader', exactAttack ? 'pass' : 'block', exactAttack ? `${members.length} locked attackers · leader ${normalizeId(assignment?.leaderBaseId)}` : 'Locked attacker composition is incomplete.', !exactAttack),
    checklistRow('roster', 'Attackers in current roster', missing.length ? 'block' : 'pass', missing.length ? `Missing: ${missing.join(', ')}` : 'Every locked attacker exists in the current roster.', missing.length > 0),
    checklistRow('reserve', 'Own-defense resource boundary', overlap.length ? 'block' : 'pass', overlap.length ? `Reserved on defense: ${overlap.join(', ')}` : 'No locked attacker is on verified own defense.', overlap.length > 0),
    checklistRow('attacker-dc', 'Attacker Datacron lock', attackerDc.exact ? 'pass' : 'block', attackerDc.label, !attackerDc.exact),
    checklistRow('roster-truth', 'Roster truth gate', rosterTruthStatus === 'blocked' ? 'block' : rosterTruthStatus === 'warn' ? 'warn' : rosterTruthStatus === 'good' ? 'pass' : 'warn', rosterTruthStatus === 'blocked' ? 'B06 roster truth is blocked.' : rosterTruthStatus === 'warn' ? 'B06 reports stale/partial roster warnings; server preflight will revalidate.' : rosterTruthStatus === 'good' ? 'B06 live roster truth is verified.' : 'Roster truth status is not currently exposed; server preflight remains authoritative.', rosterTruthStatus === 'blocked'),
  ];
  const blockers = rows.filter((row) => row.blocker);
  return Object.freeze({
    readyForConfirmation: blockers.length === 0,
    rows: Object.freeze(rows),
    blockers: Object.freeze(blockers),
    fingerprint: executionFingerprint(assignment, defense),
    defenderDatacron: defenderDc,
    attackerDatacron: attackerDc,
  });
}

const REQUIRED_CONFIRMATIONS = Object.freeze(['defense', 'defenderDatacron', 'attack', 'attackerDatacron']);

function executionReady(checklist = {}, confirmations = {}) {
  if (checklist?.readyForConfirmation !== true) return false;
  return REQUIRED_CONFIRMATIONS.every((key) => confirmations?.[key] === true);
}

export {
  REQUIRED_CONFIRMATIONS,
  attackerDatacronTruth,
  buildExecutionChecklist,
  defenseDatacronTruth,
  exactSlot,
  executionFingerprint,
  executionReady,
  normalizeId,
  uniqueIds,
};
