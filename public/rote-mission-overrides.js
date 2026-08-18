import { roteFleetEntryAudit } from "./rote-fleet-entry-audit-data.js";

const CANONICAL_BASE_IDS = Object.freeze({
  BOKATANMANDALORE: "MANDALORBOKATAN",
  BESKARMANDO: "THEMANDALORIANBESKARARMOR",
  DARKTROOPERMOFFGIDEON: "MOFFGIDEONS3",
  L337: "L3_37",
  "000": "TRIPLEZERO",
});

const CANONICAL_MEMBER_NAME_IDS = Object.freeze({
  Scythe: "SCYTHE",
  "Lando's Millennium Falcon": "MILLENNIUMFALCONPRISTINE",
  Outrider: "OUTRIDER",
  Executor: "CAPITALEXECUTOR",
  Profundity: "CAPITALPROFUNDITY",
  Negotiator: "CAPITALNEGOTIATOR",
  Ghost: "GHOST",
  "Gauntlet Starfighter": "GAUNTLETSTARFIGHTER",
  "Imperial TIE Fighter": "TIEFIGHTERIMPERIAL",
});

const canonicalId = (value) => CANONICAL_BASE_IDS[String(value || "")] || String(value || "");

function normalizeMember(member = {}) {
  if (typeof member === "string") return member;
  const inferred = member.baseId || CANONICAL_MEMBER_NAME_IDS[String(member.name || "")] || "";
  return { ...member, baseId: canonicalId(inferred) };
}

function normalizeRecommendation(recommendation = {}) {
  return {
    ...recommendation,
    baseIds: Array.isArray(recommendation.baseIds) ? recommendation.baseIds.map(canonicalId) : recommendation.baseIds,
    optionalBaseIds: Array.isArray(recommendation.optionalBaseIds) ? recommendation.optionalBaseIds.map(canonicalId) : recommendation.optionalBaseIds,
    members: Array.isArray(recommendation.members) ? recommendation.members.map(normalizeMember) : recommendation.members,
  };
}

function communityTacticalRecommendation(id, presetName, memberNames) {
  return Object.freeze({
    id,
    name: presetName,
    confidence: "community",
    verifiedLegal: false,
    members: Object.freeze(memberNames.map((name) => Object.freeze({ name }))),
    sourceIds: Object.freeze(["genskaar-rote"]),
    lastVerified: "2026-08-19",
  });
}

const GEONOSIS_TACTICAL_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  sourceRevision: "7a4b848846bb394c0970f98780b08ce20a5926da",
  lastVerified: "2026-08-19",
});

