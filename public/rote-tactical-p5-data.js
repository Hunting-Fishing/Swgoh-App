const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";

export const ROTE_TACTICAL_P5_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  repository: "https://github.com/genskaar/tb_empire",
  sourceRevision: SOURCE_REVISION,
  lastVerified: "2026-08-19",
  note: "Encounter names and suggested squads are community-reference tactical aids; current R9 entry rules remain authoritative for legality.",
});

const team = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "community",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze([ROTE_TACTICAL_P5_SOURCE.sourceId]),
  lastVerified: ROTE_TACTICAL_P5_SOURCE.lastVerified,
});

const tactical = (name, enemies, commandTag, presetPrefix, recommendations = []) => Object.freeze({
  name,
  enemies: Object.freeze(enemies),
  commandTag,
  presetPrefix,
  recommendations: Object.freeze(recommendations),
});

const SLKR = (id, name) => team(id, name, ["Supreme Leader Kylo Ren", "Sith Trooper", "Kylo Ren (Unmasked)", "General Hux", "First Order Stormtrooper"]);
const LV = (id, name) => team(id, name, ["Lord Vader", "Maul", "Dark Trooper Moff Gideon", "Admiral Piett", "Royal Guard"]);
const SEE = (id, name) => team(id, name, ["Sith Eternal Emperor", "Darth Malak", "Darth Malgus", "Sith Empire Trooper", "Darth Sion"]);
const GUNGANS = (id, name) => team(id, name, ["Boss Nass", "Jar Jar Binks", "Captain Tarpals", "Gungan Phalanx", "Gungan Boomadier"]);
const JMK = (id, name) => team(id, name, ["Jedi Master Kenobi", "Commander Ahsoka Tano", "Padme Amidala", "General Kenobi", "General Skywalker"]);
const LEIA = (id, name) => team(id, name, ["Leia Organa", "Captain Drogan", "R2-D2", "Admiral Raddus", "Captain Rex"]);
const JKCK = (id, name) => team(id, name, ["Jedi Knight Cal Kestis", "Jedi Knight Luke Skywalker", "Jedi Master Luke Skywalker", "Mace Windu", "General Skywalker"]);
const BKM = (id, name) => team(id, name, ["Bo-Katan (Mand'alor)", "Paz Vizsla", "IG-12 & Grogu", "The Mandalorian (Beskar Armor)", "Bo-Katan Kryze"]);
const PROFUNDITY = (id, name) => team(id, name, ["Profundity", "Han's Millennium Falcon", "Rebel Y-wing", "Outrider", "Ghost", "Biggs Darklighter's X-wing", "Phantom II", "Cassian's U-wing"]);
const EXECUTOR = (id, name) => team(id, name, ["Executor", "Hound's Tooth", "Razor Crest", "Xanadu Blood", "Slave I", "IG-2000", "Ebon Hawk"]);

