const CANONICAL_BASE_IDS = Object.freeze({
  BOKATANMANDALORE: "MANDALORBOKATAN",
  BESKARMANDO: "THEMANDALORIANBESKARARMOR",
  DARKTROOPERMOFFGIDEON: "MOFFGIDEONS3",
  L337: "L3_37",
  "000": "TRIPLEZERO",
});

const canonicalId = (value) => CANONICAL_BASE_IDS[String(value || "")] || String(value || "");

function normalizeMember(member = {}) {
  if (typeof member === "string") return member;
  return { ...member, baseId: canonicalId(member.baseId) };
}

function normalizeMandatoryAnyGroup(group = {}, index = 0) {
  const source = Array.isArray(group) ? { members: group } : group;
  return {
    ...source,
    id: String(source.id || `mandatory-any-${index + 1}`),
    label: String(source.label || "One of required units"),
    count: Math.max(1, Number(source.count || 1)),
    members: Array.isArray(source.members) ? source.members.map(normalizeMember) : [],
  };
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
    mandatoryAnyGroups: Array.isArray(entry.mandatoryAnyGroups) ? entry.mandatoryAnyGroups.map(normalizeMandatoryAnyGroup) : [],
  };
}

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

const BRACCA_CERE_CAL = Object.freeze({
  id: "rote-bracca-cere-cal",
  name: "Cere Junda + Cal Kestis",
  confidence: "verified",
  verifiedLegal: true,
  members: [
    { name: "Cere Junda", baseId: "CEREJUNDA", relicMin: 7 },
    { name: "Cal Kestis", baseId: "CALKESTIS", relicMin: 7 },
  ],
  sourceIds: ["cg-zeffo"],
  lastVerified: "2026-08-15",
});

const BRACCA_CERE_JKCK = Object.freeze({
  id: "rote-bracca-cere-jkck",
  name: "Cere Junda + Jedi Knight Cal Kestis",
  confidence: "verified",
  verifiedLegal: true,
  members: [
    { name: "Cere Junda", baseId: "CEREJUNDA", relicMin: 7 },
    { name: "Jedi Knight Cal Kestis", baseId: "JEDIKNIGHTCAL", relicMin: 7 },
  ],
  sourceIds: ["cg-zeffo"],
  lastVerified: "2026-08-15",
});

export function normalizeRoteMission(mission = {}) {
  const next = {
    ...mission,
    entry: normalizeEntry(mission.entry || {}),
    recommendations: Array.isArray(mission.recommendations) ? mission.recommendations.map(normalizeRecommendation) : [],
  };

  if (next.id === "bracca-zeffo-unlock") {
    next.name = "Special Unlock — Cere Junda + Any Cal Kestis";
    next.entry = {
      ...next.entry,
      verified: true,
      unitType: "Character",
      alignment: "Light",
      allowedAlignments: [],
      starsMin: 7,
      relicMin: 7,
      squadSize: 2,
      requiredBaseIds: [],
      allowedBaseIds: ["CEREJUNDA", "CALKESTIS", "JEDIKNIGHTCAL"],
      requiredCategories: [],
      mandatoryMembers: [
        { name: "Cere Junda", baseId: "CEREJUNDA", relicMin: 7 },
      ],
      mandatoryAnyGroups: [
        {
          id: "cal-variant",
          label: "One Cal Kestis variant",
          count: 1,
          members: [
            { name: "Cal Kestis", baseId: "CALKESTIS", relicMin: 7 },
            { name: "Jedi Knight Cal Kestis", baseId: "JEDIKNIGHTCAL", relicMin: 7 },
          ],
        },
      ],
      notes: "Official Zeffo gateway: Cere Junda R7 plus either Cal Kestis R7 or Jedi Knight Cal Kestis R7. Thirty guild clears during the active Territory Battle unlock Zeffo for that run.",
    };
    next.recommendations = [BRACCA_CERE_CAL, BRACCA_CERE_JKCK];
    next.rewards = ["50 Mk III Guild Event Tokens per clear", "30 guild clears unlock Zeffo"];
    next.sources = [...new Set([...(next.sources || []), "cg-zeffo"])];
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
      mandatoryAnyGroups: [],
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

export function normalizeRoteMissions(missions = []) {
  return (missions || []).map(normalizeRoteMission);
}

export function normalizeRoteMissionMap(missionMap = {}) {
  return Object.fromEntries(Object.entries(missionMap || {}).map(([planetId, missions]) => [planetId, normalizeRoteMissions(missions)]));
}
