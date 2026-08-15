import { createMissionRecord, MISSION_CONFIDENCE } from "./tb-mission-intelligence.js";

export const HOTH_LS_SOURCES = Object.freeze([
  { id: "swgoh-wiki-hoth-ls", label: "SWGOH Wiki · Hoth Rebel Assault zone tables", kind: "current-reference" },
  { id: "swgohgg-hoth-ls", label: "SWGOH.GG · Hoth Rebel Assault mission/unit records", kind: "current-reference" },
]);

const planning = (id, name, members) => ({
  id,
  name,
  members,
  confidence: MISSION_CONFIDENCE.UNKNOWN,
  verifiedLegal: false,
  sourceIds: ["planning-template"],
  lastVerified: "2026-08-15",
});

const CLS_REBELS = planning("hoth-cls", "CLS Rebels planning core", ["Commander Luke Skywalker", "Han Solo", "Chewbacca", "C-3PO", "Threepio & Chewie"]);
const PHOENIX = planning("hoth-phoenix", "Phoenix planning core", ["Hera Syndulla", "Captain Rex", "Kanan Jarrus", "Chopper", "Ezra Bridger"]);
const ROGUE_ONE = planning("hoth-rogue-one", "Rogue One planning core", ["Admiral Raddus", "Jyn Erso", "Cassian Andor", "K-2SO", "Bistan"]);
const HOTH_REBELS = planning("hoth-heroes", "Hoth Rebel mission core", ["Rebel Officer Leia Organa", "Hoth Rebel Scout", "Hoth Rebel Soldier", "Captain Han Solo", "Commander Luke Skywalker"]);
const HOME_ONE = planning("hoth-home-one", "Home One light-side fleet", ["Home One", "Han's Millennium Falcon", "Biggs Darklighter's X-wing", "Bistan's U-wing", "Rebel Y-wing"]);

const mission = (input) => createMissionRecord({
  tbId: "hoth-rebel",
  lastVerified: "2026-08-15",
  sources: ["swgoh-wiki-hoth-ls", "swgohgg-hoth-ls"],
  ...input,
});

const ls = (starsMin) => ({ verified: true, unitType: "Character", alignment: "Light", starsMin });
const faction = (starsMin, name) => ({ verified: true, unitType: "Character", alignment: "Light", starsMin, requiredCategories: [name] });
const ship = (starsMin) => ({ verified: true, unitType: "Ship", alignment: "Light", starsMin });
const named = (entry, name, baseId, bypassPool = false) => ({ ...entry, mandatoryMembers: [{ name, baseId, bypassPool }] });

const waves = Object.freeze({
  p1: [24000, 51000, 91000, 144000, 211000, 291000],
  p2: [43000, 72000, 115000, 172000, 243000, 329000],
  p3: [65000, 96000, 142000, 203000, 280000, 372000],
  p4: [76000, 111000, 163000, 232000, 319000, 423000],
  p5: [90000, 128000, 185000, 261000, 356000, 470000],
  p6: [152000, 191000, 249000, 327000, 424000, 541000],
});

