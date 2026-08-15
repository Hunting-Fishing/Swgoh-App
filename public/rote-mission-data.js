import { createMissionRecord, MISSION_CONFIDENCE } from "./tb-mission-intelligence.js";

export const ROTE_MISSION_SOURCES = Object.freeze([
  { id: "swgoh-wiki-rote-zones", label: "SWGOH Wiki · Rise of the Empire Zone Information", kind: "current-reference" },
  { id: "swgohgg-rote", label: "SWGOH.GG · Rise of the Empire", kind: "current-reference" },
  { id: "cg-zeffo", label: "Capital Games · Zeffo Title Update", kind: "official" },
  { id: "genskaar-rote", label: "Genskaar Interactive ROTE", kind: "community-reference" },
]);

const member = (name, baseId = "", overrides = {}) => ({ name, baseId, ...overrides });
const planning = (id, name, members, extra = {}) => ({
  id,
  name,
  members,
  confidence: MISSION_CONFIDENCE.UNKNOWN,
  verifiedLegal: false,
  sourceIds: ["planning-template"],
  lastVerified: "2026-08-15",
  ...extra,
});

const LV = planning("rote-lv", "Lord Vader mission core", ["Lord Vader", "Darth Vader", "Royal Guard", "Grand Admiral Thrawn", "Maul"]);
const JABBA = planning("rote-jabba", "Jabba Hutt Cartel core", ["Jabba the Hutt", "Boushh (Leia Organa)", "Krrsantan", "Skiff Guard (Lando Calrissian)", "Embo"]);
const APHRA = planning("rote-aphra", "Doctor Aphra droid core", ["Doctor Aphra", "BT-1", "0-0-0", "Darth Vader", "IG-88"]);
const QIRA_YHAN = planning("rote-qira-yhan", "Qi'ra + Young Han core", ["Qi'ra", "Young Han Solo", "Vandor Chewbacca", "L3-37", "Young Lando Calrissian"]);
const JEDI = planning("rote-jedi", "Jedi planning core", ["Jedi Master Luke Skywalker", "Jedi Knight Luke Skywalker", "Jedi Knight Revan", "Hermit Yoda", "Jolee Bindo"]);
const GEOS = planning("rote-geos", "Geonosians", ["Geonosian Brood Alpha", "Geonosian Spy", "Geonosian Soldier", "Sun Fac", "Poggle the Lesser"]);
const INQUISITORS = planning("rote-inqs", "Inquisitorius planning core", ["Grand Inquisitor", "Seventh Sister", "Fifth Brother", "Eighth Brother", "Ninth Sister"]);
const REVA_INQS = planning("rote-reva", "Third Sister Inquisitorius core", ["Third Sister", "Grand Inquisitor", "Seventh Sister", "Fifth Brother", "Ninth Sister"]);
const NS_MERRIN = planning("rote-merrin", "Merrin Nightsisters", ["Mother Talzin", "Old Daka", "Nightsister Zombie", "Asajj Ventress", "Merrin"]);
const WOOKIES = planning("rote-wookies", "Wookiee planning core", ["Tarfful", "Zaalbar", "Vandor Chewbacca", "Chewbacca", "Veteran Smuggler Chewbacca"]);
const SAW_RF = planning("rote-saw", "Saw Rebel Fighters", ["Saw Gerrera", "Chirrut Îmwe", "Baze Malbus", "Kyle Katarn", "Cara Dune"]);
const CLONES = planning("rote-clones", "Clone Trooper planning core", ["Captain Rex", "ARC Trooper", "CT-7567 'Rex'", "CT-5555 'Fives'", "CT-21-0408 'Echo'"]);
const PHOENIX = planning("rote-phoenix", "Phoenix planning core", ["Hera Syndulla", "Captain Rex", "Kanan Jarrus", "Chopper", "Ezra Bridger"]);
const BKM = planning("rote-bkm", "Bo-Katan (Mand'alor) planning core", ["Bo-Katan (Mand'alor)", "The Mandalorian (Beskar Armor)", "Paz Vizsla", "IG-12 & Grogu", "The Armorer"]);
const DTMG = planning("rote-dtmg", "Dark Trooper Moff Gideon planning core", ["Dark Trooper Moff Gideon", "Scout Trooper", "Moff Gideon", "Stormtrooper", "Dark Trooper"]);
const MALACHOR_INQS = planning("rote-malachor-inqs", "Malachor required Inquisitors", ["Eighth Brother", "Fifth Brother", "Seventh Sister", "Grand Inquisitor", "Ninth Sister"]);
const VANDOR = planning("rote-vandor", "Young Han + Vandor Chewbacca core", ["Young Han Solo", "Vandor Chewbacca", "Qi'ra", "L3-37", "Young Lando Calrissian"]);
const ROGUE = planning("rote-rogue", "Rogue One planning core", ["Admiral Raddus", "Cassian Andor", "K-2SO", "Jyn Erso", "Bistan"]);
const IDEN = planning("rote-iden", "Iden Versio Imperial Troopers", ["Iden Versio", "Death Trooper", "Range Trooper", "Shoretrooper", "Snowtrooper"]);
const SCARIF_BAZE = planning("rote-scarif-baze", "Baze / Chirrut / Pathfinder core", ["Baze Malbus", "Chirrut Îmwe", "Scarif Rebel Pathfinder", "Admiral Raddus", "Jyn Erso"]);
const SCARIF_CASSIAN = planning("rote-scarif-cassian", "Cassian / Pao / K-2SO core", ["Cassian Andor", "Pao", "K-2SO", "Admiral Raddus", "Jyn Erso"]);

