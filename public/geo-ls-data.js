import { createMissionRecord, MISSION_CONFIDENCE } from "./tb-mission-intelligence.js";

export const GEO_LS_SOURCES = Object.freeze([
  { id: "swgoh-wiki-republic-offensive", label: "SWGOH Wiki · Republic Offensive zone tables", kind: "current-reference" },
  { id: "swgoh-wiki-republic-battles", label: "SWGOH Wiki · Republic Offensive battles", kind: "current-reference" },
  { id: "genskaar-geo-ls", label: "Genskaar Interactive LS Geo", kind: "community-reference", license: "MIT" },
]);

const community = (id, name, members) => ({
  id,
  name,
  members,
  confidence: MISSION_CONFIDENCE.COMMUNITY,
  verifiedLegal: false,
  sourceIds: ["genskaar-geo-ls"],
  lastVerified: "2026-08-15",
});

const PADME = community("padme-gr", "Padmé Galactic Republic", ["Padmé Amidala", "Jedi Knight Anakin", "General Kenobi", "Ahsoka Tano", "C-3PO"]);
const JKR = community("jkr-jedi", "Jedi Knight Revan Jedi", ["Jedi Knight Revan", "Bastila Shan", "Jolee Bindo", "Grand Master Yoda", "Hermit Yoda"]);
const JML = community("jml-jedi", "Jedi Master Luke / Jedi", ["Jedi Master Luke Skywalker", "Jedi Knight Luke Skywalker", "Jedi Knight Revan", "Hermit Yoda", "Jolee Bindo"]);
const JMK = community("jmk-gr", "Jedi Master Kenobi Galactic Republic", ["Jedi Master Kenobi", "Commander Ahsoka Tano", "General Kenobi", "Ahsoka Tano", "Padmé Amidala"]);
const SHAAK_CLONES = community("shaak-clones", "Shaak Ti + 501st Clones", ["Shaak Ti", "ARC Trooper", "CT-7567 'Rex'", "CT-5555 'Fives'", "CT-21-0408 'Echo'"]);
const GAS_501 = community("gas-501", "General Skywalker + 501st", ["General Skywalker", "ARC Trooper", "CT-7567 'Rex'", "CT-5555 'Fives'", "CT-21-0408 'Echo'"]);
const NEGOTIATOR = community("negotiator-gr", "Negotiator Galactic Republic Fleet", ["Negotiator", "Anakin's Eta-2 Starfighter", "Ahsoka Tano's Jedi Starfighter", "Umbaran Starfighter", "BTL-B Y-wing Starfighter"]);
const HOME_ONE = community("home-one-ls", "Home One Rebel Fleet", ["Home One", "Han's Millennium Falcon", "Biggs Darklighter's X-wing", "Bistan's U-wing", "Rebel Y-wing"]);
const RESISTANCE = community("rey-resistance", "Rey / Resistance", ["Rey", "Resistance Hero Finn", "Resistance Hero Poe", "Rey (Jedi Training)", "Amilyn Holdo"]);
const CLS = community("cls-rebels", "Commander Luke Rebels", ["Commander Luke Skywalker", "Han Solo", "Chewbacca", "Threepio & Chewie", "C-3PO"]);
const GAS_AHSOKA = community("gas-ahsoka-duo", "Required GAS + Ahsoka", ["General Skywalker", "Ahsoka Tano"]);
const GK_CLONES = community("gk-cody-clone", "Required General Kenobi + Cody + Clone Sergeant", ["General Kenobi", "CC-2224 'Cody'", "Clone Sergeant - Phase I"]);
const KAM_SHAAK_JEDI = community("kam-shaak-gr-jedi", "KAM + Shaak Ti Galactic Republic Jedi", ["Ki-Adi-Mundi", "Shaak Ti", "Jedi Master Kenobi", "Mace Windu", "Aayla Secura"]);

const mission = (input) => createMissionRecord({
  tbId: "geo-republic",
  lastVerified: "2026-08-15",
  sources: ["swgoh-wiki-republic-offensive", "swgoh-wiki-republic-battles"],
  ...input,
});

