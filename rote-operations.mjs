const CHARACTER_COMBAT_TYPE = 1;
const SHIP_COMBAT_TYPE = 2;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function displayRelicTier(rawTier) {
  const tier = finite(rawTier, 0);
  return tier > 1 ? Math.max(0, tier - 2) : Math.max(0, tier);
}

function sortedObjectNumericKeys(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0])));
}

function histogramIncrement(map, key, amount = 1) {
  const token = String(key);
  map.set(token, (map.get(token) || 0) + amount);
}

export function aggregateRoteOperations(payload) {
  const conflicts = asArray(payload?.data || payload);
  const units = new Map();
  const phaseTotals = new Map();
  let totalSlots = 0;
  let squadCount = 0;

  for (const conflict of conflicts) {
    const phase = String(conflict?.phase || "Unknown");
    const conflictId = String(conflict?.id || conflict?.conflict || conflict?.linkedConflictId || "");
    for (const squad of asArray(conflict?.squads)) {
      squadCount += 1;
      for (const unit of asArray(squad?.units)) {
        const baseId = String(unit?.baseId || unit?.unitIdentifier || "").trim();
        if (!baseId) continue;
        const combatType = finite(unit?.combatType, CHARACTER_COMBAT_TYPE);
        const rawRelicTier = finite(unit?.unitRelicTier, 0);
        const relic = combatType === CHARACTER_COMBAT_TYPE ? displayRelicTier(rawRelicTier) : 0;
        const rarity = Math.max(0, finite(unit?.rarity, 0));
        totalSlots += 1;
        phaseTotals.set(phase, (phaseTotals.get(phase) || 0) + 1);

        let entry = units.get(baseId);
        if (!entry) {
          entry = {
            baseId,
            name: String(unit?.nameKey || baseId),
            combatType,
            unitType: combatType === SHIP_COMBAT_TYPE ? "Ship" : "Character",
            requiredCount: 0,
            minRelic: null,
            maxRelic: 0,
            maxRarity: 0,
            phases: new Set(),
            conflicts: new Set(),
            relicCounts: new Map(),
            rarityCounts: new Map(),
            phaseMap: new Map(),
          };
          units.set(baseId, entry);
        }

        entry.requiredCount += 1;
        entry.maxRarity = Math.max(entry.maxRarity, rarity);
        entry.phases.add(phase);
        if (conflictId) entry.conflicts.add(conflictId);
        histogramIncrement(entry.rarityCounts, rarity);

        if (combatType === CHARACTER_COMBAT_TYPE) {
          entry.minRelic = entry.minRelic === null ? relic : Math.min(entry.minRelic, relic);
          entry.maxRelic = Math.max(entry.maxRelic, relic);
          histogramIncrement(entry.relicCounts, relic);
        }

        let phaseEntry = entry.phaseMap.get(phase);
        if (!phaseEntry) {
          phaseEntry = {
            phase,
            count: 0,
            minRelic: null,
            maxRelic: 0,
            maxRarity: 0,
            relicCounts: new Map(),
            rarityCounts: new Map(),
          };
          entry.phaseMap.set(phase, phaseEntry);
        }
        phaseEntry.count += 1;
        phaseEntry.maxRarity = Math.max(phaseEntry.maxRarity, rarity);
        histogramIncrement(phaseEntry.rarityCounts, rarity);
        if (combatType === CHARACTER_COMBAT_TYPE) {
          phaseEntry.minRelic = phaseEntry.minRelic === null ? relic : Math.min(phaseEntry.minRelic, relic);
          phaseEntry.maxRelic = Math.max(phaseEntry.maxRelic, relic);
          histogramIncrement(phaseEntry.relicCounts, relic);
        }
      }
    }
  }

  const requirements = [...units.values()].map((entry) => ({
    baseId: entry.baseId,
    name: entry.name,
    combatType: entry.combatType,
    unitType: entry.unitType,
    requiredCount: entry.requiredCount,
    minRelic: entry.unitType === "Character" ? entry.minRelic ?? 0 : 0,
    maxRelic: entry.unitType === "Character" ? entry.maxRelic : 0,
    maxRarity: entry.maxRarity,
    phases: [...entry.phases].sort(),
    conflicts: [...entry.conflicts].sort(),
    relicCounts: sortedObjectNumericKeys(entry.relicCounts),
    rarityCounts: sortedObjectNumericKeys(entry.rarityCounts),
    phaseRequirements: [...entry.phaseMap.values()]
      .sort((a, b) => a.phase.localeCompare(b.phase))
      .map((phaseEntry) => ({
        phase: phaseEntry.phase,
        count: phaseEntry.count,
        minRelic: entry.unitType === "Character" ? phaseEntry.minRelic ?? 0 : 0,
        maxRelic: entry.unitType === "Character" ? phaseEntry.maxRelic : 0,
        maxRarity: phaseEntry.maxRarity,
        relicCounts: sortedObjectNumericKeys(phaseEntry.relicCounts),
        rarityCounts: sortedObjectNumericKeys(phaseEntry.rarityCounts),
      })),
  })).sort((a, b) => b.requiredCount - a.requiredCount || a.name.localeCompare(b.name));

  return {
    source: "swgoh-utils/gamedata:swgoh_rote_operations.json",
    territoryBattleId: "t05D",
    uniqueUnits: requirements.length,
    totalSlots,
    conflictCount: conflicts.length,
    squadCount,
    phases: [...phaseTotals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([phase, slots]) => ({ phase, slots })),
    requirements,
  };
}

export function readyOccurrences(requirement, liveUnit) {
  if (!requirement || !liveUnit) return 0;
  if (requirement.unitType === "Ship") {
    const stars = finite(liveUnit?.stars ?? liveUnit?.rarity, 0);
    return Object.entries(requirement.rarityCounts || {}).reduce(
      (sum, [required, count]) => sum + (stars >= Number(required) ? Number(count) : 0),
      0,
    );
  }
  const relic = finite(liveUnit?.relic ?? liveUnit?.relicLevel ?? liveUnit?.relicTier, 0);
  return Object.entries(requirement.relicCounts || {}).reduce(
    (sum, [required, count]) => sum + (relic >= Number(required) ? Number(count) : 0),
    0,
  );
}
