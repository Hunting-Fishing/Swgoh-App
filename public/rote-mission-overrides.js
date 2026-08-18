import { roteFleetEntryAudit } from "./rote-fleet-entry-audit-data.js";
import {
  ROTE_TACTICAL_P1_P2_SOURCE,
  roteTacticalP1P2Override,
} from "./rote-tactical-p1-p2-data.js";
import {
  ROTE_TACTICAL_P3_SOURCE,
  roteTacticalP3Override,
} from "./rote-tactical-p3-data.js";
import {
  ROTE_TACTICAL_P4_SOURCE,
  roteTacticalP4Override,
} from "./rote-tactical-p4-data.js";

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

function normalizeEntry(entry = {}) {
  return {
    ...entry,
    requiredBaseIds: Array.isArray(entry.requiredBaseIds) ? entry.requiredBaseIds.map(canonicalId) : entry.requiredBaseIds,
    allowedBaseIds: Array.isArray(entry.allowedBaseIds) ? entry.allowedBaseIds.map(canonicalId) : entry.allowedBaseIds,
    mandatoryMembers: Array.isArray(entry.mandatoryMembers) ? entry.mandatoryMembers.map(normalizeMember) : entry.mandatoryMembers,
  };
}

const TATOOINE_UNLOCK_RECOMMENDATIONS = Object.freeze([
  Object.freeze({
    id: "rote-tatooine-mandalore-unlock-ig12",
    name: "ROTE-P3-TAT-MANDALORE-IG12",
    confidence: "community",
    verifiedLegal: true,
    members: [
      { name: "Bo-Katan (Mand'alor)", baseId: "MANDALORBOKATAN" },
      { name: "The Mandalorian (Beskar Armor)", baseId: "THEMANDALORIANBESKARARMOR" },
      { name: "IG-12 & Grogu", baseId: "IG12" },
    ],
    sourceIds: ["cg-mandalore-zone", "starwarsfans-mandalore-unlock", "genskaar-rote"],
    lastVerified: "2026-08-19",
  }),
  Object.freeze({
    id: "rote-tatooine-mandalore-unlock-paz",
    name: "ROTE-P3-TAT-MANDALORE-PAZ",
    confidence: "community",
    verifiedLegal: true,
    members: [
      { name: "Bo-Katan (Mand'alor)", baseId: "MANDALORBOKATAN" },
      { name: "The Mandalorian (Beskar Armor)", baseId: "THEMANDALORIANBESKARARMOR" },
      { name: "Paz Vizsla", baseId: "PAZVIZSLA" },
    ],
    sourceIds: ["cg-mandalore-zone", "starwarsfans-mandalore-unlock", "genskaar-rote"],
    lastVerified: "2026-08-19",
  }),
]);

function applyTacticalOverride(next, tacticalOverride, source) {
  if (!tacticalOverride) return next;
  next.name = tacticalOverride.name;
  next.enemies = [...tacticalOverride.enemies];
  next.recommendations = tacticalOverride.recommendations.map(normalizeRecommendation);
  if (tacticalOverride.missionType) next.missionType = tacticalOverride.missionType;
  next.sources = [...new Set([...(next.sources || []), source.sourceId])];
  next.tactical = {
    encounter: tacticalOverride.name,
    commandTag: tacticalOverride.commandTag,
    presetPrefix: tacticalOverride.presetPrefix,
    sourceId: source.sourceId,
    sourceRevision: source.sourceRevision,
    lastVerified: source.lastVerified,
  };
  return next;
}

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

  applyTacticalOverride(next, roteTacticalP1P2Override(next.id), ROTE_TACTICAL_P1_P2_SOURCE);
  applyTacticalOverride(next, roteTacticalP3Override(next.id), ROTE_TACTICAL_P3_SOURCE);
  applyTacticalOverride(next, roteTacticalP4Override(next.id), ROTE_TACTICAL_P4_SOURCE);

  if (next.id === "tatooine-mandalore-unlock") {
    next.name = "Unlock Mandalore · Krayt Dragon";
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
    next.enemies = ["Krayt Dragon"];
    next.recommendations = TATOOINE_UNLOCK_RECOMMENDATIONS.map(normalizeRecommendation);
    next.rewards = ["50 Mk II Guild Event Tokens per clear", "25 guild clears unlock Mandalore"];
    next.sources = [...new Set([...(next.sources || []), "cg-mandalore-zone", "starwarsfans-mandalore-unlock", ROTE_TACTICAL_P3_SOURCE.sourceId])];
    next.tactical = {
      encounter: "Unlock Mandalore · Krayt Dragon",
      commandTag: "MANDALORE UNLOCK | BKM + BAM + 1 MANDO",
      presetPrefix: "ROTE-P3-TAT-MANDALORE",
      sourceId: ROTE_TACTICAL_P3_SOURCE.sourceId,
      sourceRevision: ROTE_TACTICAL_P3_SOURCE.sourceRevision,
      lastVerified: ROTE_TACTICAL_P3_SOURCE.lastVerified,
    };
  }

  if (next.id === "mandalore-bkm") {
    next.entry = {
      ...next.entry,
      mandatoryMembers: (next.entry.mandatoryMembers || []).map(normalizeMember),
    };
  }

  return next;
}

export function normalizeRoteMissions(missions = []) {
  return (missions || []).map(normalizeRoteMission);
}

export function normalizeRoteMissionMap(missionMap = {}) {
  return Object.fromEntries(Object.entries(missionMap || {}).map(([planetId, missions]) => [planetId, normalizeRoteMissions(missions)]));
}