export const HOTH_LS_TERRITORIES = Object.freeze([
  {
    id: "p1-main", phase: 1, lane: "middle", name: "Rebel Base", unitType: "Character", starsMin: 2, x: 8, y: 50,
    starThresholds: [885000, 6580000, 45600000], platoonTp: 100000,
    missions: [
      mission({ id: "p1-cm1", territoryId: "p1-main", phase: 1, name: "Combat Mission 1", missionType: "combat", entry: ls(2), waves: waves.p1, recommendations: [CLS_REBELS] }),
      mission({ id: "p1-cm2", territoryId: "p1-main", phase: 1, name: "Combat Mission 2", missionType: "combat", entry: ls(2), waves: waves.p1, recommendations: [HOTH_REBELS] }),
      mission({ id: "p1-phoenix", territoryId: "p1-main", phase: 1, name: "Special Mission — Phoenix", missionType: "special", entry: faction(2, "Phoenix"), rewards: ["7 Mk I Guild Event Tokens"], recommendations: [PHOENIX] }),
    ],
  },
  {
    id: "p2-top", phase: 2, lane: "top", name: "Ion Cannon", unitType: "Character", starsMin: 3, x: 25, y: 30,
    starThresholds: [1900000, 19800000, 55000000], platoonTp: 120000,
    missions: [
      mission({ id: "p2-ion-ls", territoryId: "p2-top", phase: 2, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(3), waves: waves.p2, recommendations: [CLS_REBELS] }),
      mission({ id: "p2-ion-rebel", territoryId: "p2-top", phase: 2, name: "Combat Mission — Rebel + Hoth Rebel Soldier", missionType: "combat", entry: named(faction(3, "Rebel"), "Hoth Rebel Soldier", "HOTHREBELSOLDIER"), waves: waves.p2, recommendations: [HOTH_REBELS, CLS_REBELS], mechanics: ["Hoth Rebel Soldier is a required mission unit at Ion Cannon."] }),
    ],
  },
  {
    id: "p2-bottom", phase: 2, lane: "bottom", name: "Overlook", unitType: "Character", starsMin: 3, x: 25, y: 72,
    starThresholds: [1900000, 15400000, 43800000], platoonTp: 120000,
    missions: [
      mission({ id: "p2-overlook-ls", territoryId: "p2-bottom", phase: 2, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(3), waves: waves.p2, recommendations: [CLS_REBELS] }),
      mission({ id: "p2-overlook-rogue", territoryId: "p2-bottom", phase: 2, name: "Special Mission — Rogue One", missionType: "special", entry: faction(3, "Rogue One"), rewards: ["8 Mk I Guild Event Tokens"], recommendations: [ROGUE_ONE] }),
    ],
  },
  {
    id: "p3-top", phase: 3, lane: "top", name: "Rear Airspace", unitType: "Ship", starsMin: 4, x: 42, y: 14,
    starThresholds: [1920000, 16500000, 26300000], platoonTp: 140000,
    missions: [mission({ id: "p3-fleet", territoryId: "p3-top", phase: 3, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(3), waves: [371000], recommendations: [HOME_ONE] })],
  },
  {
    id: "p3-middle", phase: 3, lane: "middle", name: "Rear Trenches", unitType: "Character", starsMin: 4, x: 42, y: 48,
    starThresholds: [3510000, 27600000, 64800000], platoonTp: 140000,
    missions: [
      mission({ id: "p3-trenches-ls", territoryId: "p3-middle", phase: 3, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(4), waves: waves.p3, recommendations: [CLS_REBELS] }),
      mission({ id: "p3-trenches-rebel", territoryId: "p3-middle", phase: 3, name: "Combat Mission — Rebel + Hoth Rebel Scout", missionType: "combat", entry: named(faction(4, "Rebel"), "Hoth Rebel Scout", "HOTHREBELSCOUT"), waves: waves.p3, recommendations: [HOTH_REBELS, CLS_REBELS] }),
    ],
  },
  {
    id: "p3-bottom", phase: 3, lane: "bottom", name: "Power Generator", unitType: "Character", starsMin: 4, x: 42, y: 82,
    starThresholds: [3510000, 22400000, 52200000], platoonTp: 140000,
    missions: [
      mission({ id: "p3-generator-ls", territoryId: "p3-bottom", phase: 3, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(4), waves: waves.p3, recommendations: [CLS_REBELS] }),
      mission({ id: "p3-rolo-shard", territoryId: "p3-bottom", phase: 3, name: "Special Mission — Hoth Rebel Soldier / ROLO Shard", missionType: "special", entry: named(ls(5), "Hoth Rebel Soldier", "HOTHREBELSOLDIER"), rewards: ["1 Rebel Officer Leia Organa shard"], recommendations: [HOTH_REBELS] }),
    ],
  },
  {
    id: "p4-top", phase: 4, lane: "top", name: "Forward Airspace", unitType: "Ship", starsMin: 5, x: 58, y: 14,
    starThresholds: [2176000, 18700000, 29800000], platoonTp: 160000,
    missions: [mission({ id: "p4-fleet", territoryId: "p4-top", phase: 4, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(4), waves: [478000], recommendations: [HOME_ONE] })],
  },
  {
    id: "p4-middle", phase: 4, lane: "middle", name: "Forward Trenches", unitType: "Character", starsMin: 5, x: 58, y: 48,
    starThresholds: [5220000, 34700000, 78100000], platoonTp: 160000,
    missions: [
      mission({ id: "p4-trenches-ls", territoryId: "p4-middle", phase: 4, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(5), waves: waves.p4, recommendations: [CLS_REBELS] }),
      mission({ id: "p4-trenches-rebel", territoryId: "p4-middle", phase: 4, name: "Combat Mission — Rebel + Hoth Rebel Soldier", missionType: "combat", entry: named(faction(5, "Rebel"), "Hoth Rebel Soldier", "HOTHREBELSOLDIER"), waves: waves.p4, recommendations: [HOTH_REBELS, CLS_REBELS] }),
    ],
  },
  {
    id: "p4-bottom", phase: 4, lane: "bottom", name: "Outer Pass", unitType: "Character", starsMin: 5, x: 58, y: 82,
    starThresholds: [5220000, 28300000, 62600000], platoonTp: 160000,
    missions: [
      mission({ id: "p4-pass-ls", territoryId: "p4-bottom", phase: 4, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(5), waves: waves.p4, recommendations: [CLS_REBELS] }),
      mission({ id: "p4-rolo", territoryId: "p4-bottom", phase: 4, name: "Special Mission — Rebel Officer Leia Organa", missionType: "special", entry: named(ls(5), "Rebel Officer Leia Organa", "HOTHLEIA"), rewards: ["20 Mk I Guild Event Tokens"], recommendations: [HOTH_REBELS] }),
    ],
  },
  {
    id: "p5-top", phase: 5, lane: "top", name: "Contested Airspace", unitType: "Ship", starsMin: 6, x: 75, y: 14,
    starThresholds: [18000000, 34000000, 50000000], platoonTp: 180000,
    missions: [mission({ id: "p5-fleet", territoryId: "p5-top", phase: 5, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(5), waves: [536000], recommendations: [HOME_ONE] })],
  },
  {
    id: "p5-middle", phase: 5, lane: "middle", name: "Snowfields", unitType: "Character", starsMin: 6, x: 75, y: 48,
    starThresholds: [14100000, 49300000, 89800000], platoonTp: 180000,
    missions: [
      mission({ id: "p5-phoenix", territoryId: "p5-middle", phase: 5, name: "Combat Mission — Phoenix", missionType: "combat", entry: faction(6, "Phoenix"), waves: waves.p5, recommendations: [PHOENIX] }),
      mission({ id: "p5-rebel-scout", territoryId: "p5-middle", phase: 5, name: "Combat Mission — Rebel + Hoth Rebel Scout", missionType: "combat", entry: named(faction(6, "Rebel"), "Hoth Rebel Scout", "HOTHREBELSCOUT"), waves: waves.p5, recommendations: [HOTH_REBELS, CLS_REBELS] }),
      mission({ id: "p5-cls", territoryId: "p5-middle", phase: 5, name: "Special Mission — Commander Luke Skywalker", missionType: "special", entry: named(ls(6), "Commander Luke Skywalker", "COMMANDERLUKESKYWALKER"), rewards: ["20 Mk I Guild Event Tokens"], recommendations: [CLS_REBELS] }),
    ],
  },
  {
    id: "p5-bottom", phase: 5, lane: "bottom", name: "Forward Stronghold", unitType: "Character", starsMin: 6, x: 75, y: 82,
    starThresholds: [11100000, 41000000, 71600000], platoonTp: 180000,
    missions: [mission({ id: "p5-stronghold", territoryId: "p5-bottom", phase: 5, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(6), waves: waves.p5, recommendations: [CLS_REBELS] })],
  },
  {
    id: "p6-top", phase: 6, lane: "top", name: "Imperial Fleet Staging Area", unitType: "Ship", starsMin: 7, x: 92, y: 14,
    starThresholds: [21600000, 40800000, 60000000], platoonTp: 200000,
    missions: [mission({ id: "p6-fleet", territoryId: "p6-top", phase: 6, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(6), waves: [614000], recommendations: [HOME_ONE] })],
  },
  {
    id: "p6-middle", phase: 6, lane: "middle", name: "Imperial Flank", unitType: "Character", starsMin: 7, x: 92, y: 48,
    starThresholds: [31000000, 72000000, 100000000], platoonTp: 200000,
    missions: [
      mission({ id: "p6-rebel", territoryId: "p6-middle", phase: 6, name: "Combat Mission — Rebel", missionType: "combat", entry: faction(7, "Rebel"), waves: waves.p6, recommendations: [CLS_REBELS, HOTH_REBELS] }),
      mission({ id: "p6-rogue", territoryId: "p6-middle", phase: 6, name: "Combat Mission — Rogue One", missionType: "combat", entry: faction(7, "Rogue One"), waves: waves.p6, recommendations: [ROGUE_ONE] }),
    ],
  },
  {
    id: "p6-bottom", phase: 6, lane: "bottom", name: "Imperial Landing", unitType: "Character", starsMin: 7, x: 92, y: 82,
    starThresholds: [26400000, 59300000, 81500000], platoonTp: 200000,
    missions: [
      mission({ id: "p6-landing-ls", territoryId: "p6-bottom", phase: 6, name: "Combat Mission — Light Side", missionType: "combat", entry: ls(7), waves: waves.p6, recommendations: [CLS_REBELS] }),
      mission({ id: "p6-rolo", territoryId: "p6-bottom", phase: 6, name: "Special Mission — Rebel Officer Leia Organa", missionType: "special", entry: named(ls(7), "Rebel Officer Leia Organa", "HOTHLEIA"), rewards: ["30 Mk I Guild Event Tokens"], recommendations: [HOTH_REBELS] }),
    ],
  },
]);

export const HOTH_LS_CAMPAIGN = Object.freeze({
  id: "hoth-rebel",
  name: "Hoth: Rebel Assault",
  shortName: "Hoth LS",
  kicker: "HOTH · REBEL ASSAULT",
  theme: "hoth-light",
  defaultTerritoryId: "p1-main",
  mapDescription: "Six-phase Hoth campaign with exact zone thresholds, faction missions and verified named-unit mission requirements.",
  sources: HOTH_LS_SOURCES,
  territories: HOTH_LS_TERRITORIES,
});