const GEONOSIS_TACTICAL_OVERRIDES = Object.freeze({
  "geonosis-generic-1": Object.freeze({
    name: "Combat Mission — Nexu",
    enemies: Object.freeze(["Nexu"]),
    commandTag: "NEXU | SLKR / LV",
    presetPrefix: "ROTE-P2-GEO-NEXU",
    recommendations: Object.freeze([
      communityTacticalRecommendation("rote-p2-geo-nexu-slkr", "ROTE-P2-GEO-NEXU-SLKR", [
        "Supreme Leader Kylo Ren",
        "First Order Officer",
        "Kylo Ren (Unmasked)",
        "General Hux",
        "Sith Trooper",
      ]),
      communityTacticalRecommendation("rote-p2-geo-nexu-lv", "ROTE-P2-GEO-NEXU-LV", [
        "Lord Vader",
        "Maul",
        "Royal Guard",
        "Admiral Piett",
        "Darth Vader",
      ]),
    ]),
  }),
  "geonosis-generic-2": Object.freeze({
    name: "Combat Mission — Acklay",
    enemies: Object.freeze(["Acklay"]),
    commandTag: "ACKLAY | SLKR / LV / BH+WAT / INQS",
    presetPrefix: "ROTE-P2-GEO-ACKLAY",
    recommendations: Object.freeze([
      communityTacticalRecommendation("rote-p2-geo-acklay-slkr", "ROTE-P2-GEO-ACKLAY-SLKR", [
        "Supreme Leader Kylo Ren",
        "First Order Officer",
        "Kylo Ren (Unmasked)",
        "General Hux",
        "Sith Trooper",
      ]),
      communityTacticalRecommendation("rote-p2-geo-acklay-lv", "ROTE-P2-GEO-ACKLAY-LV", [
        "Lord Vader",
        "Maul",
        "Royal Guard",
        "Admiral Piett",
        "Darth Vader",
      ]),
      communityTacticalRecommendation("rote-p2-geo-acklay-bh-wat", "ROTE-P2-GEO-ACKLAY-BH-WAT", [
        "Bossk",
        "Boba Fett",
        "Jango Fett",
        "Boba Fett, Scion of Jango",
        "Wat Tambor",
      ]),
      communityTacticalRecommendation("rote-p2-geo-acklay-inqs", "ROTE-P2-GEO-ACKLAY-INQS", [
        "Grand Inquisitor",
        "Seventh Sister",
        "Ninth Sister",
        "Fifth Brother",
        "Eighth Brother",
      ]),
    ]),
  }),
  "geonosis-generic-3": Object.freeze({
    name: "Combat Mission — Reek",
    enemies: Object.freeze(["Reek"]),
    commandTag: "REEK | SEE+WAT / INQS / LV / SLKR / TRENCH",
    presetPrefix: "ROTE-P2-GEO-REEK",
    recommendations: Object.freeze([
      communityTacticalRecommendation("rote-p2-geo-reek-see-wat", "ROTE-P2-GEO-REEK-SEE-WAT", [
        "Sith Eternal Emperor",
        "Wat Tambor",
        "Darth Nihilus",
        "Darth Sion",
        "Darth Traya",
      ]),
      communityTacticalRecommendation("rote-p2-geo-reek-inqs", "ROTE-P2-GEO-REEK-INQS", [
        "Grand Inquisitor",
        "Seventh Sister",
        "Ninth Sister",
        "Fifth Brother",
        "Eighth Brother",
      ]),
      communityTacticalRecommendation("rote-p2-geo-reek-lv", "ROTE-P2-GEO-REEK-LV", [
        "Lord Vader",
        "Maul",
        "Royal Guard",
        "Admiral Piett",
        "Darth Vader",
      ]),
      communityTacticalRecommendation("rote-p2-geo-reek-slkr", "ROTE-P2-GEO-REEK-SLKR", [
        "Supreme Leader Kylo Ren",
        "First Order Officer",
        "Kylo Ren (Unmasked)",
        "General Hux",
        "Sith Trooper",
      ]),
      communityTacticalRecommendation("rote-p2-geo-reek-trench", "ROTE-P2-GEO-REEK-TRENCH", [
        "Admiral Trench",
        "Nute Gunray",
        "Jango Fett",
        "Count Dooku",
        "Wat Tambor",
      ]),
    ]),
  }),
  "geonosis-geos": Object.freeze({
    name: "Combat Mission — Geonosians",
    enemies: Object.freeze(["Partisan Fighters", "Kanan Jarrus / Ezra Bridger / Chopper / Captain Rex"]),
    commandTag: "GEOS | GBA LEAD",
    presetPrefix: "ROTE-P2-GEO-GEOS",
    recommendations: Object.freeze([
      communityTacticalRecommendation("rote-p2-geo-geos", "ROTE-P2-GEO-GEOS", [
        "Geonosian Brood Alpha",
        "Geonosian Soldier",
        "Geonosian Spy",
        "Poggle the Lesser",
        "Sun Fac",
      ]),
    ]),
  }),
  "geonosis-fleet": Object.freeze({
    name: "Fleet Mission — Leviathan",
    enemies: Object.freeze(["Malevolence / Geonosian fleet"]),
    commandTag: "FLEET | LEVIATHAN",
    presetPrefix: "ROTE-P2-GEO-FLEET",
    recommendations: Object.freeze([
      communityTacticalRecommendation("rote-p2-geo-fleet-leviathan", "ROTE-P2-GEO-FLEET-LEVIATHAN", [
        "Leviathan",
        "Sith Fighter",
        "Fury-class Interceptor",
        "B-28 Extinction-class Bomber",
        "Mark VI Interceptor",
        "TIE Dagger",
        "Scimitar",
      ]),
    ]),
  }),
});

const TATOOINE_UNLOCK_RECOMMENDATION = Object.freeze({
  id: "rote-tatooine-mandalore-unlock-ig12",
  name: "Bo-Katan + Beskar Mando + IG-12",
  confidence: "community",
  verifiedLegal: true,
  members: [
    { name: "Bo-Katan (Mand'alor)", baseId: "MANDALORBOKATAN" },
    { name: "The Mandalorian (Beskar Armor)", baseId: "THEMANDALORIANBESKARARMOR" },
    { name: "IG-12 & Grogu", baseId: "IG12" },
  ],
  sourceIds: ["cg-mandalore-zone", "starwarsfans-mandalore-unlock"],
  lastVerified: "2026-08-15",
});

