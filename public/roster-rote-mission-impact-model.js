import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";

function personalSnapshot(body = {}, allyCode = "") {
  const player = body?.player || {};
  return Object.freeze({
    guild: Object.freeze({ id: "personal-roster", name: player.name || "Personal Roster" }),
    members: Object.freeze([Object.freeze({
      playerId: String(player.playerId || player.id || allyCode || "personal"),
      allyCode: String(player.allyCode || allyCode || ""),
      name: String(player.name || player.allyCode || allyCode || "Player"),
      galacticPower: Number(player.galacticPower || player.gp || 0),
      rosterAvailable: true,
      units: Object.freeze([...(body?.units || []), ...(body?.ships || [])]),
    })]),
  });
}

function missionRef(mission = {}) {
  return Object.freeze({
    key: String(mission.key || ""),
    planetId: String(mission.planetId || ""),
    planetName: String(mission.planetName || ""),
    phase: String(mission.phase || ""),
    missionName: String(mission.mission?.name || mission.key || "Mission"),
  });
}

function emptyUnitImpact(baseId, name = "", unitType = "Character") {
  return {
    baseId: String(baseId || ""),
    name: String(name || baseId || "Unknown"),
    unitType: String(unitType || "Character"),
    legal: new Map(),
    mandatory: new Map(),
    farm: new Map(),
    gapLabels: new Set(),
  };
}

function ensureImpact(map, unit = {}, fallback = {}) {
  const baseId = String(unit?.baseId || fallback.baseId || "");
  if (!baseId) return null;
  if (!map.has(baseId)) map.set(baseId, emptyUnitImpact(baseId, unit?.name || fallback.name, unit?.unitType || fallback.unitType));
  const row = map.get(baseId);
  if ((!row.name || row.name === row.baseId) && (unit?.name || fallback.name)) row.name = String(unit?.name || fallback.name);
  if (unit?.unitType || fallback.unitType) row.unitType = String(unit?.unitType || fallback.unitType);
  return row;
}

export function personalMissionImpactFromCoverage(coverage = {}) {
  const impacts = new Map();
  const owned = coverage.members?.[0] || null;
  for (const unit of [...(owned?.units || []), ...(owned?.ships || [])]) ensureImpact(impacts, unit);

  for (const mission of coverage.missions || []) {
    if (mission.evidence !== "exact") continue;
    const ref = missionRef(mission);
    const evaluation = mission.evaluations?.[0] || null;
    for (const unit of evaluation?.eligibility?.candidates || []) {
      const row = ensureImpact(impacts, unit);
      if (row) row.legal.set(ref.key, ref);
    }
    for (const mandatory of evaluation?.eligibility?.mandatory || []) {
      if (!mandatory?.unit?.baseId) continue;
      const row = ensureImpact(impacts, mandatory.unit, mandatory);
      if (row) row.mandatory.set(ref.key, ref);
    }
  }

  for (const farm of coverage.farms || []) {
    if (!farm?.baseId) continue;
    const row = ensureImpact(impacts, farm.unit || {}, { baseId: farm.baseId, name: farm.unitName });
    if (!row) continue;
    for (const mission of farm.missionRefs || []) {
      const ref = missionRef(mission);
      row.farm.set(ref.key, ref);
    }
    if (farm.gapLabel) row.gapLabels.add(String(farm.gapLabel));
  }

  const rows = [...impacts.values()].map((row) => {
    const union = new Map([...row.legal, ...row.mandatory, ...row.farm]);
    return Object.freeze({
      baseId: row.baseId,
      name: row.name,
      unitType: row.unitType,
      legalMissionCount: row.legal.size,
      mandatoryMissionCount: row.mandatory.size,
      farmMissionCount: row.farm.size,
      totalMissionImpact: union.size,
      legalMissionRefs: Object.freeze([...row.legal.values()]),
      mandatoryMissionRefs: Object.freeze([...row.mandatory.values()]),
      farmMissionRefs: Object.freeze([...row.farm.values()]),
      gapLabels: Object.freeze([...row.gapLabels]),
      impactScore: row.farm.size * 1000 + row.mandatory.size * 100 + row.legal.size * 10 + union.size,
    });
  }).sort((a, b) => b.impactScore - a.impactScore || String(a.name).localeCompare(String(b.name)));

  return Object.freeze({
    rows: Object.freeze(rows),
    byBaseId: new Map(rows.map((row) => [row.baseId, row])),
    summary: Object.freeze({
      ownedUnits: rows.length,
      missionLegalUnits: rows.filter((row) => row.legalMissionCount > 0).length,
      mandatoryUnits: rows.filter((row) => row.mandatoryMissionCount > 0).length,
      farmBlockerUnits: rows.filter((row) => row.farmMissionCount > 0).length,
      multiMissionUnits: rows.filter((row) => row.totalMissionImpact >= 3).length,
      exactMissions: coverage.summary?.exactMissions || 0,
      partialEvidenceMissions: coverage.summary?.partialEvidenceMissions || 0,
    }),
  });
}

export function impactFilterMatch(row = {}, filter = "All") {
  if (filter === "farm") return Number(row.farmMissionCount || 0) > 0;
  if (filter === "mandatory") return Number(row.mandatoryMissionCount || 0) > 0;
  if (filter === "legal") return Number(row.legalMissionCount || 0) > 0;
  if (filter === "multi") return Number(row.totalMissionImpact || 0) >= 3;
  if (filter === "none") return Number(row.totalMissionImpact || 0) === 0;
  return true;
}

export function compareMissionImpact(a = {}, b = {}, sort = "impact") {
  if (sort === "legal") return Number(b.legalMissionCount || 0) - Number(a.legalMissionCount || 0) || Number(b.impactScore || 0) - Number(a.impactScore || 0) || String(a.name || "").localeCompare(String(b.name || ""));
  if (sort === "mandatory") return Number(b.mandatoryMissionCount || 0) - Number(a.mandatoryMissionCount || 0) || Number(b.impactScore || 0) - Number(a.impactScore || 0) || String(a.name || "").localeCompare(String(b.name || ""));
  if (sort === "farm") return Number(b.farmMissionCount || 0) - Number(a.farmMissionCount || 0) || Number(b.impactScore || 0) - Number(a.impactScore || 0) || String(a.name || "").localeCompare(String(b.name || ""));
  return Number(b.impactScore || 0) - Number(a.impactScore || 0) || String(a.name || "").localeCompare(String(b.name || ""));
}

export function buildPersonalRoteMissionImpact(body, catalog = [], allyCode = "") {
  const coverage = buildGuildRoteMissionCoverage(personalSnapshot(body, allyCode), catalog, { redundancyTarget: 1 });
  return Object.freeze({ coverage, impact: personalMissionImpactFromCoverage(coverage) });
}
