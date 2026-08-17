function clean(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function digits(value) {
  return clean(value).replace(/\D/g, "").slice(0, 9);
}

function rankMetric(members, target, selector) {
  if (!target) return Object.freeze({ known: false, rank: 0, total: 0, value: null });
  const targetValue = nullableFinite(selector(target));
  if (targetValue === null) return Object.freeze({ known: false, rank: 0, total: 0, value: null });
  const known = asArray(members)
    .map((member) => ({ member, value: nullableFinite(selector(member)) }))
    .filter((row) => row.value !== null);
  const rank = known.filter((row) => row.value > targetValue).length + 1;
  return Object.freeze({ known: true, rank, total: known.length, value: targetValue });
}

function maxThreshold(counts = {}, explicit = null) {
  const direct = nullableFinite(explicit);
  if (direct !== null) return direct;
  const thresholds = Object.keys(counts || {}).map(Number).filter(Number.isFinite);
  return thresholds.length ? Math.max(...thresholds) : 0;
}

function supportedOccurrences(requirement, unit) {
  if (!requirement || !unit) return 0;
  const requiredCount = Math.max(0, finite(requirement.requiredCount));
  if (clean(requirement.unitType).toLowerCase() === "ship") {
    const counts = requirement.rarityCounts || {};
    const entries = Object.entries(counts);
    if (!entries.length) return finite(unit.stars) >= maxThreshold(counts, requirement.maxRarity) ? requiredCount : 0;
    return entries.reduce((sum, [threshold, count]) => sum + (finite(unit.stars) >= finite(threshold) ? finite(count) : 0), 0);
  }
  const counts = requirement.relicCounts || {};
  const entries = Object.entries(counts);
  if (!entries.length) return finite(unit.relic) >= maxThreshold(counts, requirement.maxRelic) ? requiredCount : 0;
  return entries.reduce((sum, [threshold, count]) => sum + (finite(unit.relic) >= finite(threshold) ? finite(count) : 0), 0);
}

function roteRequirementRows(units = [], operations = {}) {
  const unitMap = new Map(asArray(units).filter((unit) => unit?.baseId).map((unit) => [clean(unit.baseId), unit]));
  return asArray(operations?.requirements).map((requirement) => {
    const baseId = clean(requirement?.baseId);
    const unit = unitMap.get(baseId) || null;
    const ship = clean(requirement?.unitType).toLowerCase() === "ship";
    const target = ship
      ? maxThreshold(requirement?.rarityCounts, requirement?.maxRarity)
      : maxThreshold(requirement?.relicCounts, requirement?.maxRelic);
    const current = unit ? finite(ship ? unit.stars : unit.relic) : 0;
    const requiredCount = Math.max(0, finite(requirement?.requiredCount));
    const ready = Boolean(unit) && current >= target;
    return Object.freeze({
      baseId,
      name: clean(unit?.name || requirement?.name || baseId),
      unitType: ship ? "Ship" : "Character",
      owned: Boolean(unit),
      current,
      target,
      gap: Math.max(0, target - current),
      requiredCount,
      supportedOccurrences: supportedOccurrences(requirement, unit),
      exactHighestGateReady: ready,
    });
  }).filter((row) => row.baseId);
}

function buildRote(units, operations) {
  const rows = roteRequirementRows(units, operations);
  const priorityGaps = rows
    .filter((row) => !row.exactHighestGateReady)
    .slice()
    .sort((a, b) => b.requiredCount - a.requiredCount
      || Number(a.owned) - Number(b.owned)
      || a.gap - b.gap
      || a.name.localeCompare(b.name));
  return Object.freeze({
    requirementsAvailable: rows.length > 0,
    uniqueRequiredUnits: rows.length,
    ownedRequiredUnits: rows.filter((row) => row.owned).length,
    highestGateReadyUnits: rows.filter((row) => row.exactHighestGateReady).length,
    upgradeNeededUnits: rows.filter((row) => row.owned && !row.exactHighestGateReady).length,
    missingRequiredUnits: rows.filter((row) => !row.owned).length,
    demandedOccurrences: rows.reduce((sum, row) => sum + row.requiredCount, 0),
    supportedOccurrences: rows.reduce((sum, row) => sum + row.supportedOccurrences, 0),
    priorityGaps: Object.freeze(priorityGaps.slice(0, 12)),
  });
}

function buildRanks(guildBody, allyCode) {
  const members = asArray(guildBody?.members);
  const target = members.find((member) => digits(member?.allyCode) === allyCode) || null;
  return Object.freeze({
    available: Boolean(target && members.length),
    totalMembers: members.length,
    gp: rankMetric(members, target, (row) => row.galacticPower),
    characterGp: rankMetric(members, target, (row) => row.characterGalacticPower ?? row.characterGp),
    shipGp: rankMetric(members, target, (row) => row.shipGalacticPower ?? row.shipGp),
    galacticLegends: rankMetric(members, target, (row) => row.galacticLegendCount),
    relic7: rankMetric(members, target, (row) => row.relic7),
    relic9: rankMetric(members, target, (row) => row.relic9),
    zetas: rankMetric(members, target, (row) => row.zetaCount),
    omicrons: rankMetric(members, target, (row) => row.omicronCount),
  });
}

function rankBand(row) {
  if (!row?.known || row.total <= 0) return "unknown";
  if (row.rank > Math.ceil(row.total * 0.75)) return "lower-quartile";
  if (row.rank > Math.ceil(row.total * 0.5)) return "lower-half";
  return "upper-half";
}

function buildGuildRankSignals(ranks) {
  if (!ranks?.available) return Object.freeze([]);
  const dimensions = [
    ["gp", "Galactic Power", "power"],
    ["characterGp", "Character GP", "characters"],
    ["shipGp", "Ship GP", "ships"],
    ["galacticLegends", "Galactic Legends", "gl"],
    ["relic7", "R7+ depth", "relic7"],
    ["relic9", "R9 depth", "relic9"],
    ["zetas", "Zeta investment", "zeta"],
    ["omicrons", "Omicron investment", "omicron"],
  ];
  return Object.freeze(dimensions.map(([key, label, action]) => {
    const row = ranks[key];
    return Object.freeze({
      key,
      label,
      action,
      known: Boolean(row?.known),
      rank: finite(row?.rank),
      total: finite(row?.total),
      value: nullableFinite(row?.value),
      band: rankBand(row),
    });
  }).filter((row) => row.known && row.band !== "upper-half")
    .sort((a, b) => {
      const aFraction = a.total ? a.rank / a.total : 0;
      const bFraction = b.total ? b.rank / b.total : 0;
      return bFraction - aFraction || a.label.localeCompare(b.label);
    }));
}

function momentumLabels(event = {}) {
  const delta = event.delta || {};
  const labels = [];
  if (finite(delta.omicronCount) > 0) labels.push("Omicron");
  if (finite(delta.zetaCount) > 0) labels.push("Zeta");
  if (finite(delta.ultimateUnlocked) > 0) labels.push("Ultimate");
  if (finite(delta.relicTier) > 0) labels.push("Relic");
  if (finite(delta.gearLevel) > 0) labels.push("Gear");
  if (finite(delta.rarity) > 0) labels.push("Stars");
  if (finite(delta.level) > 0) labels.push("Level");
  if (finite(delta.galacticPower) > 0) labels.push("GP");
  return labels;
}

function buildRecentMomentum(historyBody) {
  return Object.freeze(asArray(historyBody?.progression).slice(0, 10).map((event) => Object.freeze({
    id: event?.id ?? null,
    baseId: clean(event?.baseId),
    unitName: clean(event?.unitName || event?.baseId || "Unit"),
    changedAt: clean(event?.changedAt),
    evidence: Object.freeze(momentumLabels(event)),
  })).filter((row) => row.baseId || row.evidence.length));
}

function buildDevelopment(rote, ranks, historyBody) {
  const roteGaps = Object.freeze(asArray(rote?.priorityGaps).slice(0, 8).map((row) => Object.freeze({ ...row })));
  const guildRankSignals = buildGuildRankSignals(ranks);
  const recentMomentum = buildRecentMomentum(historyBody);
  return Object.freeze({
    hasEvidence: roteGaps.length > 0 || guildRankSignals.length > 0 || recentMomentum.length > 0,
    roteGaps,
    guildRankSignals,
    recentMomentum,
  });
}

export function buildPlayerCommandDashboard({ playerBody, guildBody = null, historyBody = null, operations = null } = {}) {
  if (!playerBody?.player || !Array.isArray(playerBody?.units) || !Array.isArray(playerBody?.ships)) return null;
  const player = playerBody.player;
  const allyCode = digits(player.allyCode);
  const units = [...playerBody.units, ...playerBody.ships];
  const summary = playerBody.summary || {};
  const expected = finite(playerBody?.persistence?.expectedOwnedUnits, finite(summary.characters) + finite(summary.ships));
  const complete = playerBody?.persistence?.logicalRosterComplete === true
    && (expected <= 0 || units.length === expected);
  const guildRanks = buildRanks(guildBody, allyCode);
  const rote = buildRote(units, operations);

  return Object.freeze({
    source: Object.freeze({
      mode: clean(playerBody.source || "canonical"),
      detail: clean(playerBody.sourceDetail),
      syncedAt: clean(playerBody?.persistence?.lastSyncedAt || playerBody.fetchedAt || player.updatedAt),
      logicalRosterComplete: complete,
    }),
    player: Object.freeze({
      allyCode,
      name: clean(player.name || allyCode),
      level: finite(player.level),
      guildName: clean(player.guildName),
      galacticPower: finite(player.galacticPower),
      characterGp: finite(player.characterGalacticPower ?? player.characterGp),
      shipGp: finite(player.shipGalacticPower ?? player.shipGp),
    }),
    roster: Object.freeze({
      ownedUnits: units.length,
      expectedOwnedUnits: expected,
      characters: finite(summary.characters, playerBody.units.length),
      ships: finite(summary.ships, playerBody.ships.length),
      galacticLegends: finite(summary.galacticLegends),
      gear13: finite(summary.gear13),
      relic5Plus: finite(summary.relic5Plus),
      relic7Plus: finite(summary.relic7Plus),
      relic9: finite(summary.relic9),
      sevenStarShips: finite(summary.sevenStarShips),
      zetas: nullableFinite(summary.zetas),
      omicrons: nullableFinite(summary.omicrons),
      ultimates: nullableFinite(summary.ultimates),
      omegaEta: nullableFinite(summary.omegaUpgrades),
    }),
    guildRanks,
    rote,
    history: Object.freeze({
      available: Boolean(historyBody?.player),
      summary: Object.freeze({ ...(historyBody?.summary || {}) }),
      trend: Object.freeze({ ...(historyBody?.trend || {}) }),
      recentChanges: Object.freeze(asArray(historyBody?.progression).slice(0, 10)),
    }),
    development: buildDevelopment(rote, guildRanks, historyBody),
  });
}