export const ROTE_TACTICAL_P5_OVERRIDES = Object.freeze({
  // ── Malachor ───────────────────────────────────────────────────────────────
  "malachor-generic-1": tactical(
    "Combat · Rebels → Kanan/Fulcrum",
    ["Rebel Officer / Rebel Pilots / Soldiers", "Kanan Jarrus / Ahsoka Tano (Fulcrum) / Zeb"],
    "REBELS → KANAN/FULCRUM | SLKR",
    "ROTE-P5-MAL-REBELS-A",
    [SLKR("rote-p5-mal-c1-slkr", "ROTE-P5-MAL-REBELS-A-SLKR")],
  ),
  "malachor-generic-2": tactical(
    "Combat · Rebels → Hera Phoenix",
    ["Rebel Officer / Rebel Pilots / Soldiers", "Hera Syndulla / Zeb / Sabine / Chopper / Fulcrum / Kanan"],
    "REBELS → HERA PHOENIX | LV",
    "ROTE-P5-MAL-REBELS-B",
    [LV("rote-p5-mal-c2-lv", "ROTE-P5-MAL-REBELS-B-LV")],
  ),
  "malachor-inqs": tactical(
    "Inquisitors · Fulcrum → Maul/Ezra",
    ["Ahsoka Tano (Fulcrum)", "Maul / Ezra Bridger"],
    "INQS | FULCRUM → MAUL/EZRA",
    "ROTE-P5-MAL-INQS",
    [team("rote-p5-mal-inqs", "ROTE-P5-MAL-INQS", ["Grand Inquisitor", "Seventh Sister", "Third Sister", "Fifth Brother", "Eighth Brother"])],
  ),
  "malachor-generic-3": tactical(
    "Combat · Rebels → Hera/Sabine",
    ["Rebel Officer / Rebel Pilots / Soldiers", "Hera Syndulla / Sabine Wren / Chopper"],
    "REBELS → HERA/SABINE | SEE",
    "ROTE-P5-MAL-REBELS-C",
    [SEE("rote-p5-mal-c6-see", "ROTE-P5-MAL-REBELS-C-SEE")],
  ),

  // ── Vandor ─────────────────────────────────────────────────────────────────
  "vandor-fleet": tactical(
    "Fleet · Executor",
    ["Executor / Hound's Tooth / Xanadu Blood / Razor Crest / bounty hunter fleet"],
    "FLEET | EXECUTOR / LEVIATHAN",
    "ROTE-P5-VAN-FLEET",
    [EXECUTOR("rote-p5-van-fleet-executor", "ROTE-P5-VAN-FLEET-EXECUTOR"), team("rote-p5-van-fleet-leviathan", "ROTE-P5-VAN-FLEET-LEVIATHAN", ["Leviathan", "B-28 Extinction-class Bomber", "TIE Dagger", "Fury-class Interceptor", "Mark VI Interceptor", "Sith Fighter", "Scimitar"])],
  ),
  "vandor-generic-1": tactical(
    "Combat · Stormtroopers → Imperial Officer",
    ["Stormtrooper Commander / Range Troopers / TIE Pilot", "Imperial Officer / Stormtrooper Commando / Range Troopers"],
    "IMPERIALS | GUNGANS / JKCK+REY",
    "ROTE-P5-VAN-IMPERIALS",
    [GUNGANS("rote-p5-van-c2-gungans", "ROTE-P5-VAN-IMPERIALS-GUNGANS"), team("rote-p5-van-c2-jkck-rey", "ROTE-P5-VAN-IMPERIALS-JKCK-REY", ["Jedi Knight Cal Kestis", "Rey", "Ben Solo", "Commander Ahsoka Tano", "Ahsoka Tano"])],
  ),
  "vandor-yhan": tactical(
    "Young Han + Vandor · Snowtroopers",
    ["Range Troopers / Snowtrooper Scouts / Snowtrooper Commander"],
    "YOUNG HAN + VANDOR | SNOWTROOPERS | REY",
    "ROTE-P5-VAN-YHAN",
    [team("rote-p5-van-yhan-rey", "ROTE-P5-VAN-YHAN-REY", ["Rey", "Vandor Chewbacca", "Young Han Solo", "L3-37", "Ben Solo"])],
  ),
  "vandor-generic-2": tactical(
    "Combat · Cartel → Enfys Nest",
    ["Cartel Spy / Bruisers / Saboteurs", "Enfys Nest / Cartel squad"],
    "CARTEL → ENFYS | GUNGANS / JKCK+REY",
    "ROTE-P5-VAN-CARTEL",
    [GUNGANS("rote-p5-van-c4-gungans", "ROTE-P5-VAN-CARTEL-GUNGANS"), team("rote-p5-van-c4-jkck-rey", "ROTE-P5-VAN-CARTEL-JKCK-REY", ["Jedi Knight Cal Kestis", "Rey", "Ben Solo", "Commander Ahsoka Tano", "Ahsoka Tano"])],
  ),
  "vandor-jabba": tactical(
    "Jabba · Pike Syndicate",
    ["Pike Sentinels / Pirate squad", "Pike Sentinels / Pirate squad"],
    "JABBA | PIKES",
    "ROTE-P5-VAN-JABBA",
    [team("rote-p5-van-jabba", "ROTE-P5-VAN-JABBA", ["Jabba the Hutt", "Krrsantan", "Skiff Guard (Lando Calrissian)", "Boushh (Leia Organa)", "Boba Fett"])],
  ),

  // ── Ring of Kafrene ────────────────────────────────────────────────────────
  "kafrene-fleet": tactical(
    "Fleet · Executrix + Scythe",
    ["Executrix / TIE Advanced x1 / Scythe / Imperial fleet"],
    "FLEET | PROFUNDITY",
    "ROTE-P5-KAF-FLEET",
    [PROFUNDITY("rote-p5-kaf-fleet-profundity", "ROTE-P5-KAF-FLEET-PROFUNDITY")],
  ),
  "kafrene-cassian": tactical(
    "Cassian + K-2SO · Stormtrooper Wall",
    ["Stormtrooper Commander / Death Trooper / Scouts", "Stormtrooper Commander / 4x Stormtrooper"],
    "CASSIAN+K2 | STORMTROOPERS | ROGUE ONE",
    "ROTE-P5-KAF-CASSIAN",
    [team("rote-p5-kaf-cassian-rogue", "ROTE-P5-KAF-CASSIAN-ROGUE-ONE", ["Admiral Raddus", "Cassian Andor", "K-2SO", "Jyn Erso", "Scarif Rebel Pathfinder"])],
  ),
  "kafrene-generic-1": tactical(
    "Combat · Cartel",
    ["Mob Enforcer / Cartel Bruisers / Cartel Spies / Saboteurs"],
    "CARTEL | JMK / LEIA / JKCK",
    "ROTE-P5-KAF-CARTEL",
    [JMK("rote-p5-kaf-c3-jmk", "ROTE-P5-KAF-CARTEL-JMK"), LEIA("rote-p5-kaf-c3-leia", "ROTE-P5-KAF-CARTEL-LEIA"), JKCK("rote-p5-kaf-c3-jkck", "ROTE-P5-KAF-CARTEL-JKCK")],
  ),
  "kafrene-generic-2": tactical(
    "Combat · Stormtroopers → Mara Jade",
    ["Stormtrooper Commander / Death Trooper / Scouts", "Mara Jade / Death Trooper / Stormtroopers"],
    "IMPERIALS → MARA | JKCK / CLS",
    "ROTE-P5-KAF-MARA",
    [JKCK("rote-p5-kaf-c4-jkck", "ROTE-P5-KAF-MARA-JKCK"), team("rote-p5-kaf-c4-cls", "ROTE-P5-KAF-MARA-CLS", ["Commander Luke Skywalker", "Han Solo", "Chewbacca", "Threepio & Chewie", "C-3PO"])],
  ),
  "kafrene-generic-3": tactical(
    "Combat · Stormtroopers → Imperial Officer",
    ["Stormtrooper Commander / Death Trooper / Scouts", "Imperial Officer / Death Trooper / Stormtroopers"],
    "IMPERIALS → OFFICER | BKM",
    "ROTE-P5-KAF-IMPERIALS",
    [BKM("rote-p5-kaf-c6-bkm", "ROTE-P5-KAF-IMPERIALS-BKM")],
  ),
});

export function roteTacticalP5Override(missionId) {
  return ROTE_TACTICAL_P5_OVERRIDES[String(missionId || "")] || null;
}
