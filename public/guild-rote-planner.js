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

export function roteProgressionGap(unit, requirement) {
  const requiredStars = finite(requirement?.requiredRarity, 0);
  const requiredRelic = requirement?.unitType === "Ship" ? 0 : finite(requirement?.requiredRelic, 0);
  const currentStars = finite(unit?.stars ?? unit?.rarity, 0);
  const currentGear = finite(unit?.gear, 0);
  const currentRelic = finite(unit?.relic, 0);
  const stars = Math.max(0, requiredStars - currentStars);
  const gear = requirement?.unitType === "Character" && requiredRelic > 0 ? Math.max(0, 13 - currentGear) : 0;
  const relic = Math.max(0, requiredRelic - currentRelic);
  const owned = Boolean(unit);
  const score = owned
    ? stars * 100000 + gear * 1000 + relic * 10
    : 1000000 + requiredStars * 100000 + requiredRelic * 10;
  return { owned, stars, gear, relic, score };
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

function reservationKey(memberId, phase, baseId) {
  return `${String(memberId)}|${String(phase || "All")}|${String(baseId)}`;
}

function reservationSetOf(reservations) {
  return new Set(asArray(reservations)
    .filter((entry) => entry?.memberId && entry?.baseId)
    .map((entry) => reservationKey(entry.memberId, entry.phase || "All", entry.baseId)));
}

function isReserved(reservations, memberId, slot) {
  return reservations.has(reservationKey(memberId, slot.phase, slot.baseId))
    || reservations.has(reservationKey(memberId, "All", slot.baseId));
}

function lockMapOf(locks) {
  const map = new Map();
  for (const entry of asArray(locks)) {
    if (!entry?.slotId || !entry?.memberId) continue;
    map.set(String(entry.slotId), String(entry.memberId));
  }
  return map;
}

function eligibleCandidates(slot, memberStates, usedUnits, territoryLoads, maxPerTerritory, reservations) {
  const candidates = [];
  for (const state of memberStates) {
    if (!state.member?.rosterAvailable) continue;
    if (isReserved(reservations, state.id, slot)) continue;
    const unit = state.units.get(String(slot.baseId));
    if (!unitMeetsRoteSlot(unit, slot)) continue;
    if (usedUnits.has(usedUnitKey(state.id, slot.phase, slot.baseId))) continue;
    const territoryLoad = territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0;
    if (territoryLoad >= maxPerTerritory) continue;
    candidates.push({ state, unit, territoryLoad });
  }
  return candidates;
}

function assignmentFrom(slot, chosen, eligibleOwners, availableOwners, locked = false) {
  return {
    ...slot,
    eligibleOwners,
    availableOwners,
    locked,
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
  };
}

function consumeAssignment(chosen, slot, usedUnits, territoryLoads, phaseLoads) {
  usedUnits.add(usedUnitKey(chosen.state.id, slot.phase, slot.baseId));
  const territoryKey = loadKey(chosen.state.id, slot.conflictId);
  territoryLoads.set(territoryKey, (territoryLoads.get(territoryKey) || 0) + 1);
  const phaseKey = `${chosen.state.id}|${slot.phase}`;
  phaseLoads.set(phaseKey, (phaseLoads.get(phaseKey) || 0) + 1);
}

function lockFailureReason(slot, state, unit, reservations, usedUnits, territoryLoads, maxPerTerritory) {
  if (!state) return "Locked member is no longer in the hydrated guild roster.";
  if (!state.member?.rosterAvailable) return "Locked member roster is currently unavailable.";
  if (isReserved(reservations, state.id, slot)) return "Locked unit is reserved for a mission in this phase.";
  if (!unit) return "Locked member does not own this unit.";
  if (!unitMeetsRoteSlot(unit, slot)) return "Locked member does not meet the required stars/relic level.";
  if (usedUnits.has(usedUnitKey(state.id, slot.phase, slot.baseId))) return "Locked member already uses this unit in another Operation this phase.";
  if ((territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0) >= maxPerTerritory) return "Locked member is already at the territory contribution limit.";
  return "Lock could not be applied.";
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
  const memberById = new Map(memberStates.map((state) => [state.id, state]));
  const reservations = reservationSetOf(options.reservations);
  const locks = lockMapOf(options.locks);

  const staticEligibility = new Map();
  const availableEligibility = new Map();
  for (const slot of slots) {
    let physical = 0;
    let available = 0;
    for (const state of memberStates) {
      if (!state.member?.rosterAvailable) continue;
      const unit = state.units.get(String(slot.baseId));
      if (!unitMeetsRoteSlot(unit, slot)) continue;
      physical += 1;
      if (!isReserved(reservations, state.id, slot)) available += 1;
    }
    staticEligibility.set(slot.id, physical);
    availableEligibility.set(slot.id, available);
  }

  const sortedSlots = slots.slice().sort((a, b) => {
    const availableDiff = (availableEligibility.get(a.id) || 0) - (availableEligibility.get(b.id) || 0);
    if (availableDiff) return availableDiff;
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
  const lockIssues = [];
  const handledLocks = new Set();

  for (const slot of slots) {
    const lockedMemberId = locks.get(String(slot.id));
    if (!lockedMemberId) continue;
    handledLocks.add(String(slot.id));
    const state = memberById.get(lockedMemberId);
    const unit = state?.units.get(String(slot.baseId));
    const chosen = state && unit ? { state, unit, territoryLoad: territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0 } : null;
    const reason = lockFailureReason(slot, state, unit, reservations, usedUnits, territoryLoads, maxPerTerritory);
    if (!chosen || reason !== "Lock could not be applied.") {
      lockIssues.push({ slotId: slot.id, memberId: lockedMemberId, phase: slot.phase, baseId: slot.baseId, name: slot.name, reason });
      unfilled.push({
        ...slot,
        eligibleOwners: staticEligibility.get(slot.id) || 0,
        availableOwners: availableEligibility.get(slot.id) || 0,
        locked: true,
        lockIssue: reason,
      });
      continue;
    }
    consumeAssignment(chosen, slot, usedUnits, territoryLoads, phaseLoads);
    assignments.push(assignmentFrom(
      slot,
      chosen,
      staticEligibility.get(slot.id) || 0,
      availableEligibility.get(slot.id) || 0,
      true,
    ));
  }

  for (const slot of sortedSlots) {
    if (handledLocks.has(String(slot.id))) continue;
    const candidates = eligibleCandidates(slot, memberStates, usedUnits, territoryLoads, maxPerTerritory, reservations);
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
      unfilled.push({
        ...slot,
        eligibleOwners: staticEligibility.get(slot.id) || 0,
        availableOwners: availableEligibility.get(slot.id) || 0,
        locked: false,
      });
      continue;
    }

    consumeAssignment(chosen, slot, usedUnits, territoryLoads, phaseLoads);
    assignments.push(assignmentFrom(
      slot,
      chosen,
      staticEligibility.get(slot.id) || 0,
      availableEligibility.get(slot.id) || 0,
      false,
    ));
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
      row = { ...assignment.member, total: 0, locked: 0, phases: {}, territories: {} };
      memberLoads.set(id, row);
    }
    row.total += 1;
    if (assignment.locked) row.locked += 1;
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
        availableOwners: availableEligibility.get(slot.id) || 0,
        assigned: 0,
      };
      scarcity.set(key, row);
    }
    row.demand += 1;
    row.eligibleOwners = Math.min(row.eligibleOwners, staticEligibility.get(slot.id) || 0);
    row.availableOwners = Math.min(row.availableOwners, availableEligibility.get(slot.id) || 0);
  }
  for (const assignment of assignments) {
    const key = `${assignment.phase}|${assignment.baseId}|${assignment.requiredRelic}|${assignment.requiredRarity}`;
    if (scarcity.has(key)) scarcity.get(key).assigned += 1;
  }

  const hydratedCount = memberStates.filter((state) => state.member?.rosterAvailable).length;
  const developmentTargets = [...scarcity.values()]
    .filter((row) => row.eligibleOwners < row.demand)
    .map((row) => {
      const shortage = Math.max(0, row.demand - row.eligibleOwners);
      const candidates = [];
      let ownedCount = 0;
      for (const state of memberStates) {
        if (!state.member?.rosterAvailable) continue;
        const unit = state.units.get(String(row.baseId));
        if (unit) ownedCount += 1;
        if (!unit || unitMeetsRoteSlot(unit, row)) continue;
        const gap = roteProgressionGap(unit, row);
        candidates.push({
          member: {
            playerId: state.member?.playerId || "",
            allyCode: state.member?.allyCode || "",
            name: state.member?.name || state.id,
            galacticPower: finite(state.member?.galacticPower, 0),
          },
          current: {
            stars: finite(unit?.stars, 0),
            gear: finite(unit?.gear, 0),
            relic: finite(unit?.relic, 0),
          },
          gap,
        });
      }
      candidates.sort((a, b) => a.gap.score - b.gap.score || b.member.galacticPower - a.member.galacticPower || a.member.name.localeCompare(b.member.name));
      return {
        ...row,
        shortage,
        ownedCount,
        belowRequirement: candidates.length,
        missingOwnership: Math.max(0, hydratedCount - ownedCount),
        closest: candidates.slice(0, Math.max(5, shortage * 2)),
      };
    })
    .sort((a, b) => {
      if (a.shortage !== b.shortage) return b.shortage - a.shortage;
      const aScore = a.closest[0]?.gap?.score ?? Number.MAX_SAFE_INTEGER;
      const bScore = b.closest[0]?.gap?.score ?? Number.MAX_SAFE_INTEGER;
      if (aScore !== bScore) return aScore - bScore;
      const phaseDiff = phaseNumber(a.phase) - phaseNumber(b.phase);
      if (phaseDiff) return phaseDiff;
      return a.name.localeCompare(b.name);
    });

  return {
    strategy: "scarcity-first-deterministic-draft",
    maxPerTerritory,
    totalSlots: slots.length,
    assignedSlots: assignments.length,
    unfilledSlots: unfilled.length,
    coveragePercent: slots.length ? Math.round((assignments.length / slots.length) * 1000) / 10 : 0,
    hydratedMembers: hydratedCount,
    controls: {
      requestedLocks: locks.size,
      appliedLocks: assignments.filter((assignment) => assignment.locked).length,
      lockIssues,
      reservations: reservations.size,
    },
    assignments: assignments.sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase) || a.conflictId.localeCompare(b.conflictId) || a.squadId.localeCompare(b.squadId) || a.slot - b.slot),
    unfilled: unfilled.sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase) || Number(b.locked) - Number(a.locked) || (a.availableOwners - b.availableOwners) || a.baseId.localeCompare(b.baseId)),
    phases: [...phases.values()].sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase)),
    memberLoads: [...memberLoads.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    developmentTargets,
    scarcity: [...scarcity.values()].sort((a, b) => {
      const aMargin = a.availableOwners - a.demand;
      const bMargin = b.availableOwners - b.demand;
      return aMargin - bMargin || b.demand - a.demand || a.name.localeCompare(b.name);
    }),
  };
}
