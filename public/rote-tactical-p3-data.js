const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";

export const ROTE_TACTICAL_P3_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  repository: "https://github.com/genskaar/tb_empire",
  sourceRevision: SOURCE_REVISION,
  lastVerified: "2026-08-19",
  note: "Encounter names and suggested squads are community-reference tactical aids; current mission entry rules stay authoritative for legality.",
});

const team = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "community",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze([ROTE_TACTICAL_P3_SOURCE.sourceId]),
  lastVerified: ROTE_TACTICAL_P3_SOURCE.lastVerified,
});

const tactical = (name, enemies, commandTag, presetPrefix, recommendations = []) => Object.freeze({
  name,
  enemies: Object.freeze(enemies),
  commandTag,
  presetPrefix,
  recommendations: Object.freeze(recommendations),
});

const SLKR = (id, name) => team(id, name, ["Supreme Leader Kylo Ren", "First Order Officer", "Kylo Ren (Unmasked)", "General Hux", "Sith Trooper"]);
const INQS = (id, name) => team(id, name, ["Grand Inquisitor", "Seventh Sister", "Ninth Sister", "Fifth Brother", "Eighth Brother"]);
const JABBA = (id, name) => team(id, name, ["Jabba the Hutt", "Krrsantan", "Skiff Guard (Lando Calrissian)", "Boushh (Leia Organa)", "Boba Fett"]);
const JMK = (id, name, fifth = "General Skywalker") => team(id, name, ["Jedi Master Kenobi", "Commander Ahsoka Tano", "Padme Amidala", "General Kenobi", fifth]);
const JML = (id, name) => team(id, name, ["Jedi Master Luke Skywalker", "Jedi Knight Luke Skywalker", "Hermit Yoda", "Jolee Bindo", "Jedi Knight Revan"]);
const LEIA = (id, name) => team(id, name, ["Leia Organa", "Captain Drogan", "R2-D2", "Commander Luke Skywalker", "Captain Rex"]);
const OFINN = (id, name) => team(id, name, ["Finn", "Rey (Jedi Training)", "Poe Dameron", "BB-8", "R2-D2"]);
const PROFUNDITY = (id, name) => team(id, name, ["Profundity", "Han's Millennium Falcon", "Rebel Y-wing", "Outrider", "Biggs Darklighter's X-wing", "Phantom II", "Cassian's U-wing", "Ghost"]);
const EXECUTOR = (id, name) => team(id, name, ["Executor", "Hound's Tooth", "Razor Crest", "Xanadu Blood", "Slave I", "IG-2000"]);

