export const MISSION_CONFIDENCE = Object.freeze({
  VERIFIED: "verified",
  COMMUNITY: "community",
  EXPERIMENTAL: "experimental",
  UNKNOWN: "unknown",
});

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function normalizeRosterName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function allRosterUnits(body) {
  const combined = [
    ...(Array.isArray(body?.units) ? body.units : []),
    ...(Array.isArray(body?.ships) ? body.ships : []),
  ];
  const seen = new Set();
  return combined.filter((unit) => {
    const key = String(unit?.baseId || `${unit?.unitType || ""}:${unit?.name || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMember(member) {
  if (typeof member === "string") return { name: member, baseId: "", bypassPool: false, starsMin: null, gearMin: null, relicMin: null, powerMin: null };
  return {
    name: String(member?.name || ""),
    baseId: String(member?.baseId || ""),
    bypassPool: Boolean(member?.bypassPool),
    starsMin: finiteOrNull(member?.starsMin),
    gearMin: finiteOrNull(member?.gearMin),
    relicMin: finiteOrNull(member?.relicMin),
    powerMin: finiteOrNull(member?.powerMin),
  };
}

function normalizeMandatoryAnyGroup(group, index = 0) {
  const source = Array.isArray(group) ? { members: group } : (group || {});
  const members = Array.isArray(source.members) ? source.members.map(normalizeMember) : [];
  const count = Math.max(1, Math.min(members.length || 1, Number(source.count || 1)));
  return {
    id: String(source.id || `mandatory-any-${index + 1}`),
    label: String(source.label || "One of required units"),
    count,
    members,
  };
}

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
      unitType: input.entry?.unitType || null,
      alignment: input.entry?.alignment || null,
      allowedAlignments: Array.isArray(input.entry?.allowedAlignments) ? [...input.entry.allowedAlignments] : [],
      relicMin: finiteOrNull(input.entry?.relicMin),
      gearMin: finiteOrNull(input.entry?.gearMin),
      starsMin: finiteOrNull(input.entry?.starsMin),
      powerMin: finiteOrNull(input.entry?.powerMin),
      squadSize: finiteOrNull(input.entry?.squadSize),
      requiredBaseIds: Array.isArray(input.entry?.requiredBaseIds) ? [...input.entry.requiredBaseIds] : [],
      allowedBaseIds: Array.isArray(input.entry?.allowedBaseIds) ? [...input.entry.allowedBaseIds] : [],
      mandatoryMembers: Array.isArray(input.entry?.mandatoryMembers) ? input.entry.mandatoryMembers.map(normalizeMember) : [],
      mandatoryAnyGroups: Array.isArray(input.entry?.mandatoryAnyGroups) ? input.entry.mandatoryAnyGroups.map(normalizeMandatoryAnyGroup) : [],
      requiredCategories: Array.isArray(input.entry?.requiredCategories) ? [...input.entry.requiredCategories] : [],
      categoryMode: input.entry?.categoryMode === "any" ? "any" : "all",
      notes: String(input.entry?.notes || ""),
    },
    recommendations: Array.isArray(input.recommendations) ? input.recommendations.map(normalizeRecommendation) : [],
    enemies: Array.isArray(input.enemies) ? [...input.enemies] : [],
    mechanics: Array.isArray(input.mechanics) ? [...input.mechanics] : [],
    waves: Array.isArray(input.waves) ? [...input.waves] : [],
    rewards: Array.isArray(input.rewards) ? [...input.rewards] : [],
    sources: Array.isArray(input.sources) ? [...input.sources] : [],
    lastVerified: input.lastVerified || null,
    gameVersion: input.gameVersion || null,
  };
}

export function normalizeRecommendation(input = {}) {
  const baseIds = Array.isArray(input.baseIds) ? [...input.baseIds] : [];
  const members = Array.isArray(input.members)
    ? input.members.map(normalizeMember)
    : baseIds.map((baseId) => normalizeMember({ baseId: String(baseId) }));
  return {
    id: String(input.id || ""),
    name: String(input.name || "Team"),
    confidence: Object.values(MISSION_CONFIDENCE).includes(input.confidence) ? input.confidence : MISSION_CONFIDENCE.UNKNOWN,
    verifiedLegal: Boolean(input.verifiedLegal),
    baseIds,
    members,
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
  const memberCount = Array.isArray(recommendation?.members) && recommendation.members.length
    ? recommendation.members.length
    : Array.isArray(recommendation?.baseIds) ? recommendation.baseIds.length : 0;
  return Boolean(mission?.entry?.verified && recommendation?.verifiedLegal && recommendation?.confidence === MISSION_CONFIDENCE.VERIFIED && memberCount > 0);
}

export function recommendationLabel(mission, recommendation) {
  if (canPresentAsVerifiedTeam(mission, recommendation)) return "Verified Mission Team";
  if (recommendation?.confidence === MISSION_CONFIDENCE.COMMUNITY) return "Community Reference Team";
  if (recommendation?.confidence === MISSION_CONFIDENCE.EXPERIMENTAL) return "Experimental Team";
  return "Unverified Planning Team";
}

function unitFactionSet(unit) {
  return new Set([...(unit?.factions || []), ...(unit?.categories || [])].map((value) => String(value).toLowerCase()));
}

function thresholdEntry(entry, member = null) {
  if (!member) return entry;
  return {
    ...entry,
    starsMin: member.starsMin ?? entry.starsMin,
    gearMin: member.gearMin ?? entry.gearMin,
    relicMin: member.relicMin ?? entry.relicMin,
    powerMin: member.powerMin ?? entry.powerMin,
  };
}

function unitMeetsBaseThresholds(unit, entry) {
  if (!unit) return false;
  if (entry.unitType && String(unit.unitType || "Character").toLowerCase() !== String(entry.unitType).toLowerCase()) return false;
  const alignment = String(unit.alignment || "").toLowerCase();
  if (entry.allowedAlignments?.length) {
    if (!entry.allowedAlignments.some((allowed) => alignment === String(allowed).toLowerCase())) return false;
  } else if (entry.alignment && entry.alignment !== "Mixed" && alignment !== String(entry.alignment).toLowerCase()) return false;
  const isShip = String(unit.unitType || "Character") === "Ship";
  if (entry.relicMin != null && !isShip && Number(unit.relic || 0) < Number(entry.relicMin)) return false;
  if (entry.gearMin != null && !isShip && Number(unit.gear || 0) < Number(entry.gearMin)) return false;
  if (entry.starsMin != null && Number(unit.stars || 0) < Number(entry.starsMin)) return false;
  if (entry.powerMin != null && Number(unit.power || 0) < Number(entry.powerMin)) return false;
  return true;
}

function unitMeetsPoolRestrictions(unit, entry) {
  if (entry.requiredBaseIds?.length && !entry.requiredBaseIds.includes(String(unit.baseId || ""))) return false;
  if (entry.allowedBaseIds?.length && !entry.allowedBaseIds.includes(String(unit.baseId || ""))) return false;
  if (entry.requiredCategories?.length) {
    const factions = unitFactionSet(unit);
    const checks = entry.requiredCategories.map((category) => factions.has(String(category).toLowerCase()));
    if (entry.categoryMode === "any" ? !checks.some(Boolean) : !checks.every(Boolean)) return false;
  }
  return true;
}

export function rosterUnitMeetsEntry(unit, mission) {
  if (!unit || !mission?.entry?.verified) return false;
  return unitMeetsBaseThresholds(unit, mission.entry) && unitMeetsPoolRestrictions(unit, mission.entry);
}

export function mandatoryUnitMeetsEntry(unit, mission, member = {}) {
  if (!unit || !mission?.entry?.verified) return false;
  if (!unitMeetsBaseThresholds(unit, thresholdEntry(mission.entry, member))) return false;
  return member?.bypassPool ? true : unitMeetsPoolRestrictions(unit, mission.entry);
}

export function resolveRosterMember(body, member) {
  const units = allRosterUnits(body);
  const baseId = String(member?.baseId || "");
  if (baseId) {
    const exact = units.find((unit) => String(unit.baseId || "") === baseId);
    if (exact) return exact;
  }
  const wanted = normalizeRosterName(member?.name || "");
  if (!wanted) return null;
  return units.find((unit) => normalizeRosterName(unit.name) === wanted) || null;
}

function memberMatches(member, unit, fallbackName = "") {
  const memberId = String(member?.baseId || "");
  const unitId = String(unit?.baseId || "");
  if (memberId && unitId && memberId === unitId) return true;
  const wanted = normalizeRosterName(member?.name || "");
  const actual = normalizeRosterName(unit?.name || fallbackName || "");
  return Boolean(wanted && actual && wanted === actual);
}

function allMandatoryMembers(mission) {
  return [
    ...(mission?.entry?.mandatoryMembers || []),
    ...(mission?.entry?.mandatoryAnyGroups || []).flatMap((group) => group.members || []),
  ];
}

function matchingMandatoryMember(mission, member, unit) {
  return allMandatoryMembers(mission).find((mandatory) => memberMatches(mandatory, unit, member?.name)) || null;
}

export function entryGap(unit, mission, member = null) {
  const entry = thresholdEntry(mission?.entry || {}, member);
  if (!unit) return { missing: true, stars: entry.starsMin || 0, power: entry.powerMin || 0, gear: entry.gearMin || 0, relic: entry.relicMin || 0, score: 1000000 };
  const stars = entry.starsMin == null ? 0 : Math.max(0, Number(entry.starsMin) - Number(unit.stars || 0));
  const power = entry.powerMin == null ? 0 : Math.max(0, Number(entry.powerMin) - Number(unit.power || 0));
  const isShip = String(unit.unitType || "Character") === "Ship";
  const gear = entry.gearMin == null || isShip ? 0 : Math.max(0, Number(entry.gearMin) - Number(unit.gear || 0));
  const relic = entry.relicMin == null || isShip ? 0 : Math.max(0, Number(entry.relicMin) - Number(unit.relic || 0));
  return { missing: false, stars, power, gear, relic, score: stars * 100000 + relic * 10000 + gear * 1000 + power };
}

function mandatoryMemberRow(body, mission, member) {
  const unit = resolveRosterMember(body, member);
  return {
    member,
    unit,
    owned: Boolean(unit),
    legal: unit ? mandatoryUnitMeetsEntry(unit, mission, member) : false,
    gap: entryGap(unit, mission, member),
  };
}

export function mandatoryAnyRosterStatus(body, mission) {
  const groups = (mission?.entry?.mandatoryAnyGroups || []).map((group) => {
    const rows = (group.members || []).map((member) => mandatoryMemberRow(body, mission, member));
    const legalRows = rows.filter((row) => row.legal);
    const requiredCount = Math.max(1, Number(group.count || 1));
    return {
      group,
      rows,
      requiredCount,
      readyCount: legalRows.length,
      complete: legalRows.length >= requiredCount,
      readyRows: legalRows.slice(0, requiredCount),
    };
  });
  return {
    groups,
    total: groups.length,
    ready: groups.filter((group) => group.complete).length,
    complete: groups.every((group) => group.complete),
  };
}

export function mandatoryRosterStatus(body, mission) {
  const members = mission?.entry?.mandatoryMembers || [];
  const rows = members.map((member) => mandatoryMemberRow(body, mission, member));
  const anyGroups = mandatoryAnyRosterStatus(body, mission);
  const fixedReady = rows.filter((row) => row.legal).length;
  return {
    rows,
    total: rows.length,
    ready: fixedReady,
    anyGroups: anyGroups.groups,
    anyGroupTotal: anyGroups.total,
    anyGroupReady: anyGroups.ready,
    requirementTotal: rows.length + anyGroups.total,
    requirementReady: fixedReady + anyGroups.ready,
    complete: rows.every((row) => row.legal) && anyGroups.complete,
  };
}

function selectedIncludesMember(rows, member) {
  return rows.some((row) => memberMatches(member, row.unit, row.name));
}

function selectedAnyGroupStatus(rows, mission) {
  const groups = (mission?.entry?.mandatoryAnyGroups || []).map((group) => {
    const selectedMembers = (group.members || []).filter((member) => selectedIncludesMember(rows, member));
    const requiredCount = Math.max(1, Number(group.count || 1));
    return { group, selectedMembers, requiredCount, complete: selectedMembers.length >= requiredCount };
  });
  return { groups, complete: groups.every((group) => group.complete) };
}

export function recommendationRosterFit(body, mission, recommendation) {
  const members = Array.isArray(recommendation?.members) && recommendation.members.length
    ? recommendation.members
    : (recommendation?.baseIds || []).map((baseId) => normalizeMember({ baseId: String(baseId) }));
  const rows = members.map((member) => {
    const unit = resolveRosterMember(body, member);
    const mandatory = unit ? matchingMandatoryMember(mission, member, unit) : null;
    const legal = unit ? (mandatory ? mandatoryUnitMeetsEntry(unit, mission, mandatory) : rosterUnitMeetsEntry(unit, mission)) : false;
    return {
      baseId: String(member?.baseId || unit?.baseId || ""),
      name: String(member?.name || unit?.name || member?.baseId || "Unknown"),
      unit,
      owned: Boolean(unit),
      legal,
      gap: entryGap(unit, mission, mandatory || member),
      mandatory: Boolean(mandatory),
    };
  });
  const mandatory = mandatoryRosterStatus(body, mission);
  const recommendationBaseIds = new Set(rows.map((row) => String(row.unit?.baseId || row.baseId || "")).filter(Boolean));
  const recommendationNames = new Set(rows.map((row) => normalizeRosterName(row.unit?.name || row.name)).filter(Boolean));
  const includesMandatory = mandatory.rows.every((row) => {
    const id = String(row.unit?.baseId || row.member?.baseId || "");
    const name = normalizeRosterName(row.unit?.name || row.member?.name || "");
    return (id && recommendationBaseIds.has(id)) || (name && recommendationNames.has(name));
  });
  const selectedAnyGroups = selectedAnyGroupStatus(rows, mission);
  return {
    rows,
    owned: rows.filter((row) => row.owned).length,
    legal: rows.filter((row) => row.legal).length,
    mandatory,
    includesMandatory,
    includesMandatoryAnyGroups: selectedAnyGroups.complete,
    mandatoryAnyGroups: selectedAnyGroups.groups,
    complete: rows.length > 0 && rows.every((row) => row.owned && row.legal) && mandatory.complete && includesMandatory && selectedAnyGroups.complete,
  };
}

export function legalRosterCandidates(body, mission, limit = 0) {
  if (!mission?.entry?.verified) return [];
  const rows = allRosterUnits(body)
    .filter((unit) => rosterUnitMeetsEntry(unit, mission))
    .sort((a, b) => Number(b.power || 0) - Number(a.power || 0) || Number(b.speed || 0) - Number(a.speed || 0) || String(a.name || "").localeCompare(String(b.name || "")));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

export function missionRosterEntrySummary(body, mission, squadSize = null) {
  if (!mission?.entry?.verified) return { verified: false, ready: false, percent: 0, candidates: [], mandatory: mandatoryRosterStatus(body, mission) };
  const candidates = legalRosterCandidates(body, mission);
  const mandatory = mandatoryRosterStatus(body, mission);
  const target = Math.max(1, Number(squadSize || mission.entry.squadSize || 5));
  const bypassCount = (mission.entry.mandatoryMembers || []).filter((member) => member.bypassPool).length
    + (mission.entry.mandatoryAnyGroups || []).reduce((sum, group) => sum + Math.min(Number(group.count || 1), (group.members || []).filter((member) => member.bypassPool).length), 0);
  const poolTarget = Math.max(0, target - bypassCount);
  const depthRatio = poolTarget === 0 ? 1 : Math.min(1, candidates.length / poolTarget);
  const requirementTotal = mandatory.requirementTotal || 0;
  const mandatoryRatio = requirementTotal ? mandatory.requirementReady / requirementTotal : 1;
  const percent = Math.round((depthRatio * (requirementTotal ? 0.7 : 1) + (requirementTotal ? mandatoryRatio * 0.3 : 0)) * 100);
  return { verified: true, ready: candidates.length >= poolTarget && mandatory.complete, percent, candidates, mandatory, squadSize: target, poolTarget };
}

export function recommendationUpgradeRows(body, mission, recommendation) {
  if (!mission?.entry?.verified) return [];
  const fit = recommendationRosterFit(body, mission, recommendation);
  const rows = fit.rows.filter((row) => !row.legal);
  for (const mandatoryRow of fit.mandatory.rows) {
    if (mandatoryRow.legal) continue;
    const duplicate = rows.some((row) => String(row.unit?.baseId || row.baseId || "") === String(mandatoryRow.unit?.baseId || mandatoryRow.member?.baseId || "") || normalizeRosterName(row.unit?.name || row.name) === normalizeRosterName(mandatoryRow.unit?.name || mandatoryRow.member?.name));
    if (!duplicate) rows.push({
      baseId: String(mandatoryRow.unit?.baseId || mandatoryRow.member?.baseId || ""),
      name: String(mandatoryRow.unit?.name || mandatoryRow.member?.name || "Mandatory unit"),
      unit: mandatoryRow.unit,
      owned: mandatoryRow.owned,
      legal: false,
      gap: mandatoryRow.gap,
      mandatory: true,
    });
  }
  for (const groupStatus of fit.mandatory.anyGroups || []) {
    if (groupStatus.complete) continue;
    const best = groupStatus.rows.slice().sort((a, b) => Number(a.gap?.score || 0) - Number(b.gap?.score || 0))[0];
    if (!best) continue;
    const duplicate = rows.some((row) => String(row.unit?.baseId || row.baseId || "") === String(best.unit?.baseId || best.member?.baseId || "") || normalizeRosterName(row.unit?.name || row.name) === normalizeRosterName(best.unit?.name || best.member?.name));
    if (!duplicate) rows.push({
      baseId: String(best.unit?.baseId || best.member?.baseId || ""),
      name: String(best.unit?.name || best.member?.name || groupStatus.group?.label || "Required option"),
      unit: best.unit,
      owned: best.owned,
      legal: false,
      gap: best.gap,
      mandatory: true,
      mandatoryChoice: true,
      mandatoryChoiceLabel: groupStatus.group?.label || "One of required units",
    });
  }
  return rows.slice().sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || Number(b.gap?.missing) - Number(a.gap?.missing) || Number(b.gap?.score || 0) - Number(a.gap?.score || 0) || a.name.localeCompare(b.name));
}
