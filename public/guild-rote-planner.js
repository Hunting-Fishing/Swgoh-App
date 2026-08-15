function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unitMap(member) {
  return new Map(asArray(member?.units).filter((unit) => unit?.baseId).map((unit) => [String(unit.baseId), unit]));
}

export function unitMeetsRoteSlot(unit, slot) {
  if (!unit || !slot) return false;
  const stars = finite(unit.stars ?? unit.rarity, 0);
  if (stars < finite(slot.requiredRarity, 0)) return false;
  if (slot.unitType === "Ship") return true;
  return finite(unit.relic, 0) >= finite(slot.requiredRelic, 0);
}

function progressionSurplus(unit, slot) {
  if (slot.unitType === "Ship") return Math.max(0, finite(unit.stars, 0) - finite(slot.requiredRarity, 0));
  return Math.max(0, finite(unit.relic, 0) - finite(slot.requiredRelic, 0));
}

function phaseNumber(phase) {
  const match = String(phase || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function slotDifficulty(slot) {
  return slot.unitType === "Ship" ? finite(slot.requiredRarity, 0) : finite(slot.requiredRelic, 0);
}

function loadKey(memberId, conflictId) {
  return `${memberId}|${conflictId}`;
}

function usedUnitKey(memberId, phase, baseId) {
  return `${memberId}|${phase}|${baseId}`;
}

function candidateIdentity(member, index) {
  return String(member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function eligibleCandidates(slot, memberStates, usedUnits, territoryLoads, maxPerTerritory) {
  const candidates = [];
  for (const state of memberStates) {
    if (!state.member?.rosterAvailable) continue;
    const unit = state.units.get(String(slot.baseId));
    if (!unitMeetsRoteSlot(unit, slot)) continue;
    if (usedUnits.has(usedUnitKey(state.id, slot.phase, slot.baseId))) continue;
    const territoryLoad = territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0;
    if (territoryLoad >= maxPerTerritory) continue;
    candidates.push({ state, unit, territoryLoad });
  }
  return candidates;
}

export function planGuildRoteAssignments(guildSnapshot, operations, options = {}) {
  const maxPerTerritory = Math.max(1, Math.floor(finite(options.maxPerTerritory, 10)));
  const members = asArray(guildSnapshot?.members);
  const slots = asArray(operations?.slots).map((slot, index) => ({ ...slot, __index: index }));
  const memberStates = members.map((member, index) => ({
    member,
    id: candidateIdentity(member, index),
    units: unitMap(member),
  }));

  const staticEligibility = new Map();
  for (const slot of slots) {
    const count = memberStates.reduce((sum, state) => {
      if (!state.member?.rosterAvailable) return sum;
      return sum + (unitMeetsRoteSlot(state.units.get(String(slot.baseId)), slot) ? 1 : 0);
    }, 0);
    staticEligibility.set(slot.id, count);
  }

  const sortedSlots = slots.slice().sort((a, b) => {
    const eligibleDiff = (staticEligibility.get(a.id) || 0) - (staticEligibility.get(b.id) || 0);
    if (eligibleDiff) return eligibleDiff;
    const difficultyDiff = slotDifficulty(b) - slotDifficulty(a);
    if (difficultyDiff) return difficultyDiff;
    const phaseDiff = phaseNumber(a.phase) - phaseNumber(b.phase);
    if (phaseDiff) return phaseDiff;
    return a.__index - b.__index;
  });

  const usedUnits = new Set();
  const territoryLoads = new Map();
  const phaseLoads = new Map();
  const assignments = [];
  const unfilled = [];

  for (const slot of sortedSlots) {
    const candidates = eligibleCandidates(slot, memberStates, usedUnits, territoryLoads, maxPerTerritory);
    candidates.sort((a, b) => {
      const territoryDiff = a.territoryLoad - b.territoryLoad;
      if (territoryDiff) return territoryDiff;
      const aPhase = phaseLoads.get(`${a.state.id}|${slot.phase}`) || 0;
      const bPhase = phaseLoads.get(`${b.state.id}|${slot.phase}`) || 0;
      if (aPhase !== bPhase) return aPhase - bPhase;
      const surplusDiff = progressionSurplus(a.unit, slot) - progressionSurplus(b.unit, slot);
      if (surplusDiff) return surplusDiff;
      const gpDiff = finite(b.state.member?.galacticPower, 0) - finite(a.state.member?.galacticPower, 0);
      if (gpDiff) return gpDiff;
      return String(a.state.member?.name || a.state.id).localeCompare(String(b.state.member?.name || b.state.id));
    });

    const chosen = candidates[0];
    if (!chosen) {
      unfilled.push({ ...slot, eligibleOwners: staticEligibility.get(slot.id) || 0 });
      continue;
    }

    usedUnits.add(usedUnitKey(chosen.state.id, slot.phase, slot.baseId));
    const territoryKey = loadKey(chosen.state.id, slot.conflictId);
    territoryLoads.set(territoryKey, (territoryLoads.get(territoryKey) || 0) + 1);
    const phaseKey = `${chosen.state.id}|${slot.phase}`;
    phaseLoads.set(phaseKey, (phaseLoads.get(phaseKey) || 0) + 1);
    assignments.push({
      ...slot,
      eligibleOwners: staticEligibility.get(slot.id) || 0,
      member: {
        playerId: chosen.state.member?.playerId || "",
        allyCode: chosen.state.member?.allyCode || "",
        name: chosen.state.member?.name || chosen.state.id,
        galacticPower: finite(chosen.state.member?.galacticPower, 0),
      },
      owned: {
        stars: finite(chosen.unit?.stars, 0),
        gear: finite(chosen.unit?.gear, 0),
        relic: finite(chosen.unit?.relic, 0),
      },
    });
  }

  const phases = new Map();
  for (const slot of slots) {
    if (!phases.has(slot.phase)) phases.set(slot.phase, { phase: slot.phase, total: 0, assigned: 0, unfilled: 0 });
    phases.get(slot.phase).total += 1;
  }
  for (const assignment of assignments) phases.get(assignment.phase).assigned += 1;
  for (const slot of unfilled) phases.get(slot.phase).unfilled += 1;

  const memberLoads = new Map();
  for (const assignment of assignments) {
    const id = String(assignment.member.playerId || assignment.member.allyCode || assignment.member.name);
    let row = memberLoads.get(id);
    if (!row) {
      row = { ...assignment.member, total: 0, phases: {}, territories: {} };
      memberLoads.set(id, row);
    }
    row.total += 1;
    row.phases[assignment.phase] = (row.phases[assignment.phase] || 0) + 1;
    row.territories[assignment.conflictId] = (row.territories[assignment.conflictId] || 0) + 1;
  }

  const scarcity = new Map();
  for (const slot of slots) {
    const key = `${slot.phase}|${slot.baseId}|${slot.requiredRelic}|${slot.requiredRarity}`;
    let row = scarcity.get(key);
    if (!row) {
      row = {
        phase: slot.phase,
        baseId: slot.baseId,
        name: slot.name,
        unitType: slot.unitType,
        requiredRelic: slot.requiredRelic,
        requiredRarity: slot.requiredRarity,
        demand: 0,
        eligibleOwners: staticEligibility.get(slot.id) || 0,
        assigned: 0,
      };
      scarcity.set(key, row);
    }
    row.demand += 1;
    row.eligibleOwners = Math.min(row.eligibleOwners, staticEligibility.get(slot.id) || 0);
  }
  for (const assignment of assignments) {
    const key = `${assignment.phase}|${assignment.baseId}|${assignment.requiredRelic}|${assignment.requiredRarity}`;
    if (scarcity.has(key)) scarcity.get(key).assigned += 1;
  }

  return {
    strategy: "scarcity-first-deterministic-draft",
    maxPerTerritory,
    totalSlots: slots.length,
    assignedSlots: assignments.length,
    unfilledSlots: unfilled.length,
    coveragePercent: slots.length ? Math.round((assignments.length / slots.length) * 1000) / 10 : 0,
    hydratedMembers: members.filter((member) => member?.rosterAvailable).length,
    assignments: assignments.sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase) || a.conflictId.localeCompare(b.conflictId) || a.squadId.localeCompare(b.squadId) || a.slot - b.slot),
    unfilled: unfilled.sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase) || (a.eligibleOwners - b.eligibleOwners) || a.baseId.localeCompare(b.baseId)),
    phases: [...phases.values()].sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase)),
    memberLoads: [...memberLoads.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    scarcity: [...scarcity.values()].sort((a, b) => {
      const aMargin = a.eligibleOwners - a.demand;
      const bMargin = b.eligibleOwners - b.demand;
      return aMargin - bMargin || b.demand - a.demand || a.name.localeCompare(b.name);
    }),
  };
}
