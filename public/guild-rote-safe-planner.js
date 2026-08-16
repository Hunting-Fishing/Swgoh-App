import { roteProgressionGap, unitMeetsRoteSlot } from "./guild-rote-planner.js";

const asArray = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function memberId(member, index = 0) {
  return String(member?.playerId || member?.allyCode || member?.name || `member-${index + 1}`);
}

function unitMap(member) {
  return new Map(asArray(member?.units).filter((unit) => unit?.baseId).map((unit) => [String(unit.baseId), unit]));
}

function loadKey(memberIdValue, conflictId) {
  return `${memberIdValue}|${String(conflictId)}`;
}

function usedUnitKey(memberIdValue, phase, baseId) {
  return `${memberIdValue}|${String(phase)}|${String(baseId)}`;
}

function phaseNumber(phase) {
  const match = String(phase || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function slotDifficulty(slot) {
  return slot.unitType === "Ship" ? finite(slot.requiredRarity, 0) : finite(slot.requiredRelic, 0);
}

function progressionSurplus(unit, slot) {
  if (slot.unitType === "Ship") return Math.max(0, finite(unit?.stars, 0) - finite(slot.requiredRarity, 0));
  return Math.max(0, finite(unit?.relic, 0) - finite(slot.requiredRelic, 0));
}

function reservationKey(memberIdValue, phase, baseId) {
  return `${String(memberIdValue)}|${String(phase || "All")}|${String(baseId)}`;
}

function reservationSetOf(reservations) {
  return new Set(asArray(reservations)
    .filter((row) => row?.memberId && row?.baseId)
    .map((row) => reservationKey(row.memberId, row.phase || "All", row.baseId)));
}

function isReserved(reservations, memberIdValue, slot) {
  return reservations.has(reservationKey(memberIdValue, slot.phase, slot.baseId))
    || reservations.has(reservationKey(memberIdValue, "All", slot.baseId));
}

function lockMapOf(locks) {
  const map = new Map();
  for (const row of asArray(locks)) {
    if (row?.slotId && row?.memberId) map.set(String(row.slotId), String(row.memberId));
  }
  return map;
}

export function normalizeDonationPreference(value) {
  const preference = String(value || "default").toLowerCase();
  return preference === "give" || preference === "keep" ? preference : "default";
}

function preferenceMapOf(preferences) {
  const map = new Map();
  for (const row of asArray(preferences)) {
    if (!row?.memberId || !row?.baseId) continue;
    const preference = normalizeDonationPreference(row.preference);
    const key = `${String(row.memberId)}|${String(row.baseId)}`;
    if (preference === "default") map.delete(key);
    else map.set(key, preference);
  }
  return map;
}

function ignoredMemberSetOf(rows) {
  return new Set(asArray(rows).map((row) => typeof row === "string" ? row : row?.memberId).map(String).filter(Boolean));
}

function protectionMapOf(rows) {
  const map = new Map();
  for (const row of asArray(rows)) {
    if (!row?.memberId || !row?.baseId || !row?.phase) continue;
    map.set(`${String(row.memberId)}|${String(row.phase)}|${String(row.baseId)}`, row);
  }
  return map;
}

function candidateSafety(state, slot, preferences, protections) {
  const preference = preferences.get(`${state.id}|${String(slot.baseId)}`) || "default";
  const protection = protections.get(`${state.id}|${String(slot.phase)}|${String(slot.baseId)}`) || null;
  const severity = finite(protection?.severity, 0);

  let rank = 10;
  if (preference === "give") rank = 0;
  else if (preference === "keep") rank = 90 + Math.min(9, Math.round(severity / 12));
  else if (protection) rank = severity >= 80 ? 60 : severity >= 50 ? 45 : 30;

  const status = preference === "keep"
    ? "KEEP OVERRIDE"
    : preference === "give"
      ? "GIVE"
      : protection
        ? "MISSION PROTECTED OVERRIDE"
        : "SAFE";

  return Object.freeze({
    preference,
    protection,
    severity,
    rank,
    status,
    help: preference === "keep" || Boolean(protection),
  });
}

function eligibleCandidates(slot, memberStates, usedUnits, territoryLoads, maxPerTerritory, reservations, ignoredMembers, preferences, protections) {
  const candidates = [];
  for (const state of memberStates) {
    if (!state.member?.rosterAvailable || ignoredMembers.has(state.id)) continue;
    if (isReserved(reservations, state.id, slot)) continue;
    const unit = state.units.get(String(slot.baseId));
    if (!unitMeetsRoteSlot(unit, slot)) continue;
    if (usedUnits.has(usedUnitKey(state.id, slot.phase, slot.baseId))) continue;
    const territoryLoad = territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0;
    if (territoryLoad >= maxPerTerritory) continue;
    candidates.push({ state, unit, territoryLoad, safety: candidateSafety(state, slot, preferences, protections) });
  }
  return candidates;
}

function compareCandidates(a, b, slot, phaseLoads) {
  if (a.safety.rank !== b.safety.rank) return a.safety.rank - b.safety.rank;
  if (a.territoryLoad !== b.territoryLoad) return a.territoryLoad - b.territoryLoad;
  const aPhase = phaseLoads.get(`${a.state.id}|${slot.phase}`) || 0;
  const bPhase = phaseLoads.get(`${b.state.id}|${slot.phase}`) || 0;
  if (aPhase !== bPhase) return aPhase - bPhase;
  const surplus = progressionSurplus(a.unit, slot) - progressionSurplus(b.unit, slot);
  if (surplus) return surplus;
  const gp = finite(b.state.member?.galacticPower, 0) - finite(a.state.member?.galacticPower, 0);
  if (gp) return gp;
  return String(a.state.member?.name || a.state.id).localeCompare(String(b.state.member?.name || b.state.id));
}

function assignmentFrom(slot, chosen, counts, locked = false) {
  return {
    ...slot,
    eligibleOwners: counts.physical,
    availableOwners: counts.available,
    safeOwners: counts.safe,
    locked,
    safety: chosen.safety,
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

function lockFailureReason(slot, state, unit, reservations, ignoredMembers, usedUnits, territoryLoads, maxPerTerritory) {
  if (!state) return "Locked member is no longer in the hydrated guild roster.";
  if (!state.member?.rosterAvailable) return "Locked member roster is currently unavailable.";
  if (ignoredMembers.has(state.id)) return "Locked member is currently ignored for TB Operations.";
  if (isReserved(reservations, state.id, slot)) return "Locked unit is hard-reserved for a mission in this phase.";
  if (!unit) return "Locked member does not own this unit.";
  if (!unitMeetsRoteSlot(unit, slot)) return "Locked member does not meet the required stars/relic level.";
  if (usedUnits.has(usedUnitKey(state.id, slot.phase, slot.baseId))) return "Locked member already uses this unit in another Operation this phase.";
  if ((territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0) >= maxPerTerritory) return "Locked member is already at the territory contribution limit.";
  return "";
}

function countOwners(slot, memberStates, reservations, ignoredMembers, preferences, protections) {
  let physical = 0;
  let available = 0;
  let safe = 0;
  for (const state of memberStates) {
    if (!state.member?.rosterAvailable) continue;
    const unit = state.units.get(String(slot.baseId));
    if (!unitMeetsRoteSlot(unit, slot)) continue;
    physical += 1;
    if (ignoredMembers.has(state.id) || isReserved(reservations, state.id, slot)) continue;
    available += 1;
    const safety = candidateSafety(state, slot, preferences, protections);
    if (safety.rank <= 10) safe += 1;
  }
  return { physical, available, safe };
}

function makeDevelopmentTargets(scarcityRows, memberStates, hydratedCount) {
  return scarcityRows
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
          current: { stars: finite(unit?.stars, 0), gear: finite(unit?.gear, 0), relic: finite(unit?.relic, 0) },
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
    .sort((a, b) => b.shortage - a.shortage || (a.closest[0]?.gap?.score ?? Number.MAX_SAFE_INTEGER) - (b.closest[0]?.gap?.score ?? Number.MAX_SAFE_INTEGER) || phaseNumber(a.phase) - phaseNumber(b.phase) || String(a.name).localeCompare(String(b.name)));
}

export function planGuildRoteSafeAssignments(guildSnapshot, operations, options = {}) {
  const maxPerTerritory = Math.max(1, Math.floor(finite(options.maxPerTerritory, 10)));
  const members = asArray(guildSnapshot?.members);
  const slots = asArray(operations?.slots).map((slot, index) => ({ ...slot, __index: index }));
  const memberStates = members.map((member, index) => ({ member, id: memberId(member, index), units: unitMap(member) }));
  const memberById = new Map(memberStates.map((state) => [state.id, state]));
  const reservations = reservationSetOf(options.reservations);
  const locks = lockMapOf(options.locks);
  const preferences = preferenceMapOf(options.preferences);
  const ignoredMembers = ignoredMemberSetOf(options.ignoredMembers);
  const protections = protectionMapOf(options.protections);

  const ownerCounts = new Map(slots.map((slot) => [slot.id, countOwners(slot, memberStates, reservations, ignoredMembers, preferences, protections)]));
  const sortedSlots = slots.slice().sort((a, b) => {
    const ac = ownerCounts.get(a.id) || {};
    const bc = ownerCounts.get(b.id) || {};
    const safeDiff = finite(ac.safe) - finite(bc.safe);
    if (safeDiff) return safeDiff;
    const availableDiff = finite(ac.available) - finite(bc.available);
    if (availableDiff) return availableDiff;
    const physicalDiff = finite(ac.physical) - finite(bc.physical);
    if (physicalDiff) return physicalDiff;
    const difficulty = slotDifficulty(b) - slotDifficulty(a);
    if (difficulty) return difficulty;
    const phase = phaseNumber(a.phase) - phaseNumber(b.phase);
    return phase || a.__index - b.__index;
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
    const reason = lockFailureReason(slot, state, unit, reservations, ignoredMembers, usedUnits, territoryLoads, maxPerTerritory);
    const counts = ownerCounts.get(slot.id) || { physical: 0, available: 0, safe: 0 };
    if (reason) {
      lockIssues.push({ slotId: slot.id, memberId: lockedMemberId, phase: slot.phase, baseId: slot.baseId, name: slot.name, reason });
      unfilled.push({ ...slot, eligibleOwners: counts.physical, availableOwners: counts.available, safeOwners: counts.safe, locked: true, lockIssue: reason });
      continue;
    }
    const chosen = { state, unit, territoryLoad: territoryLoads.get(loadKey(state.id, slot.conflictId)) || 0, safety: candidateSafety(state, slot, preferences, protections) };
    consumeAssignment(chosen, slot, usedUnits, territoryLoads, phaseLoads);
    assignments.push(assignmentFrom(slot, chosen, counts, true));
  }

  for (const slot of sortedSlots) {
    if (handledLocks.has(String(slot.id))) continue;
    const counts = ownerCounts.get(slot.id) || { physical: 0, available: 0, safe: 0 };
    const candidates = eligibleCandidates(slot, memberStates, usedUnits, territoryLoads, maxPerTerritory, reservations, ignoredMembers, preferences, protections);
    candidates.sort((a, b) => compareCandidates(a, b, slot, phaseLoads));
    const chosen = candidates[0];
    if (!chosen) {
      unfilled.push({ ...slot, eligibleOwners: counts.physical, availableOwners: counts.available, safeOwners: counts.safe, locked: false });
      continue;
    }
    consumeAssignment(chosen, slot, usedUnits, territoryLoads, phaseLoads);
    assignments.push(assignmentFrom(slot, chosen, counts, false));
  }

  const phases = new Map();
  for (const slot of slots) {
    if (!phases.has(slot.phase)) phases.set(slot.phase, { phase: slot.phase, total: 0, assigned: 0, unfilled: 0 });
    phases.get(slot.phase).total += 1;
  }
  for (const assignment of assignments) phases.get(assignment.phase).assigned += 1;
  for (const row of unfilled) phases.get(row.phase).unfilled += 1;

  const memberLoads = new Map();
  for (const assignment of assignments) {
    const id = String(assignment.member.playerId || assignment.member.allyCode || assignment.member.name);
    let row = memberLoads.get(id);
    if (!row) {
      row = { ...assignment.member, total: 0, locked: 0, give: 0, risky: 0, phases: {}, territories: {} };
      memberLoads.set(id, row);
    }
    row.total += 1;
    if (assignment.locked) row.locked += 1;
    if (assignment.safety?.preference === "give") row.give += 1;
    if (assignment.safety?.help) row.risky += 1;
    row.phases[assignment.phase] = (row.phases[assignment.phase] || 0) + 1;
    row.territories[assignment.conflictId] = (row.territories[assignment.conflictId] || 0) + 1;
  }

  const scarcity = new Map();
  for (const slot of slots) {
    const counts = ownerCounts.get(slot.id) || { physical: 0, available: 0, safe: 0 };
    const key = `${slot.phase}|${slot.baseId}|${slot.requiredRelic}|${slot.requiredRarity}`;
    let row = scarcity.get(key);
    if (!row) {
      row = { phase: slot.phase, baseId: slot.baseId, name: slot.name, unitType: slot.unitType, requiredRelic: slot.requiredRelic, requiredRarity: slot.requiredRarity, demand: 0, eligibleOwners: counts.physical, availableOwners: counts.available, safeOwners: counts.safe, assigned: 0 };
      scarcity.set(key, row);
    }
    row.demand += 1;
    row.eligibleOwners = Math.min(row.eligibleOwners, counts.physical);
    row.availableOwners = Math.min(row.availableOwners, counts.available);
    row.safeOwners = Math.min(row.safeOwners, counts.safe);
  }
  for (const assignment of assignments) {
    const key = `${assignment.phase}|${assignment.baseId}|${assignment.requiredRelic}|${assignment.requiredRarity}`;
    if (scarcity.has(key)) scarcity.get(key).assigned += 1;
  }

  const hydratedCount = memberStates.filter((state) => state.member?.rosterAvailable).length;
  const scarcityRows = [...scarcity.values()];
  const safetySummary = {
    safeAssignments: assignments.filter((row) => row.safety?.status === "SAFE").length,
    giveAssignments: assignments.filter((row) => row.safety?.preference === "give").length,
    protectedOverrides: assignments.filter((row) => row.safety?.protection && row.safety?.preference !== "give").length,
    keepOverrides: assignments.filter((row) => row.safety?.preference === "keep").length,
    helpAssignments: assignments.filter((row) => row.safety?.help).length,
    ignoredMembers: ignoredMembers.size,
    donationPreferences: preferences.size,
    protectedUnits: protections.size,
  };

  return {
    strategy: "scarcity-first-mission-safe-echo-style-draft",
    maxPerTerritory,
    totalSlots: slots.length,
    assignedSlots: assignments.length,
    unfilledSlots: unfilled.length,
    coveragePercent: slots.length ? Math.round((assignments.length / slots.length) * 1000) / 10 : 0,
    hydratedMembers: hydratedCount,
    safetySummary,
    controls: {
      requestedLocks: locks.size,
      appliedLocks: assignments.filter((assignment) => assignment.locked).length,
      lockIssues,
      reservations: reservations.size,
      preferences: preferences.size,
      ignoredMembers: ignoredMembers.size,
      protections: protections.size,
    },
    assignments: assignments.sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase) || String(a.conflictId).localeCompare(String(b.conflictId)) || String(a.squadId).localeCompare(String(b.squadId)) || finite(a.slot) - finite(b.slot)),
    unfilled: unfilled.sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase) || finite(b.locked) - finite(a.locked) || finite(a.safeOwners) - finite(b.safeOwners) || finite(a.availableOwners) - finite(b.availableOwners) || String(a.baseId).localeCompare(String(b.baseId))),
    phases: [...phases.values()].sort((a, b) => phaseNumber(a.phase) - phaseNumber(b.phase)),
    memberLoads: [...memberLoads.values()].sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name))),
    developmentTargets: makeDevelopmentTargets(scarcityRows, memberStates, hydratedCount),
    scarcity: scarcityRows.sort((a, b) => (a.safeOwners - a.demand) - (b.safeOwners - b.demand) || (a.availableOwners - a.demand) - (b.availableOwners - b.demand) || b.demand - a.demand || String(a.name).localeCompare(String(b.name))),
  };
}