const LS_CHAR = { verified: true, unitType: "Character", alignment: "Light", starsMin: 7 };
const LS_SHIP = { verified: true, unitType: "Ship", alignment: "Light", starsMin: 7 };
const JEDI = (powerMin = null) => ({ verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin, requiredCategories: ["Jedi"] });
const GR = (powerMin = null) => ({ verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin, requiredCategories: ["Galactic Republic"] });
const GR_JEDI = (powerMin = null) => ({ verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin, requiredCategories: ["Galactic Republic", "Jedi"] });

export const GEO_LS_TERRITORIES = Object.freeze([
  {
    id: "p1-top", phase: 1, lane: "top", name: "Galactic Republic Fleet", unitType: "Ship", starsMin: 7, x: 12, y: 18,
    starThresholds: [42475000, 84950000, 141580000], platoonTp: 208333,
    missions: [
      mission({ id: "p1-fleet", territoryId: "p1-top", phase: 1, name: "Fleet Combat Mission", missionType: "fleet", entry: LS_SHIP, waves: [523900], recommendations: [NEGOTIATOR, HOME_ONE], enemies: ["Chimaera or Executrix fleets"], mechanics: ["Formation abilities from completed platoons"] }),
    ],
  },
  {
    id: "p1-middle", phase: 1, lane: "middle", name: "Count Dooku's Hangar", unitType: "Character", starsMin: 7, x: 12, y: 50,
    starThresholds: [110240000, 166640000, 256370000], platoonTp: 208333,
    missions: [
      mission({ id: "p1-mid-cm1", territoryId: "p1-middle", phase: 1, name: "Combat Mission 1", missionType: "combat", entry: LS_CHAR, waves: [403000,573500,840000,1155000], recommendations: [JMK, CLS, RESISTANCE] }),
      mission({ id: "p1-mid-cm2", territoryId: "p1-middle", phase: 1, name: "Combat Mission 2 — Jedi", missionType: "combat", entry: JEDI(), waves: [403000,573500,840000,1155000], recommendations: [JML, JKR] }),
      mission({ id: "p1-mid-sm", territoryId: "p1-middle", phase: 1, name: "Special Mission — Padmé + Galactic Republic", missionType: "special", entry: { ...GR(16500), mandatoryMembers: [{ name: "Padmé Amidala", baseId: "PADMEAMIDALA" }], squadSize: 5, notes: "Galactic Republic characters at 16,500+ power; Padmé Amidala is mandatory." }, rewards: ["15 Mk II Guild Event Tokens"], recommendations: [PADME] }),
    ],
  },
  {
    id: "p1-bottom", phase: 1, lane: "bottom", name: "Rear Flank", unitType: "Character", starsMin: 7, x: 12, y: 82,
    starThresholds: [86275000, 120425000, 179740000], platoonTp: 208333,
    missions: [
      mission({ id: "p1-bot-cm1", territoryId: "p1-bottom", phase: 1, name: "Combat Mission 1", missionType: "combat", entry: LS_CHAR, waves: [403000,573500,840000,1155000], recommendations: [CLS, RESISTANCE, JMK] }),
      mission({ id: "p1-bot-cm2", territoryId: "p1-bottom", phase: 1, name: "Combat Mission 2 — Jedi", missionType: "combat", entry: JEDI(), waves: [523900,745550,1092000,1501500], recommendations: [JML, JKR] }),
    ],
  },
  {
    id: "p2-top", phase: 2, lane: "top", name: "Contested Air Space (Republic)", unitType: "Ship", starsMin: 7, x: 37, y: 18,
    starThresholds: [71075000, 133535000, 215380000], platoonTp: 208333,
    missions: [
      mission({ id: "p2-fleet-cm", territoryId: "p2-top", phase: 2, name: "Fleet Combat Mission", missionType: "fleet", entry: LS_SHIP, waves: [900000], recommendations: [NEGOTIATOR, HOME_ONE] }),
      mission({ id: "p2-fleet-sm", territoryId: "p2-top", phase: 2, name: "Fleet Special Mission — Galactic Republic", missionType: "special", entry: { verified: true, unitType: "Ship", alignment: "Light", starsMin: 7, requiredCategories: ["Galactic Republic"] }, rewards: ["21 Mk II Guild Event Tokens"], recommendations: [NEGOTIATOR] }),
    ],
  },
  {
    id: "p2-middle", phase: 2, lane: "middle", name: "Battleground", unitType: "Character", starsMin: 7, x: 37, y: 50,
    starThresholds: [96220000, 174235000, 260055000], platoonTp: 208333,
    missions: [
      mission({ id: "p2-mid-cm1", territoryId: "p2-middle", phase: 2, name: "Combat Mission 1", missionType: "combat", entry: LS_CHAR, waves: [434000,704000,1014750,1377000], recommendations: [CLS, RESISTANCE, JMK] }),
      mission({ id: "p2-mid-cm2", territoryId: "p2-middle", phase: 2, name: "Combat Mission 2 — Galactic Republic", missionType: "combat", entry: GR(21000), waves: [434000,704000,1014750,1377000], recommendations: [PADME, JMK, SHAAK_CLONES] }),
      mission({ id: "p2-mid-gas", territoryId: "p2-middle", phase: 2, name: "Restricted Combat — General Skywalker + Ahsoka", missionType: "combat", entry: { verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin: 21000, squadSize: 2, allowedBaseIds: ["GENERALSKYWALKER", "AHSOKATANO"], mandatoryMembers: [{ name: "General Skywalker", baseId: "GENERALSKYWALKER" }, { name: "Ahsoka Tano", baseId: "AHSOKATANO" }], notes: "Two-character mission: General Skywalker and Ahsoka Tano, each 21,000+ power." }, recommendations: [GAS_AHSOKA] }),
    ],
  },
  {
    id: "p2-bottom", phase: 2, lane: "bottom", name: "Sand Dunes", unitType: "Character", starsMin: 7, x: 37, y: 82,
    starThresholds: [121030000, 217235000, 310335000], platoonTp: 208333,
    missions: [
      mission({ id: "p2-bot-cm1", territoryId: "p2-bottom", phase: 2, name: "Combat Mission 1", missionType: "combat", entry: LS_CHAR, waves: [434000,704000,1014750,1377000], recommendations: [CLS, RESISTANCE, JMK] }),
      mission({ id: "p2-bot-cm2", territoryId: "p2-bottom", phase: 2, name: "Combat Mission 2 — Jedi", missionType: "combat", entry: JEDI(21000), waves: [434000,704000,1014750,1377000], recommendations: [JML, JKR] }),
      mission({ id: "p2-bot-sm", territoryId: "p2-bottom", phase: 2, name: "Special Mission — General Kenobi / Cody / Clone Sergeant", missionType: "special", entry: { verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin: 21000, squadSize: 3, allowedBaseIds: ["GENERALKENOBI", "CC2224", "CLONESERGEANTPHASEI"], mandatoryMembers: [{ name: "General Kenobi", baseId: "GENERALKENOBI" }, { name: "CC-2224 'Cody'", baseId: "CC2224" }, { name: "Clone Sergeant - Phase I", baseId: "CLONESERGEANTPHASEI" }], notes: "Three required characters, each 21,000+ power." }, rewards: ["21 Mk II Guild Event Tokens"], recommendations: [GK_CLONES] }),
    ],
  },
  {
    id: "p3-top", phase: 3, lane: "top", name: "Contested Air Space (Separatist)", unitType: "Ship", starsMin: 7, x: 62, y: 18,
    starThresholds: [91395000, 152325000, 217610000], platoonTp: 250000,
    missions: [
      mission({ id: "p3-fleet-cm", territoryId: "p3-top", phase: 3, name: "Fleet Combat Mission", missionType: "fleet", entry: LS_SHIP, waves: [1800000], recommendations: [NEGOTIATOR, HOME_ONE] }),
      mission({ id: "p3-fleet-sm", territoryId: "p3-top", phase: 3, name: "Fleet Special Mission — Galactic Republic + Anakin's Eta-2", missionType: "special", entry: { verified: true, unitType: "Ship", alignment: "Light", starsMin: 7, requiredCategories: ["Galactic Republic"], mandatoryMembers: [{ name: "Anakin's Eta-2 Starfighter", baseId: "JEDISTARFIGHTERANAKIN" }], notes: "Galactic Republic ships; Anakin's Eta-2 Starfighter is mandatory." }, rewards: ["32 Mk II Guild Event Tokens"], recommendations: [NEGOTIATOR] }),
    ],
  },
  {
    id: "p3-middle", phase: 3, lane: "middle", name: "Separatist Command", unitType: "Character", starsMin: 7, x: 62, y: 50,
    starThresholds: [132310000, 257065000, 378035000], platoonTp: 250000,
    missions: [
      mission({ id: "p3-mid-cm1", territoryId: "p3-middle", phase: 3, name: "Combat Mission 1", missionType: "combat", entry: LS_CHAR, waves: [464000,775500,1105000,1627500], recommendations: [JMK, CLS, RESISTANCE] }),
      mission({ id: "p3-mid-cm2", territoryId: "p3-middle", phase: 3, name: "Combat Mission 2", missionType: "combat", entry: LS_CHAR, waves: [464000,775500,1105000,1627500], recommendations: [JMK, CLS, RESISTANCE] }),
      mission({ id: "p3-mid-grj", territoryId: "p3-middle", phase: 3, name: "Combat Mission — Galactic Republic Jedi", missionType: "combat", entry: GR_JEDI(22000), waves: [603200,1008150,1436500,2115750], recommendations: [JMK, JML] }),
    ],
  },
  {
    id: "p3-bottom", phase: 3, lane: "bottom", name: "Petranaki Arena", unitType: "Character", starsMin: 7, x: 62, y: 82,
    starThresholds: [110615000, 165925000, 221230000], platoonTp: 250000,
    missions: [
      mission({ id: "p3-bot-jedi", territoryId: "p3-bottom", phase: 3, name: "Combat Mission — Jedi", missionType: "combat", entry: JEDI(22000), waves: [464000,775500,1105000,1627500], recommendations: [JML, JKR] }),
      mission({ id: "p3-kam", territoryId: "p3-bottom", phase: 3, name: "Special Mission — Ki-Adi-Mundi Shard", missionType: "special", entry: { verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin: 22000, squadSize: 5, requiredCategories: ["Clone Trooper"], mandatoryMembers: [{ name: "Shaak Ti", baseId: "SHAAKTI", bypassPool: true }, { name: "ARC Trooper", baseId: "ARCTROOPER501ST" }], notes: "Clone Troopers at 22,000+ power; Shaak Ti and ARC Trooper are mandatory. Shaak Ti is a required exception to the Clone Trooper pool." }, rewards: ["1 Ki-Adi-Mundi shard"], recommendations: [SHAAK_CLONES], enemies: ["Reek", "Jango Fett", "B2 Super Battle Droid"] }),
    ],
  },
  {
    id: "p4-top", phase: 4, lane: "top", name: "Separatist Armada", unitType: "Ship", starsMin: 7, x: 87, y: 18,
    starThresholds: [122490000, 340255000, 453670000], platoonTp: 333333,
    missions: [
      mission({ id: "p4-fleet-cm", territoryId: "p4-top", phase: 4, name: "Fleet Combat Mission", missionType: "fleet", entry: LS_SHIP, waves: [2750000], recommendations: [NEGOTIATOR, HOME_ONE] }),
      mission({ id: "p4-fleet-sm", territoryId: "p4-top", phase: 4, name: "Fleet Special Mission — Negotiator + Anakin's Eta-2", missionType: "special", entry: { verified: true, unitType: "Ship", alignment: "Light", starsMin: 7, requiredCategories: ["Galactic Republic"], mandatoryMembers: [{ name: "Negotiator", baseId: "CAPITALNEGOTIATOR" }, { name: "Anakin's Eta-2 Starfighter", baseId: "JEDISTARFIGHTERANAKIN" }], notes: "Galactic Republic fleet; Negotiator and Anakin's Eta-2 Starfighter are mandatory." }, rewards: ["20 Mk II Guild Event Tokens"], recommendations: [NEGOTIATOR] }),
    ],
  },
  {
    id: "p4-middle", phase: 4, lane: "middle", name: "Factory Waste", unitType: "Character", starsMin: 7, x: 87, y: 50,
    starThresholds: [152945000, 270930000, 436980000], platoonTp: 333333,
    missions: [
      mission({ id: "p4-mid-jedi", territoryId: "p4-middle", phase: 4, name: "Combat Mission — Jedi", missionType: "combat", entry: JEDI(23000), waves: [511500,867000,1242500,1837500], recommendations: [JML, JKR] }),
      mission({ id: "p4-mid-ls", territoryId: "p4-middle", phase: 4, name: "Combat Mission — Light Side", missionType: "combat", entry: LS_CHAR, waves: [511500,867000,1242500,1837500], recommendations: [JMK, CLS, RESISTANCE] }),
      mission({ id: "p4-mid-sm", territoryId: "p4-middle", phase: 4, name: "Special Mission — KAM + Shaak Ti Galactic Republic Jedi", missionType: "special", entry: { ...GR_JEDI(23000), mandatoryMembers: [{ name: "Ki-Adi-Mundi", baseId: "KIADIMUNDI" }, { name: "Shaak Ti", baseId: "SHAAKTI" }], notes: "Galactic Republic Jedi at 23,000+ power; Ki-Adi-Mundi and Shaak Ti are mandatory." }, rewards: ["25 Mk II Guild Event Tokens"], recommendations: [KAM_SHAAK_JEDI] }),
    ],
  },
  {
    id: "p4-bottom", phase: 4, lane: "bottom", name: "Canyons", unitType: "Character", starsMin: 7, x: 87, y: 82,
    starThresholds: [117510000, 268600000, 335750000], platoonTp: 333333,
    missions: [
      mission({ id: "p4-bot-gr", territoryId: "p4-bottom", phase: 4, name: "Combat Mission — Padmé / Anakin / Kenobi Galactic Republic", missionType: "combat", entry: { ...GR(23000), mandatoryMembers: [{ name: "Padmé Amidala", baseId: "PADMEAMIDALA" }, { name: "Jedi Knight Anakin", baseId: "ANAKINKNIGHT" }, { name: "General Kenobi", baseId: "GENERALKENOBI" }], notes: "Galactic Republic at 23,000+ power; Padmé, Jedi Knight Anakin and General Kenobi are mandatory." }, waves: [867000,1837500], recommendations: [PADME, JMK] }),
      mission({ id: "p4-bot-ls", territoryId: "p4-bottom", phase: 4, name: "Combat Mission — Light Side", missionType: "combat", entry: LS_CHAR, waves: [511500,867000,1242500,1837500], recommendations: [CLS, RESISTANCE, JMK] }),
      mission({ id: "p4-bot-501", territoryId: "p4-bottom", phase: 4, name: "Combat Mission — 501st + General Skywalker", missionType: "combat", entry: { verified: true, unitType: "Character", alignment: "Light", starsMin: 7, powerMin: 23000, requiredCategories: ["501st"], mandatoryMembers: [{ name: "General Skywalker", baseId: "GENERALSKYWALKER" }], notes: "501st characters at 23,000+ power; General Skywalker is mandatory." }, waves: [664950,1127100,1615250,2388750], recommendations: [GAS_501] }),
    ],
  },
]);

export const GEO_LS_CAMPAIGN = Object.freeze({
  id: "geo-republic",
  name: "Geonosis: Republic Offensive",
  shortName: "Geo LS",
  kicker: "GEONOSIS · REPUBLIC OFFENSIVE",
  theme: "geo-light",
  defaultTerritoryId: "p1-top",
  mapDescription: "Twelve verified territories with mission-level Light Side, Jedi, Galactic Republic, Clone, 501st and fleet entry rules.",
  sources: GEO_LS_SOURCES,
  territories: GEO_LS_TERRITORIES,
});