export const ROTE_TACTICAL_P3_OVERRIDES = Object.freeze({
  // ── Dathomir ───────────────────────────────────────────────────────────────
  "dathomir-aphra": tactical(
    "Doctor Aphra · Nightsisters → Talzin",
    ["Nightsister Acolytes / Zombie / Spirit", "Mother Talzin / Old Daka / Nightsisters"],
    "APHRA | NIGHTSISTERS → TALZIN",
    "ROTE-P3-DAT-APHRA",
    [team("rote-p3-dat-aphra", "ROTE-P3-DAT-APHRA", ["Doctor Aphra", "BT-1", "0-0-0", "IG-88", "HK-47"])],
  ),
  "dathomir-generic-1": tactical(
    "Combat · Nightsisters → Talzin",
    ["Nightsister Acolytes / Zombie / Spirit", "Mother Talzin / Old Daka / Nightsisters"],
    "NIGHTSISTERS → TALZIN | SEE / SLKR / TRENCH / INQS",
    "ROTE-P3-DAT-NS-A",
    [
      team("rote-p3-dat-c2-see", "ROTE-P3-DAT-NS-A-SEE", ["Sith Eternal Emperor", "Darth Revan", "Darth Malak", "Darth Malgus", "Sith Marauder"]),
      SLKR("rote-p3-dat-c2-slkr", "ROTE-P3-DAT-NS-A-SLKR"),
      team("rote-p3-dat-c2-trench", "ROTE-P3-DAT-NS-A-TRENCH", ["Admiral Trench", "Nute Gunray", "Jango Fett", "Count Dooku", "Wat Tambor"]),
      INQS("rote-p3-dat-c2-inqs", "ROTE-P3-DAT-NS-A-INQS"),
    ],
  ),
  "dathomir-empire": tactical(
    "Empire · Nightsisters → Talzin",
    ["Nightsister Acolytes / Zombie / Spirit", "Mother Talzin / Old Daka / Nightsisters"],
    "EMPIRE | NIGHTSISTERS → TALZIN | LV / EP",
    "ROTE-P3-DAT-EMPIRE",
    [
      team("rote-p3-dat-empire-lv", "ROTE-P3-DAT-EMPIRE-LV", ["Lord Vader", "Darth Vader", "Royal Guard", "Admiral Piett", "Grand Admiral Thrawn"]),
      team("rote-p3-dat-empire-ep", "ROTE-P3-DAT-EMPIRE-EP", ["Emperor Palpatine", "Darth Vader", "Royal Guard", "Admiral Piett", "Mara Jade, The Emperor's Hand"]),
    ],
  ),
  "dathomir-generic-2": tactical(
    "Combat · Nightsisters → Talzin",
    ["Nightsister Acolytes / Zombie / Spirit", "Mother Talzin / Old Daka / Nightsisters"],
    "NIGHTSISTERS → TALZIN | SEE / SLKR / TRENCH / INQS",
    "ROTE-P3-DAT-NS-B",
    [
      team("rote-p3-dat-c6-see", "ROTE-P3-DAT-NS-B-SEE", ["Sith Eternal Emperor", "Darth Revan", "Darth Malak", "Darth Malgus", "Sith Marauder"]),
      SLKR("rote-p3-dat-c6-slkr", "ROTE-P3-DAT-NS-B-SLKR"),
      team("rote-p3-dat-c6-trench", "ROTE-P3-DAT-NS-B-TRENCH", ["Admiral Trench", "Nute Gunray", "Jango Fett", "Count Dooku", "Wat Tambor"]),
      INQS("rote-p3-dat-c6-inqs", "ROTE-P3-DAT-NS-B-INQS"),
    ],
  ),
  "dathomir-merrin": tactical(
    "Merrin Nightsisters · Hondo → Maul/Qi'ra",
    ["Hondo Ohnaka / IG-88 / mercenaries", "Maul / Qi'ra / Dash Rendar / Cartel"],
    "MERRIN NS | HONDO → MAUL/QIRA",
    "ROTE-P3-DAT-MERRIN",
    [team("rote-p3-dat-merrin", "ROTE-P3-DAT-MERRIN-DAKA", ["Old Daka", "Mother Talzin", "Asajj Ventress", "Nightsister Zombie", "Merrin"])],
  ),

  // ── Tatooine ───────────────────────────────────────────────────────────────
  "tatooine-fleet": tactical(
    "Fleet · Chimaera",
    ["Chimaera / TIE Advanced x1 / TIE Bomber / TIE Fighter / TIE Interceptor"],
    "FLEET | EXECUTOR",
    "ROTE-P3-TAT-FLEET",
    [EXECUTOR("rote-p3-tat-fleet-executor", "ROTE-P3-TAT-FLEET-EXECUTOR")],
  ),
  "tatooine-jabba": tactical(
    "Jabba · Pirates → Hondo",
    ["Pirate Leader squad", "Hondo Ohnaka / Pirate squad"],
    "JABBA | PIRATES → HONDO",
    "ROTE-P3-TAT-JABBA",
    [JABBA("rote-p3-tat-jabba", "ROTE-P3-TAT-JABBA")],
  ),
  "tatooine-fennec": tactical(
    "Fennec · Tusken Tribes",
    ["Tusken Elder / Brute / Raiders / Shaman"],
    "FENNEC | TUSKENS | BH / JMK",
    "ROTE-P3-TAT-FENNEC",
    [
      team("rote-p3-tat-fennec-bh", "ROTE-P3-TAT-FENNEC-BH", ["Bossk", "Jango Fett", "Boba Fett, Scion of Jango", "Fennec Shand", "Dengar"]),
      team("rote-p3-tat-fennec-jmk", "ROTE-P3-TAT-FENNEC-JMK", ["Jedi Master Kenobi", "Commander Ahsoka Tano", "Padme Amidala", "General Kenobi", "Fennec Shand"]),
    ],
  ),
  "tatooine-reva": tactical(
    "Reva Mission · Jawas → JMK",
    ["Chief Nebit / Jawa Scavenger / Jawas", "Jedi Master Kenobi"],
    "REVA SHARD | INQUISITORS | JAWAS → JMK",
    "ROTE-P3-TAT-REVA",
    [INQS("rote-p3-tat-reva-inqs", "ROTE-P3-TAT-REVA-INQS")],
  ),
  "tatooine-generic-1": tactical(
    "Combat · Sandtroopers",
    ["Sandtrooper Commander / Sandtroopers", "Imperial Officer / Sandtroopers"],
    "SANDTROOPERS | GAS / oFINN / REBELS / JMK",
    "ROTE-P3-TAT-SANDTROOPERS",
    [
      team("rote-p3-tat-generic-gas", "ROTE-P3-TAT-SANDTROOPERS-GAS", ["General Skywalker", "ARC Trooper", "CT-21-0408 Echo", "CT-7567 Rex", "CT-5555 Fives"]),
      OFINN("rote-p3-tat-generic-ofinn", "ROTE-P3-TAT-SANDTROOPERS-oFINN"),
      team("rote-p3-tat-generic-rebels", "ROTE-P3-TAT-SANDTROOPERS-REBELS", ["Commander Luke Skywalker", "Chewbacca", "Han Solo", "Admiral Raddus", "Threepio & Chewie"]),
      JMK("rote-p3-tat-generic-jmk", "ROTE-P3-TAT-SANDTROOPERS-JMK"),
    ],
  ),

  // ── Kashyyyk ───────────────────────────────────────────────────────────────
  "kashyyyk-fleet": tactical(
    "Fleet · Executrix + Scythe",
    ["Executrix / TIE Advanced x1 / Scythe / Imperial fleet"],
    "FLEET | PROFUNDITY",
    "ROTE-P3-KAS-FLEET",
    [PROFUNDITY("rote-p3-kas-fleet-profundity", "ROTE-P3-KAS-FLEET-PROFUNDITY")],
  ),
  "kashyyyk-generic-1": tactical(
    "Combat · Stormtroopers → Mara Jade",
    ["Stormtrooper Commander squad", "Mara Jade / Purge Troopers / Imperial squad"],
    "IMPERIALS → MARA | JMK / JML / LEIA / MM",
    "ROTE-P3-KAS-MARA",
    [
      JMK("rote-p3-kas-c2-jmk", "ROTE-P3-KAS-MARA-JMK"),
      JML("rote-p3-kas-c2-jml", "ROTE-P3-KAS-MARA-JML"),
      LEIA("rote-p3-kas-c2-leia", "ROTE-P3-KAS-MARA-LEIA"),
      team("rote-p3-kas-c2-mm", "ROTE-P3-KAS-MARA-MM", ["Mon Mothma", "Pao", "Hoth Rebel Scout", "Cara Dune", "Kyle Katarn"]),
    ],
  ),
  "kashyyyk-generic-2": tactical(
    "Combat · Stormtroopers → Imperial Officer",
    ["Stormtrooper Commander squad", "Imperial Officer / Stormtroopers"],
    "IMPERIALS | JML / LEIA / JMK / oROLO",
    "ROTE-P3-KAS-IMPERIALS",
    [
      JML("rote-p3-kas-c3-jml", "ROTE-P3-KAS-IMPERIALS-JML"),
      LEIA("rote-p3-kas-c3-leia", "ROTE-P3-KAS-IMPERIALS-LEIA"),
      JMK("rote-p3-kas-c3-jmk", "ROTE-P3-KAS-IMPERIALS-JMK"),
      team("rote-p3-kas-c3-rolo", "ROTE-P3-KAS-IMPERIALS-oROLO", ["Rebel Officer Leia Organa", "Han Solo", "Chewbacca", "Threepio & Chewie", "Ahsoka Tano (Fulcrum)"]),
    ],
  ),
  "kashyyyk-wookiee": tactical(
    "Wookiees · Stormtroopers → Ninth Sister",
    ["Stormtrooper Commander squad", "Ninth Sister / Purge Troopers"],
    "WOOKIEES | TARFFUL | → 9TH SISTER",
    "ROTE-P3-KAS-WOOKIEES",
    [team("rote-p3-kas-wookiees", "ROTE-P3-KAS-WOOKIEES-TARFFUL", ["Tarfful", "Threepio & Chewie", "Vandor Chewbacca", "Zaalbar", "Veteran Smuggler Chewbacca"])],
  ),
  "kashyyyk-saw": tactical(
    "Saw · AT-ST Driver → Imperial Squad",
    ["AT-ST Driver / Purge Troopers / Imperial Officer", "Stormtrooper Commander / AT-ST Driver / Purge Trooper"],
    "SAW | REBEL FIGHTERS | AT-ST",
    "ROTE-P3-KAS-SAW",
    [team("rote-p3-kas-saw", "ROTE-P3-KAS-SAW-REBEL-FIGHTERS", ["Saw Gerrera", "Captain Drogan", "Cara Dune", "Cassian Andor", "Baze Malbus"])],
  ),
});

export function roteTacticalP3Override(missionId) {
  return ROTE_TACTICAL_P3_OVERRIDES[String(missionId || "")] || null;
}
