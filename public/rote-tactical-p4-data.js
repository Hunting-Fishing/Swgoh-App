const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";

export const ROTE_TACTICAL_P4_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  repository: "https://github.com/genskaar/tb_empire",
  sourceRevision: SOURCE_REVISION,
  lastVerified: "2026-08-19",
  note: "Encounter names and suggested squads are community-reference tactical aids; current R8 entry rules remain the authoritative legality layer.",
});

const team = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "community",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze([ROTE_TACTICAL_P4_SOURCE.sourceId]),
  lastVerified: ROTE_TACTICAL_P4_SOURCE.lastVerified,
});

const tactical = (name, enemies, commandTag, presetPrefix, recommendations = []) => Object.freeze({
  name,
  enemies: Object.freeze(enemies),
  commandTag,
  presetPrefix,
  recommendations: Object.freeze(recommendations),
});

const SLKR = (id, name) => team(id, name, ["Supreme Leader Kylo Ren", "First Order Officer", "Kylo Ren (Unmasked)", "General Hux", "Sith Trooper"]);
const SEE = (id, name) => team(id, name, ["Sith Eternal Emperor", "Darth Malak", "Darth Revan", "Darth Malgus", "Wat Tambor"]);
const LV = (id, name) => team(id, name, ["Lord Vader", "Maul", "Royal Guard", "Admiral Piett", "Darth Vader"]);
const NS = (id, name) => team(id, name, ["Mother Talzin", "Old Daka", "Asajj Ventress", "Nightsister Zombie", "Merrin"]);
const REVA = (id, name) => team(id, name, ["Third Sister", "Grand Inquisitor", "Seventh Sister", "Ninth Sister", "Fifth Brother"]);
const JABBA = (id, name) => team(id, name, ["Jabba the Hutt", "Krrsantan", "Skiff Guard (Lando Calrissian)", "Boushh (Leia Organa)", "Boba Fett"]);
const JML = (id, name) => team(id, name, ["Jedi Master Luke Skywalker", "Jedi Knight Luke Skywalker", "Jedi Knight Cal Kestis", "Grand Master Yoda", "General Skywalker"]);
const JMK = (id, name) => team(id, name, ["Jedi Master Kenobi", "Commander Ahsoka Tano", "Padme Amidala", "General Kenobi", "General Skywalker"]);
const LEIA = (id, name) => team(id, name, ["Leia Organa", "R2-D2", "Captain Drogan", "Captain Rex", "Commander Luke Skywalker"]);
const PROFUNDITY = (id, name) => team(id, name, ["Profundity", "Han's Millennium Falcon", "Rebel Y-wing", "Outrider", "Biggs Darklighter's X-wing", "Phantom II", "Cassian's U-wing", "Ghost"]);
const BKM = (id, name) => team(id, name, ["Bo-Katan (Mand'alor)", "IG-12 & Grogu", "Paz Vizsla", "The Mandalorian (Beskar Armor)", "Bo-Katan Kryze"]);
const GUNGANS = (id, name) => team(id, name, ["Boss Nass", "Jar Jar Binks", "Captain Tarpals", "Gungan Phalanx", "Gungan Boomadier"]);

