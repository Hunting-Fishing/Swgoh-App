export const MISSION_CONFIDENCE = Object.freeze({
  VERIFIED: "verified",
  COMMUNITY: "community",
  EXPERIMENTAL: "experimental",
  UNKNOWN: "unknown",
});

export function createMissionRecord(input = {}) {
  return {
    id: String(input.id || ""),
    tbId: String(input.tbId || ""),
    territoryId: String(input.territoryId || ""),
    phase: Number(input.phase || 0),
    name: String(input.name || "Mission"),
    missionType: String(input.missionType || "combat"),
    entry: {
      verified: Boolean(input.entry?.verified),
      alignment: input.entry?.alignment || null,
      relicMin: Number.isFinite(Number(input.entry?.relicMin)) ? Number(input.entry.relicMin) : null,
      gearMin: Number.isFinite(Number(input.entry?.gearMin)) ? Number(input.entry.gearMin) : null,
      starsMin: Number.isFinite(Number(input.entry?.starsMin)) ? Number(input.entry.starsMin) : null,
      powerMin: Number.isFinite(Number(input.entry?.powerMin)) ? Number(input.entry.powerMin) : null,
      requiredBaseIds: Array.isArray(input.entry?.requiredBaseIds) ? [...input.entry.requiredBaseIds] : [],
      allowedBaseIds: Array.isArray(input.entry?.allowedBaseIds) ? [...input.entry.allowedBaseIds] : [],
      requiredCategories: Array.isArray(input.entry?.requiredCategories) ? [...input.entry.requiredCategories] : [],
      notes: String(input.entry?.notes || ""),
    },
    recommendations: Array.isArray(input.recommendations) ? input.recommendations.map(normalizeRecommendation) : [],
    enemies: Array.isArray(input.enemies) ? [...input.enemies] : [],
    mechanics: Array.isArray(input.mechanics) ? [...input.mechanics] : [],
    sources: Array.isArray(input.sources) ? [...input.sources] : [],
    lastVerified: input.lastVerified || null,
    gameVersion: input.gameVersion || null,
  };
}

export function normalizeRecommendation(input = {}) {
  return {
    id: String(input.id || ""),
    name: String(input.name || "Team"),
    confidence: Object.values(MISSION_CONFIDENCE).includes(input.confidence) ? input.confidence : MISSION_CONFIDENCE.UNKNOWN,
    verifiedLegal: Boolean(input.verifiedLegal),
    baseIds: Array.isArray(input.baseIds) ? [...input.baseIds] : [],
    optionalBaseIds: Array.isArray(input.optionalBaseIds) ? [...input.optionalBaseIds] : [],
    minimum: {
      relic: input.minimum?.relic ?? null,
      gear: input.minimum?.gear ?? null,
      speed: input.minimum?.speed ?? null,
      notes: String(input.minimum?.notes || ""),
    },
    saferTarget: {
      relic: input.saferTarget?.relic ?? null,
      gear: input.saferTarget?.gear ?? null,
      speed: input.saferTarget?.speed ?? null,
      notes: String(input.saferTarget?.notes || ""),
    },
    zetas: Array.isArray(input.zetas) ? [...input.zetas] : [],
    omicrons: Array.isArray(input.omicrons) ? [...input.omicrons] : [],
    abilities: Array.isArray(input.abilities) ? [...input.abilities] : [],
    modTargets: Array.isArray(input.modTargets) ? [...input.modTargets] : [],
    strategy: Array.isArray(input.strategy) ? [...input.strategy] : [],
    sourceIds: Array.isArray(input.sourceIds) ? [...input.sourceIds] : [],
    lastVerified: input.lastVerified || null,
  };
}

export function canPresentAsVerifiedTeam(mission, recommendation) {
  return Boolean(
    mission?.entry?.verified &&
    recommendation?.verifiedLegal &&
    recommendation?.confidence === MISSION_CONFIDENCE.VERIFIED &&
    Array.isArray(recommendation?.baseIds) &&
    recommendation.baseIds.length > 0
  );
}

export function recommendationLabel(mission, recommendation) {
  if (canPresentAsVerifiedTeam(mission, recommendation)) return "Verified Mission Team";
  if (recommendation?.confidence === MISSION_CONFIDENCE.COMMUNITY) return "Community Reference Team";
  if (recommendation?.confidence === MISSION_CONFIDENCE.EXPERIMENTAL) return "Experimental Team";
  return "Unverified Planning Team";
}

export function rosterUnitMeetsEntry(unit, mission) {
  if (!unit || !mission?.entry?.verified) return false;
  const entry = mission.entry;
  if (entry.alignment && entry.alignment !== "Mixed" && String(unit.alignment || "").toLowerCase() !== String(entry.alignment).toLowerCase()) return false;
  if (entry.relicMin != null && Number(unit.relic || 0) < Number(entry.relicMin)) return false;
  if (entry.gearMin != null && Number(unit.gear || 0) < Number(entry.gearMin)) return false;
  if (entry.starsMin != null && Number(unit.stars || 0) < Number(entry.starsMin)) return false;
  if (entry.powerMin != null && Number(unit.power || 0) < Number(entry.powerMin)) return false;
  if (entry.requiredBaseIds.length && !entry.requiredBaseIds.includes(String(unit.baseId || ""))) return false;
  if (entry.allowedBaseIds.length && !entry.allowedBaseIds.includes(String(unit.baseId || ""))) return false;
  if (entry.requiredCategories.length) {
    const factions = new Set([...(unit.factions || []), ...(unit.categories || [])].map((value) => String(value).toLowerCase()));
    if (!entry.requiredCategories.every((category) => factions.has(String(category).toLowerCase()))) return false;
  }
  return true;
}

export function recommendationRosterFit(body, mission, recommendation) {
  const units = Array.isArray(body?.units) ? body.units : [];
  const byId = new Map(units.map((unit) => [String(unit.baseId), unit]));
  const rows = (recommendation?.baseIds || []).map((baseId) => {
    const unit = byId.get(String(baseId)) || null;
    return {
      baseId: String(baseId),
      unit,
      owned: Boolean(unit),
      legal: unit ? rosterUnitMeetsEntry(unit, mission) : false,
    };
  });
  return {
    rows,
    owned: rows.filter((row) => row.owned).length,
    legal: rows.filter((row) => row.legal).length,
    complete: rows.length > 0 && rows.every((row) => row.owned && row.legal),
  };
}
