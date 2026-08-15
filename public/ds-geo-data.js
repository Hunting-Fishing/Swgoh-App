import { MISSION_CONFIDENCE, createMissionRecord } from "./tb-mission-intelligence.js";

export const DS_GEO_SOURCES = Object.freeze({
  swgohgg: { id: "swgohgg", label: "SWGOH.GG current Territory Battle database", kind: "current-reference" },
  swgohWiki: { id: "swgoh-wiki", label: "SWGOH Wiki Separatist Might zone tables", kind: "reference" },
  genskaar: { id: "genskaar-geo", label: "Genskaar interactive Geonosis TB guide", kind: "community-reference", license: "MIT" },
});

const VERIFIED_DATE = "2026-08-15";

const communityTeam = (id, name, members, options = {}) => ({
  id,
  name,
  confidence: MISSION_CONFIDENCE.COMMUNITY,
  verifiedLegal: Boolean(options.verifiedLegal),
  members: members.map((member) => typeof member === "string" ? { name: member } : member),
  sourceIds: ["genskaar-geo"],
  minimum: options.minimum || {},
  saferTarget: options.saferTarget || {},
  zetas: options.zetas || [],
  omicrons: options.omicrons || [],
  abilities: options.abilities || [],
  modTargets: options.modTargets || [],
  strategy: options.strategy || [],
  lastVerified: VERIFIED_DATE,
});

const SITH_EMPIRE = communityTeam("sith-empire", "Sith Empire", ["Darth Revan", "Bastila Shan (Fallen)", "Darth Malak", "Sith Marauder", "HK-47"]);
const EMPIRE = communityTeam("empire", "Empire", ["Emperor Palpatine", "Darth Vader", "Grand Admiral Thrawn", "Grand Moff Tarkin", "TIE Fighter Pilot"]);
const IMP_TROOPERS = communityTeam("imperial-troopers", "Imperial Troopers", ["General Veers", "Admiral Piett", "Moff Gideon", "Range Trooper", "Colonel Starck"]);
const FIRST_ORDER = communityTeam("first-order", "First Order", ["Supreme Leader Kylo Ren", "General Hux", "Sith Trooper", "Kylo Ren (Unmasked)", "Kylo Ren"]);
const SEE_SITH = communityTeam("see-sith", "Sith Eternal + Sith", ["Sith Eternal Emperor", "Darth Nihilus", "Darth Sion", "Darth Maul", "Darth Sidious"]);
const BOUNTY_HUNTERS = communityTeam("bounty-hunters", "Bounty Hunters", ["Bossk", "Jango Fett", "Boba Fett", "Dengar", "Cad Bane"]);
const NIGHTSISTERS = communityTeam("nightsisters", "Nightsisters", ["Mother Talzin", "Asajj Ventress", "Nightsister Zombie", "Old Daka", "Nightsister Spirit"]);
const SEP_DROIDS = communityTeam("separatist-droids", "Separatist Droids", ["General Grievous", "B1 Battle Droid", "B2 Super Battle Droid", "Droideka", "IG-100 MagnaGuard"], { verifiedLegal: true });
const GEONOSIANS = communityTeam("geonosians", "Geonosians", ["Geonosian Brood Alpha", "Geonosian Spy", "Geonosian Soldier", "Sun Fac", "Poggle the Lesser"], { verifiedLegal: true });
const DOOKU_ASAJJ = communityTeam("dooku-asajj", "Count Dooku + Asajj core", ["Count Dooku", "Asajj Ventress"]);
const DOOKU_SEPS = communityTeam("dooku-separatists", "Dooku + Separatists", ["Count Dooku", "General Grievous", "B2 Super Battle Droid", "B1 Battle Droid", "Droideka"], { verifiedLegal: true });
const DOOKU_WAT = communityTeam("dooku-wat-seps", "Dooku + Wat Separatists", ["Count Dooku", "General Grievous", "B2 Super Battle Droid", "B1 Battle Droid", "Wat Tambor"], { verifiedLegal: true });
const HUTT_CARTEL = communityTeam("hutt-cartel", "Jabba Hutt Cartel", ["Jabba the Hutt", "Krrsantan", "Boushh (Leia Organa)", "Skiff Guard (Lando Calrissian)", "Boba Fett"], { verifiedLegal: true });

const MALEVOLENCE = communityTeam("malevolence", "Malevolence Separatist Fleet", ["Malevolence", "Hyena Bomber", "Vulture Droid", "Sun Fac's Geonosian Starfighter", "Geonosian Spy's Starfighter"]);
const EXECUTOR = communityTeam("executor", "Executor Bounty Hunter Fleet", ["Executor", "Hound's Tooth", "Xanadu Blood", "Slave I", "IG-2000"]);
const FINALIZER = communityTeam("finalizer", "Finalizer First Order Fleet", ["Finalizer", "TIE Silencer", "First Order SF TIE Fighter", "Kylo Ren's Command Shuttle", "First Order TIE Fighter"]);
const CHIMAERA = communityTeam("chimaera", "Chimaera Fleet", ["Chimaera", "Hound's Tooth", "Imperial TIE Fighter", "Xanadu Blood", "Emperor's Shuttle"]);

