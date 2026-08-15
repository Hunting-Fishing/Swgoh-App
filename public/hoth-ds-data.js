import { createMissionRecord, MISSION_CONFIDENCE } from "./tb-mission-intelligence.js";

export const HOTH_DS_SOURCES = Object.freeze([
  { id: "swgoh-wiki-hoth-ds", label: "SWGOH Wiki · Hoth Imperial Retaliation zone tables", kind: "current-reference" },
  { id: "swgohgg-hoth-ds", label: "SWGOH.GG · Hoth Imperial Retaliation mission/unit records", kind: "current-reference" },
  { id: "cg-jabba-hoth", label: "Capital Games · Jabba Hoth/Geonosis battle announcement", kind: "official" },
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

const EMPIRE = planning("hoth-ds-empire", "Empire planning core", ["Emperor Palpatine", "Darth Vader", "Grand Admiral Thrawn", "Mara Jade, The Emperor's Hand", "Royal Guard"]);
const TROOPERS = planning("hoth-ds-troopers", "Imperial Troopers planning core", ["General Veers", "Admiral Piett", "Colonel Starck", "Range Trooper", "Dark Trooper"]);
const BOUNTY = planning("hoth-ds-bh", "Bounty Hunter planning core", ["Bossk", "The Mandalorian", "Greef Karga", "Boba Fett", "Dengar"]);
const JABBA = planning("hoth-ds-jabba", "Jabba Hutt Cartel planning core", ["Jabba the Hutt", "Boushh (Leia Organa)", "Krrsantan", "Skiff Guard (Lando Calrissian)", "Embo"]);
const CHIMAERA = planning("hoth-ds-chimaera", "Chimaera dark-side fleet", ["Chimaera", "TIE Advanced x1", "Imperial TIE Fighter", "TIE Bomber", "Emperor's Shuttle"]);
const EXECUTOR = planning("hoth-ds-executor", "Executor dark-side fleet", ["Executor", "Hound's Tooth", "Xanadu Blood", "Razor Crest", "IG-2000"]);

const mission = (input) => createMissionRecord({
  tbId: "hoth-imperial",
  lastVerified: "2026-08-15",
  sources: ["swgoh-wiki-hoth-ds", "swgohgg-hoth-ds"],
  ...input,
});

const ds = (starsMin) => ({ verified: true, unitType: "Character", alignment: "Dark", starsMin });
const faction = (starsMin, category) => ({ verified: true, unitType: "Character", alignment: "Dark", starsMin, requiredCategories: [category] });
const ship = (starsMin) => ({ verified: true, unitType: "Ship", alignment: "Dark", starsMin });
const named = (entry, members) => ({ ...entry, mandatoryMembers: members });
const member = (name, baseId, bypassPool = false) => ({ name, baseId, bypassPool });

const waves = Object.freeze({
  p1: [31500, 82000, 168000, 297000],
  p2: [53000, 109000, 203000, 345000],
  p3: [79000, 140000, 244000, 402000],
  p4: [95000, 165000, 285000, 466000],
  p5: [116000, 195000, 333000, 541000],
  p6: [212000, 304000, 463000, 703000],
});

export const HOTH_DS_TERRITORIES = Object.freeze([
  {
    id: "p1-top", phase: 1, lane: "top", name: "Imperial Flank", unitType: "Character", starsMin: 2, x: 8, y: 30,
    starThresholds: [885000, 6909000, 47880000], platoonTp: 102000,
    missions: [
      mission({ id: "p1-flank-cm1", territoryId: "p1-top", phase: 1, name: "Combat Mission 1", missionType: "combat", entry: ds(2), waves: waves.p1, recommendations: [EMPIRE] }),
      mission({ id: "p1-flank-cm2", territoryId: "p1-top", phase: 1, name: "Combat Mission 2", missionType: "combat", entry: ds(2), waves: waves.p1, recommendations: [EMPIRE] }),
    ],
  },
  {
    id: "p1-bottom", phase: 1, lane: "bottom", name: "Imperial Landing", unitType: "Character", starsMin: 2, x: 8, y: 72,
    starThresholds: [445000, 3474000, 24075000], platoonTp: 102000,
    missions: [
      mission({ id: "p1-landing-cm", territoryId: "p1-bottom", phase: 1, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(2), waves: waves.p1, recommendations: [EMPIRE] }),
      mission({ id: "p1-vader-sm", territoryId: "p1-bottom", phase: 1, name: "Special Mission — Empire + Darth Vader", missionType: "special", entry: named(faction(4, "Empire"), [member("Darth Vader", "VADER")]), rewards: ["8 Mk I Guild Event Tokens"], recommendations: [EMPIRE], mechanics: ["Darth Vader is a required mission unit."] }),
    ],
  },
  {
    id: "p2-top", phase: 2, lane: "top", name: "Snowfields", unitType: "Character", starsMin: 3, x: 25, y: 30,
    starThresholds: [1900000, 20790000, 57750000], platoonTp: 126000,
    missions: [
      mission({ id: "p2-snow-cm", territoryId: "p2-top", phase: 2, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(3), waves: waves.p2, recommendations: [EMPIRE] }),
      mission({ id: "p2-snow-empire", territoryId: "p2-top", phase: 2, name: "Combat Mission — Empire + Snowtrooper", missionType: "combat", entry: named(faction(3, "Empire"), [member("Snowtrooper", "SNOWTROOPER")]), waves: waves.p2, recommendations: [TROOPERS, EMPIRE] }),
    ],
  },
  {
    id: "p2-bottom", phase: 2, lane: "bottom", name: "Forward Stronghold", unitType: "Character", starsMin: 3, x: 25, y: 72,
    starThresholds: [1900000, 16170000, 45990000], platoonTp: 126000,
    missions: [
      mission({ id: "p2-stronghold-cm", territoryId: "p2-bottom", phase: 2, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(3), waves: waves.p2, recommendations: [EMPIRE] }),
      mission({ id: "p2-bh-sm", territoryId: "p2-bottom", phase: 2, name: "Special Mission — Bounty Hunters", missionType: "special", entry: faction(4, "Bounty Hunter"), rewards: ["9 Mk I Guild Event Tokens"], recommendations: [BOUNTY] }),
    ],
  },
  {
    id: "p3-top", phase: 3, lane: "top", name: "Imperial Fleet Staging Area", unitType: "Ship", starsMin: 4, x: 42, y: 14,
    starThresholds: [1920000, 17325000, 28930000], platoonTp: 151000,
    missions: [mission({ id: "p3-fleet", territoryId: "p3-top", phase: 3, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(4), waves: [401000], recommendations: [CHIMAERA, EXECUTOR] })],
  },
  {
    id: "p3-middle", phase: 3, lane: "middle", name: "Ion Cannon", unitType: "Character", starsMin: 4, x: 42, y: 48,
    starThresholds: [3510000, 28980000, 71280000], platoonTp: 151000,
    missions: [
      mission({ id: "p3-ion-cm", territoryId: "p3-middle", phase: 3, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(4), waves: waves.p3, recommendations: [EMPIRE] }),
      mission({ id: "p3-ion-bh", territoryId: "p3-middle", phase: 3, name: "Combat Mission — Bounty Hunters", missionType: "combat", entry: faction(4, "Bounty Hunter"), waves: waves.p3, recommendations: [BOUNTY] }),
    ],
  },
  {
    id: "p3-bottom", phase: 3, lane: "bottom", name: "Outer Pass", unitType: "Character", starsMin: 4, x: 42, y: 82,
    starThresholds: [3510000, 23520000, 54810000], platoonTp: 151000,
    missions: [
      mission({ id: "p3-pass-cm", territoryId: "p3-bottom", phase: 3, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(4), waves: waves.p3, recommendations: [EMPIRE] }),
      mission({ id: "p3-ipd-sm", territoryId: "p3-bottom", phase: 3, name: "Special Mission — Imperial Troopers / IPD Shard", missionType: "special", entry: named(faction(5, "Imperial Trooper"), [member("General Veers", "VEERS"), member("Colonel Starck", "COLONELSTARCK")]), rewards: ["1 Imperial Probe Droid shard"], recommendations: [TROOPERS], mechanics: ["General Veers and Colonel Starck are required mission units."] }),
    ],
  },
  {
    id: "p4-top", phase: 4, lane: "top", name: "Contested Airspace", unitType: "Ship", starsMin: 5, x: 58, y: 14,
    starThresholds: [2176000, 19635000, 32780000], platoonTp: 176000,
    missions: [
      mission({ id: "p4-fleet-cm", territoryId: "p4-top", phase: 4, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(5), waves: [526000], recommendations: [CHIMAERA, EXECUTOR] }),
      mission({ id: "p4-fleet-sm", territoryId: "p4-top", phase: 4, name: "Fleet Special Mission — Chimaera", missionType: "special", entry: named(ship(5), [member("Chimaera", "CAPITALCHIMAERA")]), rewards: ["20 Mk I Guild Event Tokens"], recommendations: [CHIMAERA], mechanics: ["The current Hoth DS required-unit table places Chimaera in Zone 4; this is the only Zone 4 fleet special mission."] }),
    ],
  },
  {
    id: "p4-middle", phase: 4, lane: "middle", name: "Power Generator", unitType: "Character", starsMin: 5, x: 58, y: 48,
    starThresholds: [5220000, 36435000, 85910000], platoonTp: 176000,
    missions: [
      mission({ id: "p4-power-cm", territoryId: "p4-middle", phase: 4, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(5), waves: waves.p4, recommendations: [EMPIRE] }),
      mission({ id: "p4-power-empire", territoryId: "p4-middle", phase: 4, name: "Combat Mission — Empire + Veers + Snowtrooper", missionType: "combat", entry: named(faction(5, "Empire"), [member("General Veers", "VEERS"), member("Snowtrooper", "SNOWTROOPER")]), waves: waves.p4, recommendations: [TROOPERS, EMPIRE] }),
    ],
  },
  {
    id: "p4-bottom", phase: 4, lane: "bottom", name: "Rear Trenches", unitType: "Character", starsMin: 5, x: 58, y: 82,
    starThresholds: [5220000, 36435000, 68860000], platoonTp: 176000,
    missions: [
      mission({ id: "p4-rear-cm", territoryId: "p4-bottom", phase: 4, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(5), waves: waves.p4, recommendations: [EMPIRE] }),
      mission({ id: "p4-jabba-sm", territoryId: "p4-bottom", phase: 4, name: "Special Mission — Jabba the Hutt", missionType: "special", entry: named(ds(5), [member("Jabba the Hutt", "JABBATHEHUTT")]), rewards: ["20 Mk I Guild Event Tokens"], recommendations: [JABBA], sources: ["swgohgg-hoth-ds", "cg-jabba-hoth"], mechanics: ["Capital Games added an extra Hoth battle requiring Jabba. Companion-slot restrictions are not promoted beyond the territory's Dark Side baseline without a stronger source."] }),
    ],
  },
  {
    id: "p5-top", phase: 5, lane: "top", name: "Forward Airspace", unitType: "Ship", starsMin: 6, x: 75, y: 14,
    starThresholds: [18000000, 35700000, 57500000], platoonTp: 207000,
    missions: [mission({ id: "p5-fleet", territoryId: "p5-top", phase: 5, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(6), waves: [616000], recommendations: [CHIMAERA, EXECUTOR] })],
  },
  {
    id: "p5-middle", phase: 5, lane: "middle", name: "Forward Trenches", unitType: "Character", starsMin: 6, x: 75, y: 48,
    starThresholds: [14100000, 51765000, 103270000], platoonTp: 207000,
    missions: [
      mission({ id: "p5-trench-cm", territoryId: "p5-middle", phase: 5, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(6), waves: waves.p5, recommendations: [EMPIRE] }),
      mission({ id: "p5-bh-sm", territoryId: "p5-middle", phase: 5, name: "Special Mission — Bounty Hunters", missionType: "special", entry: faction(6, "Bounty Hunter"), rewards: ["25 Mk I Guild Event Tokens"], recommendations: [BOUNTY] }),
    ],
  },
  {
    id: "p5-bottom", phase: 5, lane: "bottom", name: "Forward Stronghold", unitType: "Character", starsMin: 6, x: 75, y: 82,
    starThresholds: [11100000, 43050000, 82340000], platoonTp: 207000,
    missions: [
      mission({ id: "p5-strong-cm", territoryId: "p5-bottom", phase: 5, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(6), waves: waves.p5, recommendations: [EMPIRE] }),
      mission({ id: "p5-strong-empire", territoryId: "p5-bottom", phase: 5, name: "Combat Mission — Empire", missionType: "combat", entry: faction(6, "Empire"), waves: waves.p5, recommendations: [EMPIRE, TROOPERS] }),
    ],
  },
  {
    id: "p6-top", phase: 6, lane: "top", name: "Rear Airspace", unitType: "Ship", starsMin: 7, x: 92, y: 14,
    starThresholds: [21600000, 44800000, 78000000], platoonTp: 260000,
    missions: [mission({ id: "p6-fleet", territoryId: "p6-top", phase: 6, name: "Fleet Combat Mission", missionType: "fleet", entry: ship(7), waves: [798000], recommendations: [CHIMAERA, EXECUTOR] })],
  },
  {
    id: "p6-middle", phase: 6, lane: "middle", name: "Rebel Base (Main Entrance)", unitType: "Character", starsMin: 7, x: 92, y: 48,
    starThresholds: [31000000, 79200000, 130000000], platoonTp: 260000,
    missions: [
      mission({ id: "p6-main-cm", territoryId: "p6-middle", phase: 6, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(7), waves: waves.p6, recommendations: [EMPIRE] }),
      mission({ id: "p6-main-empire", territoryId: "p6-middle", phase: 6, name: "Combat Mission — Empire", missionType: "combat", entry: faction(7, "Empire"), waves: waves.p6, recommendations: [EMPIRE, TROOPERS] }),
    ],
  },
  {
    id: "p6-bottom", phase: 6, lane: "bottom", name: "Rebel Base (South Entrance)", unitType: "Character", starsMin: 7, x: 92, y: 82,
    starThresholds: [26400000, 65230000, 105950000], platoonTp: 260000,
    missions: [
      mission({ id: "p6-south-cm", territoryId: "p6-bottom", phase: 6, name: "Combat Mission — Dark Side", missionType: "combat", entry: ds(7), waves: waves.p6, recommendations: [EMPIRE] }),
      mission({ id: "p6-ipd-sm", territoryId: "p6-bottom", phase: 6, name: "Special Mission — Empire + Veers + Imperial Probe Droid", missionType: "special", entry: named(faction(7, "Empire"), [member("General Veers", "VEERS"), member("Imperial Probe Droid", "IMPERIALPROBEDROID")]), rewards: ["30 Mk I Guild Event Tokens"], recommendations: [TROOPERS, EMPIRE], mechanics: ["General Veers and Imperial Probe Droid are required mission units."] }),
    ],
  },
]);

export const HOTH_DS_CAMPAIGN = Object.freeze({
  id: "hoth-imperial",
  name: "Hoth: Imperial Retaliation",
  shortName: "Hoth DS",
  kicker: "HOTH · IMPERIAL RETALIATION",
  theme: "hoth-dark",
  defaultTerritoryId: "p1-top",
  mapDescription: "Six-phase Dark Side Hoth campaign with exact zone thresholds, faction missions, IPD shard mission, Jabba battle and verified Hoth Hero requirements.",
  sources: HOTH_DS_SOURCES,
  territories: HOTH_DS_TERRITORIES,
});