const relicEntry = (relic, alignment = "Mixed", extra = {}) => ({
  verified: true,
  unitType: "Character",
  starsMin: 7,
  relicMin: relic,
  ...(alignment === "Mixed" ? { allowedAlignments: ["Light", "Dark"] } : { alignment }),
  ...extra,
});
const fleetEntry = (extra = {}) => ({ verified: true, unitType: "Ship", starsMin: 7, ...extra });
const mandatory = (...members) => ({ mandatoryMembers: members });
const category = (name) => ({ requiredCategories: [name] });
const mission = (planetId, phase, id, name, missionType, entry, options = {}) => createMissionRecord({
  id,
  tbId: "rote",
  territoryId: planetId,
  phase,
  name,
  missionType,
  entry,
  lastVerified: "2026-08-15",
  sources: options.sources || ["swgoh-wiki-rote-zones", "swgohgg-rote"],
  rewards: options.rewards || [],
  recommendations: options.recommendations || [],
  mechanics: options.mechanics || [],
  enemies: options.enemies || [],
});
const generic = (planetId, phase, relic, alignment, index, reward) => mission(planetId, phase, `${planetId}-generic-${index}`, `Combat Mission ${index}`, "combat", relicEntry(relic, alignment), { rewards: [reward] });

export const ROTE_MISSIONS_BY_PLANET = Object.freeze({
  mustafar: [
    generic("mustafar", 1, 5, "Dark", 1, "100,000 → 200,000 TP"),
    generic("mustafar", 1, 5, "Dark", 2, "100,000 → 200,000 TP"),
    generic("mustafar", 1, 5, "Dark", 3, "100,000 → 200,000 TP"),
    mission("mustafar", 1, "mustafar-lv", "Combat Mission — Lord Vader", "combat", relicEntry(5, "Dark", mandatory(member("Lord Vader", "LORDVADER"))), { rewards: ["100,000 → 200,000 TP"], recommendations: [LV] }),
    mission("mustafar", 1, "mustafar-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["400,000 TP"] }),
  ],
  corellia: [
    generic("corellia", 1, 5, "Mixed", 1, "100,000 → 200,000 TP"),
    mission("corellia", 1, "corellia-jabba", "Combat Mission — Jabba the Hutt", "combat", relicEntry(5, "Mixed", mandatory(member("Jabba the Hutt", "JABBATHEHUTT"))), { rewards: ["100,000 → 200,000 TP"], recommendations: [JABBA] }),
    mission("corellia", 1, "corellia-aphra", "Combat Mission — Doctor Aphra", "combat", relicEntry(5, "Mixed", mandatory(member("Doctor Aphra", "DOCTORAPHRA"))), { rewards: ["100,000 → 200,000 TP"], recommendations: [APHRA] }),
    mission("corellia", 1, "corellia-qira", "Special Mission — Qi'ra + Young Han Solo", "special", relicEntry(5, "Mixed", mandatory(member("Qi'ra", "QIRA"), member("Young Han Solo", "YOUNGHAN"))), { rewards: ["15 Mk III Guild Event Tokens per clear"], recommendations: [QIRA_YHAN] }),
    mission("corellia", 1, "corellia-fleet", "Fleet Mission — Lando's Millennium Falcon", "fleet", fleetEntry(mandatory(member("Lando's Millennium Falcon"))), { rewards: ["400,000 TP"] }),
  ],
  coruscant: [
    generic("coruscant", 1, 5, "Light", 1, "100,000 → 200,000 TP"),
    generic("coruscant", 1, 5, "Light", 2, "100,000 → 200,000 TP"),
    mission("coruscant", 1, "coruscant-jedi", "Combat Mission — Jedi", "combat", relicEntry(5, "Light", category("Jedi")), { rewards: ["100,000 → 200,000 TP"], recommendations: [JEDI] }),
    mission("coruscant", 1, "coruscant-mace-kit", "Combat Mission — Mace Windu + Kit Fisto Jedi", "combat", relicEntry(5, "Light", { ...category("Jedi"), ...mandatory(member("Mace Windu", "MACEWINDU"), member("Kit Fisto", "KITFISTO")) }), { rewards: ["100,000 → 200,000 TP"], recommendations: [JEDI] }),
    mission("coruscant", 1, "coruscant-fleet", "Fleet Mission — Outrider", "fleet", fleetEntry(mandatory(member("Outrider", "OUTRIDER"))), { rewards: ["400,000 TP"] }),
  ],
  geonosis: [
    generic("geonosis", 2, 6, "Dark", 1, "125,000 → 250,000 TP"),
    generic("geonosis", 2, 6, "Dark", 2, "125,000 → 250,000 TP"),
    generic("geonosis", 2, 6, "Dark", 3, "125,000 → 250,000 TP"),
    mission("geonosis", 2, "geonosis-geos", "Combat Mission — Geonosians", "combat", relicEntry(6, "Dark", category("Geonosian")), { rewards: ["125,000 → 250,000 TP"], recommendations: [GEOS] }),
    mission("geonosis", 2, "geonosis-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["500,000 TP"] }),
  ],
  felucia: [
    generic("felucia", 2, 6, "Mixed", 1, "125,000 → 250,000 TP"),
    mission("felucia", 2, "felucia-lando", "Combat Mission — Young Lando Calrissian", "combat", relicEntry(6, "Mixed", mandatory(member("Young Lando Calrissian", "YOUNGLANDO"))), { rewards: ["125,000 → 250,000 TP"], recommendations: [QIRA_YHAN] }),
    mission("felucia", 2, "felucia-jabba", "Combat Mission — Jabba the Hutt", "combat", relicEntry(6, "Mixed", mandatory(member("Jabba the Hutt", "JABBATHEHUTT"))), { rewards: ["125,000 → 250,000 TP"], recommendations: [JABBA] }),
    mission("felucia", 2, "felucia-hondo", "Special Mission — Hondo Ohnaka", "special", relicEntry(6, "Mixed", mandatory(member("Hondo Ohnaka", "HONDO"))), { rewards: ["125,000 → 250,000 TP" ] }),
    mission("felucia", 2, "felucia-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["500,000 TP"] }),
  ],
  bracca: [
    generic("bracca", 2, 6, "Light", 1, "125,000 → 250,000 TP"),
    generic("bracca", 2, 6, "Light", 2, "125,000 → 250,000 TP"),
    mission("bracca", 2, "bracca-jedi", "Combat Mission — Jedi", "combat", relicEntry(6, "Light", category("Jedi")), { rewards: ["125,000 → 250,000 TP"], recommendations: [JEDI] }),
    mission("bracca", 2, "bracca-zeffo-unlock", "Special Unlock — Cere Junda + Cal Kestis", "special", relicEntry(7, "Light", { squadSize: 2, allowedBaseIds: ["CEREJUNDA", "CALKESTIS", "JEDIKNIGHTCAL"], ...mandatory(member("Cere Junda", "CEREJUNDA")), notes: "Requires Cere Junda plus either Cal Kestis or Jedi Knight Cal Kestis at R7. Thirty guild clears unlock Zeffo." }), { rewards: ["50 Mk III Guild Event Tokens per clear", "30 clears unlock Zeffo"], sources: ["swgoh-wiki-rote-zones", "cg-zeffo"], mechanics: ["Cere is mandatory; the second legal slot must be one of the two Cal Kestis variants."] }),
    mission("bracca", 2, "bracca-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["500,000 TP"] }),
  ],
  dathomir: [
    generic("dathomir", 3, 7, "Dark", 1, "162,500 → 341,250 TP"),
    generic("dathomir", 3, 7, "Dark", 2, "162,500 → 341,250 TP"),
    mission("dathomir", 3, "dathomir-empire", "Combat Mission — Empire", "combat", relicEntry(7, "Dark", category("Empire")), { rewards: ["162,500 → 341,250 TP"] }),
    mission("dathomir", 3, "dathomir-aphra", "Combat Mission — Doctor Aphra", "combat", relicEntry(7, "Dark", mandatory(member("Doctor Aphra", "DOCTORAPHRA"))), { rewards: ["162,500 → 341,250 TP"], recommendations: [APHRA] }),
    mission("dathomir", 3, "dathomir-merrin", "Special Mission — Nightsisters + Merrin", "special", relicEntry(7, "Dark", { ...category("Nightsister"), ...mandatory(member("Merrin", "MERRIN")) }), { rewards: ["50 Mk II Guild Event Tokens per clear"], recommendations: [NS_MERRIN] }),
  ],
  tatooine: [
    generic("tatooine", 3, 7, "Mixed", 1, "162,500 → 341,250 TP"),
    mission("tatooine", 3, "tatooine-jabba", "Combat Mission — Jabba the Hutt", "combat", relicEntry(7, "Mixed", mandatory(member("Jabba the Hutt", "JABBATHEHUTT"))), { rewards: ["162,500 → 341,250 TP"], recommendations: [JABBA] }),
    mission("tatooine", 3, "tatooine-fennec", "Combat Mission — Fennec Shand", "combat", relicEntry(7, "Mixed", mandatory(member("Fennec Shand", "FENNECSHAND"))), { rewards: ["162,500 → 341,250 TP"] }),
    mission("tatooine", 3, "tatooine-reva", "Special Mission — Inquisitorius + Grand Inquisitor", "special", relicEntry(7, "Dark", { ...category("Inquisitorius"), ...mandatory(member("Grand Inquisitor", "GRANDINQUISITOR")) }), { rewards: ["1 Third Sister shard per clear"], recommendations: [INQUISITORS] }),
    mission("tatooine", 3, "tatooine-mandalore-unlock", "Special Unlock — Mandalorians + Bo-Katan (Mand'alor) + Beskar Mando", "special", relicEntry(7, "Mixed", { ...category("Mandalorian"), ...mandatory(member("Bo-Katan (Mand'alor)", "BOKATANMANDALORE"), member("The Mandalorian (Beskar Armor)", "BESKARMANDO")), notes: "Mandalorians at R7; Bo-Katan (Mand'alor) and The Mandalorian (Beskar Armor) are mandatory. Twenty-five guild clears unlock Mandalore." }), { rewards: ["50 Mk II Guild Event Tokens per clear", "25 clears unlock Mandalore"] }),
    mission("tatooine", 3, "tatooine-fleet", "Fleet Mission — Executor", "fleet", fleetEntry(mandatory(member("Executor", "CAPITALEXECUTOR"))), { rewards: ["682,500 TP"] }),
  ],
  kashyyyk: [
    mission("kashyyyk", 3, "kashyyyk-wookiee", "Combat Mission — Wookiees", "combat", relicEntry(7, "Light", category("Wookiee")), { rewards: ["162,500 → 341,250 TP"], recommendations: [WOOKIES] }),
    generic("kashyyyk", 3, 7, "Light", 1, "162,500 → 341,250 TP"),
    generic("kashyyyk", 3, 7, "Light", 2, "162,500 → 341,250 TP"),
    mission("kashyyyk", 3, "kashyyyk-saw", "Special Mission — Rebel Fighter + Saw Gerrera", "special", relicEntry(7, "Light", { ...category("Rebel Fighter"), ...mandatory(member("Saw Gerrera", "SAWGERRERA")) }), { rewards: ["50 Mk II Guild Event Tokens per clear"], recommendations: [SAW_RF] }),
    mission("kashyyyk", 3, "kashyyyk-fleet", "Fleet Mission — Profundity", "fleet", fleetEntry(mandatory(member("Profundity", "CAPITALPROFUNDITY"))), { rewards: ["682,500 TP"] }),
  ],
  zeffo: [
    generic("zeffo", 3, 7, "Light", 1, "162,500 → 341,250 TP"),
    mission("zeffo", 3, "zeffo-ufu", "Combat Mission — Unaligned Force Users", "combat", relicEntry(7, "Light", category("Unaligned Force User")), { rewards: ["162,500 → 341,250 TP"] }),
    mission("zeffo", 3, "zeffo-jkck", "Combat Mission — Jedi Knight Cal Kestis", "combat", relicEntry(7, "Light", mandatory(member("Jedi Knight Cal Kestis", "JEDIKNIGHTCAL"))), { rewards: ["487,500 → 1,023,750 TP"], mechanics: ["Jedi Knight Cal Kestis has Territory Battle Omicrons that are relevant to this battle mode."] }),
    mission("zeffo", 3, "zeffo-clones", "Special Mission — Clone Troopers", "special", relicEntry(7, "Light", category("Clone Trooper")), { rewards: ["50 Mk II Guild Event Tokens per clear"], recommendations: [CLONES], mechanics: ["Tomb Guardians cannot be defeated unless they are stunned; reliable Stun access is materially important."] }),
    mission("zeffo", 3, "zeffo-fleet", "Fleet Mission — Negotiator", "fleet", fleetEntry(mandatory(member("Negotiator", "CAPITALNEGOTIATOR"))), { rewards: ["682,500 TP"] }),
  ],
  haven: [
    generic("haven", 4, 8, "Dark", 1, "219,375 → 493,594 TP"),
    generic("haven", 4, 8, "Dark", 2, "219,375 → 493,594 TP"),
    generic("haven", 4, 8, "Dark", 3, "219,375 → 493,594 TP"),
    generic("haven", 4, 8, "Dark", 4, "219,375 → 493,594 TP"),
    mission("haven", 4, "haven-reva", "Special Mission — Inquisitorius + Third Sister", "special", relicEntry(8, "Dark", { ...category("Inquisitorius"), ...mandatory(member("Third Sister", "THIRDSISTER")) }), { rewards: ["20 Mk III Guild Event Tokens per clear"], recommendations: [REVA_INQS] }),
  ],
  kessel: [
    generic("kessel", 4, 8, "Mixed", 1, "219,375 → 493,594 TP"),
    generic("kessel", 4, 8, "Mixed", 2, "219,375 → 493,594 TP"),
    mission("kessel", 4, "kessel-jabba", "Combat Mission — Jabba the Hutt", "combat", relicEntry(8, "Mixed", mandatory(member("Jabba the Hutt", "JABBATHEHUTT"))), { rewards: ["219,375 → 493,594 TP"], recommendations: [JABBA] }),
    mission("kessel", 4, "kessel-qira-l3", "Special Mission — Qi'ra + L3-37", "special", relicEntry(8, "Mixed", mandatory(member("Qi'ra", "QIRA"), member("L3-37", "L337"))), { rewards: ["20 Mk III Guild Event Tokens per clear"], recommendations: [QIRA_YHAN] }),
    mission("kessel", 4, "kessel-fleet", "Fleet Mission — Ghost", "fleet", fleetEntry(mandatory(member("Ghost"))), { rewards: ["987,188 TP"] }),
  ],
  lothal: [
    mission("lothal", 4, "lothal-jedi", "Combat Mission — Jedi", "combat", relicEntry(8, "Light", category("Jedi")), { rewards: ["219,375 → 493,594 TP"], recommendations: [JEDI] }),
    mission("lothal", 4, "lothal-phoenix", "Combat Mission — Phoenix", "combat", relicEntry(8, "Light", category("Phoenix")), { rewards: ["219,375 → 493,594 TP"], recommendations: [PHOENIX] }),
    generic("lothal", 4, 8, "Light", 1, "219,375 → 493,594 TP"),
    mission("lothal", 4, "lothal-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["987,188 TP"] }),
  ],
  mandalore: [
    mission("mandalore", 4, "mandalore-bkm", "Combat Mission — Bo-Katan (Mand'alor)", "combat", relicEntry(8, "Mixed", mandatory(member("Bo-Katan (Mand'alor)", "BOKATANMANDALORE", { relicMin: 9 }))), { rewards: ["658,125 → 1,480,782 TP"], recommendations: [BKM], mechanics: ["Bo-Katan (Mand'alor) specifically requires R9 while the planet baseline is R8."] }),
    mission("mandalore", 4, "mandalore-dtmg", "Combat Mission — Dark Trooper Moff Gideon", "combat", relicEntry(8, "Mixed", mandatory(member("Dark Trooper Moff Gideon", "DARKTROOPERMOFFGIDEON"))), { rewards: ["219,375 → 493,594 TP"], recommendations: [DTMG] }),
    generic("mandalore", 4, 8, "Mixed", 1, "219,375 → 493,594 TP"),
    mission("mandalore", 4, "mandalore-fleet", "Fleet Mission — Gauntlet Starfighter", "fleet", fleetEntry(mandatory(member("Gauntlet Starfighter"))), { rewards: ["987,188 TP"] }),
  ],
  malachor: [
    generic("malachor", 5, 9, "Dark", 1, "307,125 → 721,744 TP"),
    generic("malachor", 5, 9, "Dark", 2, "307,125 → 721,744 TP"),
    generic("malachor", 5, 9, "Dark", 3, "307,125 → 721,744 TP"),
    mission("malachor", 5, "malachor-inqs", "Combat Mission — Eighth + Fifth + Seventh Sister", "combat", relicEntry(9, "Dark", mandatory(member("Eighth Brother", "EIGHTHBROTHER"), member("Fifth Brother", "FIFTHBROTHER"), member("Seventh Sister", "SEVENTHSISTER"))), { rewards: ["721,744 TP"], recommendations: [MALACHOR_INQS] }),
  ],
  vandor: [
    generic("vandor", 5, 9, "Mixed", 1, "307,125 → 721,744 TP"),
    generic("vandor", 5, 9, "Mixed", 2, "307,125 → 721,744 TP"),
    mission("vandor", 5, "vandor-jabba", "Combat Mission — Jabba the Hutt", "combat", relicEntry(9, "Mixed", mandatory(member("Jabba the Hutt", "JABBATHEHUTT"))), { rewards: ["307,125 → 721,744 TP"], recommendations: [JABBA] }),
    mission("vandor", 5, "vandor-yhan", "Special Mission — Young Han + Vandor Chewbacca", "special", relicEntry(9, "Mixed", mandatory(member("Young Han Solo", "YOUNGHAN"), member("Vandor Chewbacca", "VANDORCHEWBACCA"))), { rewards: ["20 Mk III Guild Event Tokens per clear"], recommendations: [VANDOR] }),
    mission("vandor", 5, "vandor-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["1,443,488 TP"] }),
  ],
  kafrene: [
    generic("kafrene", 5, 9, "Light", 1, "307,125 → 721,744 TP"),
    generic("kafrene", 5, 9, "Light", 2, "307,125 → 721,744 TP"),
    generic("kafrene", 5, 9, "Light", 3, "307,125 → 721,744 TP"),
    mission("kafrene", 5, "kafrene-cassian", "Combat Mission — Cassian Andor + K-2SO", "combat", relicEntry(9, "Light", mandatory(member("Cassian Andor", "CASSIANANDOR"), member("K-2SO", "K2SO"))), { rewards: ["307,125 → 721,744 TP"], recommendations: [ROGUE] }),
    mission("kafrene", 5, "kafrene-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["1,443,488 TP"] }),
  ],
  "death-star": [
    generic("death-star", 6, 9, "Dark", 1, "460,668 → 1,151,719 TP"),
    generic("death-star", 6, 9, "Dark", 2, "460,668 → 1,151,719 TP"),
    mission("death-star", 6, "death-star-iden", "Combat Mission — Iden Versio", "combat", relicEntry(9, "Dark", mandatory(member("Iden Versio", "IDENVERSIO"))), { rewards: ["460,668 → 1,151,719 TP"], recommendations: [IDEN] }),
    mission("death-star", 6, "death-star-vader", "Combat Mission — Darth Vader", "combat", relicEntry(9, "Dark", mandatory(member("Darth Vader", "VADER"))), { rewards: ["460,668 → 1,151,719 TP"], recommendations: [LV] }),
    mission("death-star", 6, "death-star-fleet", "Fleet Mission — Imperial TIE Fighter", "fleet", fleetEntry(mandatory(member("Imperial TIE Fighter"))), { rewards: ["2,303,438 TP"] }),
  ],
  hoth: [
    generic("hoth", 6, 9, "Mixed", 1, "460,668 → 1,151,719 TP"),
    generic("hoth", 6, 9, "Mixed", 2, "460,668 → 1,151,719 TP"),
    mission("hoth", 6, "hoth-jabba", "Combat Mission — Jabba the Hutt", "combat", relicEntry(9, "Mixed", mandatory(member("Jabba the Hutt", "JABBATHEHUTT"))), { rewards: ["460,668 → 1,151,719 TP"], recommendations: [JABBA] }),
    mission("hoth", 6, "hoth-aphra", "Special Mission — Doctor Aphra + BT-1 + 0-0-0", "special", relicEntry(9, "Mixed", mandatory(member("Doctor Aphra", "DOCTORAPHRA"), member("BT-1", "BT1"), member("0-0-0", "000"))), { rewards: ["460,668 → 1,151,719 TP"], recommendations: [APHRA] }),
    mission("hoth", 6, "hoth-fleet", "Fleet Mission", "fleet", fleetEntry(), { rewards: ["2,303,438 TP"] }),
  ],
  scarif: [
    generic("scarif", 6, 9, "Light", 1, "460,668 → 1,151,719 TP"),
    generic("scarif", 6, 9, "Light", 2, "460,668 → 1,151,719 TP"),
    mission("scarif", 6, "scarif-baze", "Combat Mission — Baze + Chirrut + Scarif Rebel Pathfinder", "combat", relicEntry(9, "Light", mandatory(member("Baze Malbus", "BAZEMALBUS"), member("Chirrut Îmwe", "CHIRRUTIMWE"), member("Scarif Rebel Pathfinder", "SCARIFREBEL"))), { rewards: ["460,668 → 1,151,719 TP"], recommendations: [SCARIF_BAZE] }),
    mission("scarif", 6, "scarif-cassian", "Combat Mission — Cassian + Pao + K-2SO", "combat", relicEntry(9, "Light", mandatory(member("Cassian Andor", "CASSIANANDOR"), member("Pao", "PAO"), member("K-2SO", "K2SO"))), { rewards: ["460,668 → 1,151,719 TP"], recommendations: [SCARIF_CASSIAN] }),
    mission("scarif", 6, "scarif-fleet", "Fleet Mission — Profundity", "fleet", fleetEntry(mandatory(member("Profundity", "CAPITALPROFUNDITY"))), { rewards: ["2,303,438 TP"] }),
  ],
});

export function roteMissionsForPlanet(planetId) {
  return ROTE_MISSIONS_BY_PLANET[String(planetId || "")] || [];
}

export const ROTE_MISSION_COUNT = Object.values(ROTE_MISSIONS_BY_PLANET).reduce((sum, missions) => sum + missions.length, 0);
