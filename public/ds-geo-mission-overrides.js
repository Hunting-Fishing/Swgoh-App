import { DS_GEO_TERRITORIES as RAW_DS_GEO_TERRITORIES } from "./ds-geo-data.js";

const member = (name, baseId, extra = {}) => ({ name, baseId, ...extra });

function withMandatory(entry = {}, mandatoryMembers = [], notes = "") {
  return {
    ...entry,
    verified: true,
    mandatoryMembers,
    ...(notes ? { notes } : {}),
  };
}

export function normalizeDsGeoMission(mission = {}) {
  const next = {
    ...mission,
    entry: { ...(mission.entry || {}) },
    recommendations: Array.isArray(mission.recommendations) ? mission.recommendations.map((row) => ({ ...row })) : [],
  };

  if (next.id === "s1") {
    next.name = "Special Mission — Nute Gunray + Separatist Droid Core";
    next.entry = withMandatory(
      { ...next.entry, unitType: "Character", starsMin: 6, powerMin: 16500, requiredCategories: ["Separatist"], squadSize: 5 },
      [
        member("Nute Gunray", "NUTEGUNRAY"),
        member("B1 Battle Droid", "B1BATTLEDROIDV2"),
        member("B2 Super Battle Droid", "B2SUPERBATTLEDROID"),
        member("Droideka", "DROIDEKA"),
      ],
      "Current unit mission listings identify Nute Gunray, B1 Battle Droid, B2 Super Battle Droid and Droideka in this Phase 1 Canyons special mission. The fifth slot remains a legal Separatist flex slot here; MagnaGuard is a tested recommendation, not asserted as a hard mandatory portrait gate.",
    );
  }

  if (next.id === "s2") {
    next.name = "Acklay Special Mission — Geonosians";
    next.entry = {
      ...next.entry,
      verified: true,
      unitType: "Character",
      starsMin: 6,
      powerMin: 16500,
      requiredCategories: ["Geonosian"],
      squadSize: 5,
      notes: "Phase 2 Petranaki Arena Acklay encounter. Five Geonosian characters at 16,500+ power.",
    };
  }

  if (next.id === "c8") {
    next.name = "Combat Mission — Count Dooku + Asajj Ventress";
    next.entry = withMandatory(
      { ...next.entry, unitType: "Character", starsMin: 6, powerMin: 16500 },
      [
        member("Count Dooku", "COUNTDOOKU"),
        member("Asajj Ventress", "ASAJVENTRESS"),
      ],
      "Current SWGOH.GG unit mission listings place both Count Dooku and Asajj Ventress in this Phase 2 Separatist Command combat mission. Both must clear the 16,500+ power entry threshold. No additional named-unit gate is asserted by this override.",
    );
  }

  if (next.id === "c21") {
    next.name = "Combat Mission — Count Dooku + Separatists";
    next.entry = withMandatory(
      { ...next.entry, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Separatist"] },
      [member("Count Dooku", "COUNTDOOKU", { bypassPool: false })],
      "Phase 4 Count Dooku's Hangar combat mission. Count Dooku is a required Separatist and all selected Separatists must meet the 7-star, 16,500+ power gate.",
    );
  }

  if (next.id === "s4") {
    next.name = "Special Mission — Wat Tambor + Separatists";
    next.entry = withMandatory(
      { ...next.entry, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Separatist"] },
      [member("Wat Tambor", "WATTAMBOR", { bypassPool: false })],
      "Phase 4 Rear Flank special mission. Wat Tambor is required; all selected Separatists must meet the 7-star, 16,500+ power gate.",
    );
  }

  return next;
}

export function normalizeDsGeoTerritories(territories = RAW_DS_GEO_TERRITORIES) {
  return (territories || []).map((territory) => ({
    ...territory,
    missions: (territory.missions || []).map(normalizeDsGeoMission),
  }));
}

export const DS_GEO_TERRITORIES = Object.freeze(normalizeDsGeoTerritories());
export const DS_GEO_MISSIONS = Object.freeze(DS_GEO_TERRITORIES.flatMap((territory) => territory.missions));

export function dsGeoTerritoryById(id) {
  return DS_GEO_TERRITORIES.find((territory) => territory.id === String(id || "")) || DS_GEO_TERRITORIES[0];
}

export function dsGeoTerritoriesForPhase(phase) {
  return DS_GEO_TERRITORIES.filter((territory) => territory.phase === Number(phase));
}