export const ROTE_TACTICAL_P4_OVERRIDES = Object.freeze({
  // ── Haven ──────────────────────────────────────────────────────────────────
  "haven-generic-1": tactical(
    "Combat · Partisans → Phoenix",
    ["Partisan Fighters / Rebel Spies", "Kanan Jarrus / Ezra Bridger / Chopper / Captain Rex"],
    "PARTISANS → PHOENIX | LV+MAUL / NS / SEE / SLKR",
    "ROTE-P4-HAV-PARTISANS-A",
    [LV("rote-p4-hav-c1-lv", "ROTE-P4-HAV-PARTISANS-A-LV"), NS("rote-p4-hav-c1-ns", "ROTE-P4-HAV-PARTISANS-A-NS"), SEE("rote-p4-hav-c1-see", "ROTE-P4-HAV-PARTISANS-A-SEE"), SLKR("rote-p4-hav-c1-slkr", "ROTE-P4-HAV-PARTISANS-A-SLKR")],
  ),
  "haven-generic-2": tactical(
    "Combat · Partisans → Phoenix",
    ["Partisan Fighters / Rebel Spies", "Kanan Jarrus / Ezra Bridger / Chopper / Captain Rex"],
    "PARTISANS → PHOENIX | LV+MAUL / NS / SEE / SLKR",
    "ROTE-P4-HAV-PARTISANS-B",
    [LV("rote-p4-hav-c2-lv", "ROTE-P4-HAV-PARTISANS-B-LV"), NS("rote-p4-hav-c2-ns", "ROTE-P4-HAV-PARTISANS-B-NS"), SEE("rote-p4-hav-c2-see", "ROTE-P4-HAV-PARTISANS-B-SEE"), SLKR("rote-p4-hav-c2-slkr", "ROTE-P4-HAV-PARTISANS-B-SLKR")],
  ),
  "haven-reva": tactical(
    "Third Sister Inquisitors · Partisans → Sabine Phoenix",
    ["Partisan Fighters / Rebel Spies", "Sabine Wren / Ezra Bridger / Chopper / Zeb"],
    "REVA INQS | PARTISANS → SABINE",
    "ROTE-P4-HAV-REVA",
    [REVA("rote-p4-hav-reva", "ROTE-P4-HAV-REVA-INQS")],
  ),
  "haven-generic-3": tactical(
    "Brain Worms · 50R-T Droid Squad",
    ["50R-T / 0-0-0 / HK-47 / T3-M4 / BT-1"],
    "BRAIN WORMS | SLKR+BSF | CLEAR AT 3+",
    "ROTE-P4-HAV-BRAIN-WORMS",
    [team("rote-p4-hav-brain-slkr", "ROTE-P4-HAV-BRAIN-WORMS-SLKR", ["Supreme Leader Kylo Ren", "Kylo Ren (Unmasked)", "Bastila Shan (Fallen)", "Darth Malak", "Darth Malgus"])],
  ),
  "haven-generic-4": tactical(
    "Combat · Partisans → Phoenix",
    ["Partisan Fighters / Rebel Spies", "Kanan Jarrus / Ezra Bridger / Chopper / Captain Rex"],
    "PARTISANS → PHOENIX | LV+MAUL / NS / SEE / SLKR",
    "ROTE-P4-HAV-PARTISANS-C",
    [LV("rote-p4-hav-c6-lv", "ROTE-P4-HAV-PARTISANS-C-LV"), NS("rote-p4-hav-c6-ns", "ROTE-P4-HAV-PARTISANS-C-NS"), SEE("rote-p4-hav-c6-see", "ROTE-P4-HAV-PARTISANS-C-SEE"), SLKR("rote-p4-hav-c6-slkr", "ROTE-P4-HAV-PARTISANS-C-SLKR")],
  ),

  // ── Kessel ─────────────────────────────────────────────────────────────────
  "kessel-fleet": tactical(
    "Fleet · Executor",
    ["Executor / Hound's Tooth / Xanadu Blood / Razor Crest / bounty hunter fleet"],
    "FLEET | EXECUTOR / PROFUNDITY",
    "ROTE-P4-KES-FLEET",
    [team("rote-p4-kes-fleet-executor", "ROTE-P4-KES-FLEET-EXECUTOR", ["Executor", "Hound's Tooth", "Razor Crest", "Ghost", "Xanadu Blood", "Slave I", "IG-2000", "Ebon Hawk"]), PROFUNDITY("rote-p4-kes-fleet-profundity", "ROTE-P4-KES-FLEET-PROFUNDITY")],
  ),
  "kessel-generic-1": tactical(
    "Combat · Pike Syndicate",
    ["Pike Sentinels / Pirate squad", "Pike Sentinels / Pirate squad"],
    "PIKES | SLKR / LV / REY / JMK / BKM / GUNGANS",
    "ROTE-P4-KES-PIKES-A",
    [SLKR("rote-p4-kes-c2-slkr", "ROTE-P4-KES-PIKES-A-SLKR"), LV("rote-p4-kes-c2-lv", "ROTE-P4-KES-PIKES-A-LV"), team("rote-p4-kes-c2-rey", "ROTE-P4-KES-PIKES-A-REY", ["Rey", "Ben Solo", "Cal Kestis", "Cere Junda", "Rey (Jedi Training)"]), JMK("rote-p4-kes-c2-jmk", "ROTE-P4-KES-PIKES-A-JMK"), BKM("rote-p4-kes-c2-bkm", "ROTE-P4-KES-PIKES-A-BKM"), GUNGANS("rote-p4-kes-c2-gungans", "ROTE-P4-KES-PIKES-A-GUNGANS")],
  ),
  "kessel-qira-l3": tactical(
    "Qi'ra + L3-37 · Pike Syndicate",
    ["Pike Sentinels / Pirate squad", "Pike Sentinels / Pirate squad"],
    "QIRA+L3 | PIKES | REY SCOUNDRELS",
    "ROTE-P4-KES-QIRA-L3",
    [team("rote-p4-kes-qira-rey", "ROTE-P4-KES-QIRA-L3-REY", ["Rey", "Qi'ra", "L3-37", "Han Solo", "Chewbacca"])],
  ),
  "kessel-jabba": tactical(
    "Jabba · Pikes → Qi'ra/L3",
    ["Pike Sentinels / Pirate squad", "Qi'ra / L3-37 / Young Han / Young Lando / Vandor Chewbacca"],
    "JABBA | PIKES → QIRA/L3",
    "ROTE-P4-KES-JABBA",
    [JABBA("rote-p4-kes-jabba", "ROTE-P4-KES-JABBA")],
  ),
  "kessel-generic-2": tactical(
    "Combat · Pike Syndicate",
    ["Pike Sentinels / Pirate squad", "Pike Sentinels / Pirate squad"],
    "PIKES | SLKR / LV / REY / JMK / BKM / GUNGANS",
    "ROTE-P4-KES-PIKES-B",
    [SLKR("rote-p4-kes-c6-slkr", "ROTE-P4-KES-PIKES-B-SLKR"), LV("rote-p4-kes-c6-lv", "ROTE-P4-KES-PIKES-B-LV"), team("rote-p4-kes-c6-rey", "ROTE-P4-KES-PIKES-B-REY", ["Rey", "Ben Solo", "Cal Kestis", "Cere Junda", "Rey (Jedi Training)"]), JMK("rote-p4-kes-c6-jmk", "ROTE-P4-KES-PIKES-B-JMK"), BKM("rote-p4-kes-c6-bkm", "ROTE-P4-KES-PIKES-B-BKM"), GUNGANS("rote-p4-kes-c6-gungans", "ROTE-P4-KES-PIKES-B-GUNGANS")],
  ),

  // ── Lothal ─────────────────────────────────────────────────────────────────
  "lothal-jedi": tactical(
    "Jedi · Stormtroopers → Imperial Officer",
    ["Stormtrooper Commander / Scout Troopers", "Imperial Officer / Stormtroopers / Scout Troopers"],
    "JEDI | IMPERIALS | JML / JKCK",
    "ROTE-P4-LOT-JEDI",
    [JML("rote-p4-lot-jedi-jml", "ROTE-P4-LOT-JEDI-JML"), team("rote-p4-lot-jedi-jkck", "ROTE-P4-LOT-JEDI-JKCK", ["Jedi Knight Cal Kestis", "Jedi Knight Luke Skywalker", "Ahsoka Tano", "Mace Windu", "General Skywalker"])],
  ),
  "lothal-generic-1": tactical(
    "Combat · Stormtroopers → Imperial Officer",
    ["Stormtrooper Commander / Scout Troopers", "Imperial Officer / Stormtroopers / Scout Troopers"],
    "IMPERIALS | LEIA / JMK / oROLO / oFINN / BKM",
    "ROTE-P4-LOT-IMPERIALS",
    [LEIA("rote-p4-lot-generic-leia", "ROTE-P4-LOT-IMPERIALS-LEIA"), JMK("rote-p4-lot-generic-jmk", "ROTE-P4-LOT-IMPERIALS-JMK"), team("rote-p4-lot-generic-rolo", "ROTE-P4-LOT-IMPERIALS-oROLO", ["Rebel Officer Leia Organa", "Han Solo", "Chewbacca", "Threepio & Chewie", "Commander Luke Skywalker"]), team("rote-p4-lot-generic-ofinn", "ROTE-P4-LOT-IMPERIALS-oFINN", ["Finn", "Rey (Jedi Training)", "Poe Dameron", "BB-8", "R2-D2"]), BKM("rote-p4-lot-generic-bkm", "ROTE-P4-LOT-IMPERIALS-BKM")],
  ),
  "lothal-phoenix": tactical(
    "Phoenix · Stormtroopers → Thrawn",
    ["Stormtrooper Commander / Scout Troopers", "Grand Admiral Thrawn / Death Troopers / Stormtroopers"],
    "PHOENIX | CRex | → THRAWN",
    "ROTE-P4-LOT-PHOENIX",
    [team("rote-p4-lot-phoenix", "ROTE-P4-LOT-PHOENIX-CREX", ["Hera Syndulla", "Ezra Bridger", "Chopper", "Kanan Jarrus", "Captain Rex"])],
  ),
  "lothal-fleet": tactical(
    "Fleet · Chimaera",
    ["Chimaera / TIE Advanced x1 / TIE Bomber / TIE Fighter / TIE Interceptor"],
    "FLEET | PROFUNDITY",
    "ROTE-P4-LOT-FLEET",
    [PROFUNDITY("rote-p4-lot-fleet-profundity", "ROTE-P4-LOT-FLEET-PROFUNDITY")],
  ),
});

export function roteTacticalP4Override(missionId) {
  return ROTE_TACTICAL_P4_OVERRIDES[String(missionId || "")] || null;
}