const genericCharacterTeams = [SITH_EMPIRE, FIRST_ORDER, EMPIRE, IMP_TROOPERS, BOUNTY_HUNTERS, NIGHTSISTERS];
const lateCharacterTeams = [SEE_SITH, FIRST_ORDER, SITH_EMPIRE, IMP_TROOPERS, EMPIRE];
const fleetTeams = [MALEVOLENCE, EXECUTOR, FINALIZER, CHIMAERA];

function mission(input) {
  return createMissionRecord({
    tbId: "geo-separatist",
    lastVerified: VERIFIED_DATE,
    sources: ["swgohgg", "swgoh-wiki", ...(input.community ? ["genskaar-geo"] : [])],
    ...input,
  });
}

export const DS_GEO_TERRITORIES = Object.freeze([
  {
    id: "p1-top", phase: 1, lane: "top", name: "Droid Factory", unitType: "Character", starsMin: 6,
    x: 12, y: 28, starThresholds: [65720000, 84340000, 109530000], platoonTp: 166700,
    missions: [
      mission({ id: "c1", territoryId: "p1-top", phase: 1, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6, notes: "Dark Side or Neutral characters." }, waves: [187500,297500,500000,792000], recommendations: genericCharacterTeams, community: true }),
      mission({ id: "c2", territoryId: "p1-top", phase: 1, name: "Combat Mission 2 — Separatist", missionType: "combat", entry: { verified: true, unitType: "Character", starsMin: 6, requiredCategories: ["Separatist"], notes: "Separatist characters." }, waves: [187500,297500,500000,792000], recommendations: [GEONOSIANS, SEP_DROIDS, DOOKU_SEPS], community: true }),
    ],
  },
  {
    id: "p1-bottom", phase: 1, lane: "bottom", name: "Canyons", unitType: "Character", starsMin: 6,
    x: 12, y: 72, starThresholds: [36465000, 67725000, 104190000], platoonTp: 166700,
    missions: [
      mission({ id: "c3", territoryId: "p1-bottom", phase: 1, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6 }, waves: [187500,297500,500000,792000], recommendations: [FIRST_ORDER, EMPIRE, NIGHTSISTERS, SITH_EMPIRE], community: true }),
      mission({ id: "c4", territoryId: "p1-bottom", phase: 1, name: "Combat Mission 2", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6 }, waves: [187500,297500,500000,792000], recommendations: [FIRST_ORDER, EMPIRE, NIGHTSISTERS, SITH_EMPIRE], community: true }),
      mission({ id: "s1", territoryId: "p1-bottom", phase: 1, name: "Special Mission — Separatist", missionType: "special", entry: { verified: true, unitType: "Character", starsMin: 6, powerMin: 16500, requiredCategories: ["Separatist"], notes: "Separatist characters at 16,500+ power." }, rewards: ["15 Mk II Guild Event Tokens"], recommendations: [SEP_DROIDS, DOOKU_SEPS], community: true }),
    ],
  },
  {
    id: "p2-top", phase: 2, lane: "top", name: "Core Ship Yards", unitType: "Ship", starsMin: 6,
    x: 37, y: 18, starThresholds: [26605000, 66150000, 106425000], platoonTp: 166700,
    missions: [
      mission({ id: "c5", territoryId: "p2-top", phase: 2, name: "Fleet Combat Mission 1", missionType: "fleet", entry: { verified: true, unitType: "Ship", alignment: "Dark", starsMin: 6, notes: "Dark Side ships." }, waves: [825000], recommendations: fleetTeams, community: true }),
      mission({ id: "c6", territoryId: "p2-top", phase: 2, name: "Fleet Combat Mission 2", missionType: "fleet", entry: { verified: true, unitType: "Ship", alignment: "Dark", starsMin: 6, notes: "Dark Side ships." }, waves: [1072500], recommendations: [EXECUTOR, MALEVOLENCE, FINALIZER, CHIMAERA], community: true }),
    ],
  },
  {
    id: "p2-middle", phase: 2, lane: "middle", name: "Separatist Command", unitType: "Character", starsMin: 6,
    x: 37, y: 50, starThresholds: [61025000, 95355000, 190710000], platoonTp: 166700,
    missions: [
      mission({ id: "c7", territoryId: "p2-middle", phase: 2, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6 }, waves: [270000,420000,708000,1080000], recommendations: [SEE_SITH, FIRST_ORDER, IMP_TROOPERS, EMPIRE, BOUNTY_HUNTERS], community: true }),
      mission({ id: "c8", territoryId: "p2-middle", phase: 2, name: "Restricted Combat — Dooku / Asajj reference", missionType: "combat", entry: { verified: false, unitType: "Character", starsMin: 6, powerMin: 16500, notes: "The current zone table verifies a 16,500+ power restriction but does not expose the portrait-enforced names in parsed text. Genskaar identifies Count Dooku + Asajj Ventress; exact named-unit legality remains intentionally unverified here." }, waves: [351000,546000,920400,1404000], recommendations: [DOOKU_ASAJJ], community: true }),
      mission({ id: "c9", territoryId: "p2-middle", phase: 2, name: "Combat Mission 3", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6 }, waves: [270000,420000,708000,1080000], recommendations: [FIRST_ORDER, SEE_SITH, IMP_TROOPERS, EMPIRE, BOUNTY_HUNTERS], community: true }),
    ],
  },
  {
    id: "p2-bottom", phase: 2, lane: "bottom", name: "Petranaki Arena", unitType: "Character", starsMin: 6,
    x: 37, y: 82, starThresholds: [42740000, 88530000, 152635000], platoonTp: 166700,
    missions: [
      mission({ id: "c10", territoryId: "p2-bottom", phase: 2, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6 }, waves: [270000,420000,708000,1080000], recommendations: [SEE_SITH, FIRST_ORDER, SITH_EMPIRE, EMPIRE, SEP_DROIDS], community: true }),
      mission({ id: "c11", territoryId: "p2-bottom", phase: 2, name: "Combat Mission 2", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 6 }, waves: [270000,420000,708000,1080000], recommendations: [SEE_SITH, FIRST_ORDER, SITH_EMPIRE, EMPIRE, SEP_DROIDS], community: true }),
      mission({ id: "s2", territoryId: "p2-bottom", phase: 2, name: "Special Mission — Geonosians", missionType: "special", entry: { verified: true, unitType: "Character", starsMin: 6, powerMin: 16500, requiredCategories: ["Geonosian"], notes: "Geonosian characters at 16,500+ power." }, rewards: ["20 Mk II Guild Event Tokens"], recommendations: [GEONOSIANS], community: true }),
    ],
  },
  {
    id: "p3-top", phase: 3, lane: "top", name: "Contested Air Space", unitType: "Ship", starsMin: 7,
    x: 62, y: 18, starThresholds: [34225000, 92410000, 142600000], platoonTp: 250000,
    missions: [
      mission({ id: "c12", territoryId: "p3-top", phase: 3, name: "Fleet Combat Mission 1", missionType: "fleet", entry: { verified: true, unitType: "Ship", alignment: "Dark", starsMin: 7 }, waves: [1665000], recommendations: [EXECUTOR, FINALIZER, CHIMAERA, MALEVOLENCE], community: true }),
      mission({ id: "c13", territoryId: "p3-top", phase: 3, name: "Fleet Combat Mission 2", missionType: "fleet", entry: { verified: true, unitType: "Ship", alignment: "Dark", starsMin: 7, notes: "Current zone table verifies Dark Side 7-star ships. Community reference heavily favors Geonosian-ship compositions; no additional named-ship gate is asserted here." }, waves: [2164500], recommendations: [MALEVOLENCE, CHIMAERA], community: true }),
    ],
  },
  {
    id: "p3-middle", phase: 3, lane: "middle", name: "Battleground", unitType: "Character", starsMin: 7,
    x: 62, y: 50, starThresholds: [58945000, 109465000, 168410000], platoonTp: 208333,
    missions: [
      mission({ id: "c14", territoryId: "p3-middle", phase: 3, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [336000,540000,910000,1352000], recommendations: [SEE_SITH, FIRST_ORDER, IMP_TROOPERS, EMPIRE, NIGHTSISTERS], community: true }),
      mission({ id: "c15", territoryId: "p3-middle", phase: 3, name: "Combat Mission 2 — Separatist Droids", missionType: "combat", entry: { verified: true, unitType: "Character", starsMin: 7, requiredCategories: ["Separatist", "Droid"], categoryMode: "all", notes: "Separatist Droid characters." }, waves: [336000,540000,910000,1352000], recommendations: [SEP_DROIDS], community: true }),
      mission({ id: "s3", territoryId: "p3-middle", phase: 3, name: "Wat Tambor Special Mission", missionType: "special", entry: { verified: true, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Geonosian"], notes: "Geonosian characters at 16,500+ power." }, rewards: ["1 Wat Tambor shard per successful player"], recommendations: [GEONOSIANS], community: true }),
    ],
  },
  {
    id: "p3-bottom", phase: 3, lane: "bottom", name: "Sand Dunes", unitType: "Character", starsMin: 7,
    x: 62, y: 82, starThresholds: [60315000, 94780000, 172325000], platoonTp: 208333,
    missions: [
      mission({ id: "c16", territoryId: "p3-bottom", phase: 3, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [336000,540000,910000,1352000], recommendations: [FIRST_ORDER, SEE_SITH, SITH_EMPIRE, BOUNTY_HUNTERS, EMPIRE], community: true }),
      mission({ id: "c17", territoryId: "p3-bottom", phase: 3, name: "Combat Mission 2", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [336000,540000,910000,1352000], recommendations: [FIRST_ORDER, SEE_SITH, SITH_EMPIRE, BOUNTY_HUNTERS, EMPIRE], community: true }),
    ],
  },
  {
    id: "p4-top", phase: 4, lane: "top", name: "Republic Fleet", unitType: "Ship", starsMin: 7,
    x: 87, y: 18, starThresholds: [54000000, 118800000, 200000000], platoonTp: 333333,
    missions: [
      mission({ id: "c18", territoryId: "p4-top", phase: 4, name: "Fleet Combat Mission", missionType: "fleet", entry: { verified: true, unitType: "Ship", alignment: "Dark", starsMin: 7 }, waves: [2530000], recommendations: [EXECUTOR, MALEVOLENCE, FINALIZER, CHIMAERA], community: true }),
    ],
  },
  {
    id: "p4-middle", phase: 4, lane: "middle", name: "Count Dooku's Hangar", unitType: "Character", starsMin: 7,
    x: 87, y: 50, starThresholds: [70460000, 192160000, 320265000], platoonTp: 250000,
    missions: [
      mission({ id: "c19", territoryId: "p4-middle", phase: 4, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [405000,675000,1038500,1564000], recommendations: lateCharacterTeams, community: true }),
      mission({ id: "c20", territoryId: "p4-middle", phase: 4, name: "Combat Mission 2", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [405000,675000,1038500,1564000], recommendations: lateCharacterTeams, community: true }),
      mission({ id: "c21", territoryId: "p4-middle", phase: 4, name: "Restricted Combat — Separatists", missionType: "combat", entry: { verified: true, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Separatist"], notes: "Separatist characters at 16,500+ power." }, waves: [1350050,2033200], recommendations: [DOOKU_SEPS, DOOKU_WAT, SEP_DROIDS], community: true }),
      mission({ id: "s5", territoryId: "p4-middle", phase: 4, name: "Special Mission — Jabba + Hutt Cartel", missionType: "special", entry: { verified: true, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Hutt Cartel"], mandatoryMembers: [{ name: "Jabba the Hutt", baseId: "JABBATHEHUTT" }], notes: "Jabba the Hutt is mandatory; remaining legal squad slots are Hutt Cartel characters at 16,500+ power." }, rewards: ["30 Mk II Guild Event Tokens"], recommendations: [HUTT_CARTEL], community: true }),
    ],
  },
  {
    id: "p4-bottom", phase: 4, lane: "bottom", name: "Rear Flank", unitType: "Character", starsMin: 7,
    x: 87, y: 82, starThresholds: [67565000, 144775000, 241295000], platoonTp: 250000,
    missions: [
      mission({ id: "c22", territoryId: "p4-bottom", phase: 4, name: "Combat Mission 1", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [405000,675000,1038500,1564000], recommendations: lateCharacterTeams, community: true }),
      mission({ id: "c23", territoryId: "p4-bottom", phase: 4, name: "Combat Mission 2", missionType: "combat", entry: { verified: true, unitType: "Character", allowedAlignments: ["Dark", "Neutral"], starsMin: 7 }, waves: [405000,675000,1038500,1564000], recommendations: lateCharacterTeams, community: true }),
      mission({ id: "s4", territoryId: "p4-bottom", phase: 4, name: "Special Mission — Separatist", missionType: "special", entry: { verified: true, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Separatist"], notes: "Separatist characters at 16,500+ power." }, rewards: ["40 Mk II Guild Event Tokens"], recommendations: [GEONOSIANS, SEP_DROIDS, DOOKU_WAT], community: true }),
    ],
  },
]);

export const DS_GEO_MISSIONS = Object.freeze(DS_GEO_TERRITORIES.flatMap((territory) => territory.missions));

export function dsGeoTerritoryById(id) {
  return DS_GEO_TERRITORIES.find((territory) => territory.id === String(id || "")) || DS_GEO_TERRITORIES[0];
}

export function dsGeoTerritoriesForPhase(phase) {
  return DS_GEO_TERRITORIES.filter((territory) => territory.phase === Number(phase));
}