export function normalizeRoteMission(mission = {}) {
  const next = {
    ...mission,
    entry: normalizeEntry(mission.entry || {}),
    recommendations: Array.isArray(mission.recommendations) ? mission.recommendations.map(normalizeRecommendation) : [],
  };

  const fleetAudit = roteFleetEntryAudit(next.id);
  if (fleetAudit) {
    next.entry = {
      ...next.entry,
      verified: true,
      unitType: "Ship",
      alignment: null,
      allowedAlignments: [...fleetAudit.allowedAlignments],
      starsMin: 7,
      relicMin: null,
      gearMin: null,
      powerMin: null,
      requiredBaseIds: [],
      allowedBaseIds: [],
      mandatoryMembers: fleetAudit.mandatoryMembers.map(normalizeMember),
      requiredCategories: [],
      categoryMode: "all",
      notes: `Audited fleet entry: ${fleetAudit.sourceRequirement}.`,
    };
    next.sources = [...new Set([...(next.sources || []), ...fleetAudit.sourceIds])];
    next.lastVerified = fleetAudit.lastVerified;
  }

  const geonosisTactical = GEONOSIS_TACTICAL_OVERRIDES[next.id];
  if (geonosisTactical) {
    next.name = geonosisTactical.name;
    next.enemies = [...geonosisTactical.enemies];
    next.recommendations = geonosisTactical.recommendations.map(normalizeRecommendation);
    next.sources = [...new Set([...(next.sources || []), GEONOSIS_TACTICAL_SOURCE.sourceId])];
    next.tactical = {
      encounter: geonosisTactical.name.replace(/^.*—\s*/, ""),
      commandTag: geonosisTactical.commandTag,
      presetPrefix: geonosisTactical.presetPrefix,
      sourceId: GEONOSIS_TACTICAL_SOURCE.sourceId,
      sourceRevision: GEONOSIS_TACTICAL_SOURCE.sourceRevision,
      lastVerified: GEONOSIS_TACTICAL_SOURCE.lastVerified,
    };
  }

  if (next.id === "tatooine-mandalore-unlock") {
    next.name = "Krayt Dragon Special Mission — Unlock Mandalore";
    next.entry = {
      ...next.entry,
      verified: true,
      unitType: "Character",
      alignment: null,
      allowedAlignments: [],
      starsMin: 7,
      relicMin: 7,
      squadSize: 3,
      requiredBaseIds: [],
      allowedBaseIds: [],
      requiredCategories: ["Mandalorian"],
      categoryMode: "all",
      mandatoryMembers: [
        { name: "Bo-Katan (Mand'alor)", baseId: "MANDALORBOKATAN", relicMin: 7 },
        { name: "The Mandalorian (Beskar Armor)", baseId: "THEMANDALORIANBESKARARMOR", relicMin: 7 },
      ],
      notes: "Official unlock mission: Bo-Katan (Mand'alor) R7 + The Mandalorian (Beskar Armor) R7 + one additional Mandalorian R7. Twenty-five guild clears unlock Mandalore for that Territory Battle instance.",
    };
    next.recommendations = [TATOOINE_UNLOCK_RECOMMENDATION];
    next.rewards = ["50 Mk II Guild Event Tokens per clear", "25 guild clears unlock Mandalore"];
    next.sources = [...new Set([...(next.sources || []), "cg-mandalore-zone", "starwarsfans-mandalore-unlock"])];
  }

  if (next.id === "mandalore-bkm") {
    next.entry = {
      ...next.entry,
      mandatoryMembers: (next.entry.mandatoryMembers || []).map(normalizeMember),
    };
  }

  return next;
}

function normalizeEntry(entry = {}) {
  return {
    ...entry,
    requiredBaseIds: Array.isArray(entry.requiredBaseIds) ? entry.requiredBaseIds.map(canonicalId) : entry.requiredBaseIds,
    allowedBaseIds: Array.isArray(entry.allowedBaseIds) ? entry.allowedBaseIds.map(canonicalId) : entry.allowedBaseIds,
    mandatoryMembers: Array.isArray(entry.mandatoryMembers) ? entry.mandatoryMembers.map(normalizeMember) : entry.mandatoryMembers,
  };
}

export function normalizeRoteMissions(missions = []) {
  return (missions || []).map(normalizeRoteMission);
}

export function normalizeRoteMissionMap(missionMap = {}) {
  return Object.fromEntries(Object.entries(missionMap || {}).map(([planetId, missions]) => [planetId, normalizeRoteMissions(missions)]));
}
