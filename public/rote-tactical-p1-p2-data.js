const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";

export const ROTE_TACTICAL_P1_P2_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  repository: "https://github.com/genskaar/tb_empire",
  sourceRevision: SOURCE_REVISION,
  lastVerified: "2026-08-19",
  note: "Encounter labels and suggested squads are community-reference tactical aids. Current SWGOH App mission entry rules remain the authoritative legality layer.",
});

const team = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "community",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze([ROTE_TACTICAL_P1_P2_SOURCE.sourceId]),
  lastVerified: ROTE_TACTICAL_P1_P2_SOURCE.lastVerified,
});

const tactical = (name, enemies, commandTag, presetPrefix, recommendations = [], extra = {}) => Object.freeze({
  name,
  enemies: Object.freeze(enemies),
  commandTag,
  presetPrefix,
  recommendations: Object.freeze(recommendations),
  ...extra,
});

const SLKR = (id, name) => team(id, name, [
  "Supreme Leader Kylo Ren",
  "First Order Officer",
  "Kylo Ren (Unmasked)",
  "General Hux",
  "Sith Trooper",
]);

const LV = (id, name) => team(id, name, [
  "Lord Vader",
  "Maul",
  "Royal Guard",
  "Admiral Piett",
  "Darth Vader",
]);

const SEE_WAT = (id, name) => team(id, name, [
  "Sith Eternal Emperor",
  "Wat Tambor",
  "Darth Nihilus",
  "Darth Sion",
  "Darth Traya",
]);

const PALP_EMPIRE = (id, name) => team(id, name, [
  "Emperor Palpatine",
  "Darth Vader",
  "Mara Jade, The Emperor's Hand",
  "Grand Admiral Thrawn",
  "Admiral Piett",
]);

const INQS = (id, name) => team(id, name, [
  "Grand Inquisitor",
  "Seventh Sister",
  "Ninth Sister",
  "Fifth Brother",
  "Eighth Brother",
]);

const JABBA = (id, name) => team(id, name, [
  "Jabba the Hutt",
  "Krrsantan",
  "Skiff Guard (Lando Calrissian)",
  "Boushh (Leia Organa)",
  "Boba Fett",
]);

const JML_JEDI = (id, name) => team(id, name, [
  "Jedi Master Luke Skywalker",
  "Jedi Knight Luke Skywalker",
  "Hermit Yoda",
  "Jolee Bindo",
  "Jedi Knight Revan",
]);

const JMK = (id, name, fifth = "General Skywalker") => team(id, name, [
  "Jedi Master Kenobi",
  "Commander Ahsoka Tano",
  "Padme Amidala",
  "General Kenobi",
  fifth,
]);

const REY = (id, name) => team(id, name, [
  "Rey",
  "Resistance Hero Finn",
  "Resistance Hero Poe",
  "R2-D2",
  "Amilyn Holdo",
]);

const LEIA = (id, name) => team(id, name, [
  "Leia Organa",
  "Captain Drogan",
  "R2-D2",
  "Captain Rex",
  "Obi-Wan Kenobi (Old Ben)",
]);

const CLS = (id, name) => team(id, name, [
  "Commander Luke Skywalker",
  "Han Solo",
  "Chewbacca",
  "Threepio & Chewie",
  "C-3PO",
]);

const MM_KYLE = (id, name) => team(id, name, [
  "Mon Mothma",
  "Pao",
  "Hoth Rebel Scout",
  "Cara Dune",
  "Kyle Katarn",
]);

const GUNGANS = (id, name) => team(id, name, [
  "Boss Nass",
  "Jar Jar Binks",
  "Captain Tarpals",
  "Gungan Phalanx",
  "Gungan Boomadier",
]);

const EXECUTOR = (id, name) => team(id, name, [
  "Executor",
  "Hound's Tooth",
  "Razor Crest",
  "Xanadu Blood",
  "Slave I",
  "IG-2000",
]);

const PROFUNDITY = (id, name) => team(id, name, [
  "Profundity",
  "Han's Millennium Falcon",
  "Rebel Y-wing",
  "Outrider",
  "Biggs Darklighter's X-wing",
  "Phantom II",
  "Cassian's U-wing",
  "Ghost",
]);

export const ROTE_TACTICAL_P1_P2_OVERRIDES = Object.freeze({
  // ── P1 · Mustafar ──────────────────────────────────────────────────────────
  "mustafar-generic-1": tactical(
    "Combat · Droids → Wat Tambor",
    ["Command Battle Droid / Separatist droids", "Wat Tambor / Separatist droids"],
    "DROIDS → WAT | SEE+WAT / EP / TRENCH",
    "ROTE-P1-MUS-DROIDS-WAT",
    [
      SEE_WAT("rote-p1-mus-c1-see-wat", "ROTE-P1-MUS-DROIDS-WAT-SEE-WAT"),
      PALP_EMPIRE("rote-p1-mus-c1-ep", "ROTE-P1-MUS-DROIDS-WAT-EP"),
      team("rote-p1-mus-c1-trench", "ROTE-P1-MUS-DROIDS-WAT-TRENCH", ["Admiral Trench", "Nute Gunray", "Geonosian Brood Alpha", "Count Dooku", "Wat Tambor"]),
    ],
  ),
  "mustafar-lv": tactical(
    "Lord Vader · Wat/Nute → JMK",
    ["Wat Tambor / Nute Gunray / Poggle the Lesser", "Jedi Master Kenobi"],
    "LV | WAT/NUTE → JMK | SOLO SOURCE",
    "ROTE-P1-MUS-LV",
    [team("rote-p1-mus-lv-solo", "ROTE-P1-MUS-LV-SOLO", ["Lord Vader"])],
  ),
  "mustafar-generic-2": tactical(
    "Combat · Droids → Nute Gunray",
    ["Command Battle Droid / Separatist droids", "Nute Gunray / Separatist droids"],
    "DROIDS → NUTE | SEE+WAT / EP / INQS",
    "ROTE-P1-MUS-DROIDS-NUTE",
    [
      SEE_WAT("rote-p1-mus-c3-see-wat", "ROTE-P1-MUS-DROIDS-NUTE-SEE-WAT"),
      PALP_EMPIRE("rote-p1-mus-c3-ep", "ROTE-P1-MUS-DROIDS-NUTE-EP"),
      INQS("rote-p1-mus-c3-inqs", "ROTE-P1-MUS-DROIDS-NUTE-INQS"),
    ],
  ),
  "mustafar-generic-3": tactical(
    "Combat · Droids → Geonosians",
    ["Command Battle Droid / Separatist droids", "Geonosian Brood Alpha squad"],
    "DROIDS → GEOS | SLKR / EP",
    "ROTE-P1-MUS-DROIDS-GEOS",
    [
      SLKR("rote-p1-mus-c5-slkr", "ROTE-P1-MUS-DROIDS-GEOS-SLKR"),
      PALP_EMPIRE("rote-p1-mus-c5-ep", "ROTE-P1-MUS-DROIDS-GEOS-EP"),
    ],
  ),
  "mustafar-fleet": tactical(
    "Fleet · Malevolence",
    ["Malevolence / Hyena Bomber / Vulture Droid / Geonosian Starfighter"],
    "FLEET | EMPIRE + SCYTHE",
    "ROTE-P1-MUS-FLEET",
    [
      team("rote-p1-mus-fleet-mk6", "ROTE-P1-MUS-FLEET-EMPIRE-MK6", ["Executrix", "Mark VI Interceptor", "Scythe", "TIE Advanced x1", "TIE Defender", "TIE/IN Interceptor Prototype", "Gauntlet Starfighter", "Emperor's Shuttle"]),
      team("rote-p1-mus-fleet-sith", "ROTE-P1-MUS-FLEET-EMPIRE-SITH", ["Executrix", "Sith Fighter", "Scythe", "TIE Advanced x1", "TIE Defender", "TIE/IN Interceptor Prototype", "Gauntlet Starfighter", "Emperor's Shuttle"]),
    ],
  ),

  // ── P1 · Corellia ──────────────────────────────────────────────────────────
  "corellia-jabba": tactical(
    "Jabba · Cartel → Qi'ra",
    ["Mob Enforcer / Cartel squad", "Qi'ra / Young Han / Cartel squad"],
    "JABBA | CARTEL → QI'RA",
    "ROTE-P1-COR-JABBA",
    [JABBA("rote-p1-cor-jabba", "ROTE-P1-COR-JABBA")],
  ),
  "corellia-aphra": tactical(
    "Doctor Aphra · Imperial Forces",
    ["Stormtrooper Commander squad", "Imperial Officer squad"],
    "APHRA | IMPERIALS",
    "ROTE-P1-COR-APHRA",
    [team("rote-p1-cor-aphra", "ROTE-P1-COR-APHRA", ["Doctor Aphra", "BT-1", "0-0-0", "IG-88", "Darth Vader"])],
  ),
  "corellia-generic-1": tactical(
    "Combat · Imperial Forces",
    ["Stormtrooper Commander squad", "Imperial Officer squad"],
    "IMPERIALS | CLS / oFINN / BKM / GUNGANS",
    "ROTE-P1-COR-IMPERIALS",
    [
      CLS("rote-p1-cor-generic-cls", "ROTE-P1-COR-IMPERIALS-CLS"),
      team("rote-p1-cor-generic-ofinn", "ROTE-P1-COR-IMPERIALS-oFINN", ["Finn", "Rey (Scavenger)", "Resistance Hero Finn", "Resistance Hero Poe", "Rey (Jedi Training)"]),
      team("rote-p1-cor-generic-bkm", "ROTE-P1-COR-IMPERIALS-BKM", ["Bo-Katan (Mand'alor)", "IG-12 & Grogu", "Paz Vizsla", "The Mandalorian (Beskar Armor)", "Bo-Katan Kryze"]),
      GUNGANS("rote-p1-cor-generic-gungans", "ROTE-P1-COR-IMPERIALS-GUNGANS"),
    ],
  ),
  "corellia-qira": tactical(
    "Qi'ra + Young Han · Imperial Forces",
    ["Stormtrooper Commander squad", "General Veers / Imperial squad"],
    "QIRA+YHAN | IMPERIALS | LEIA / SCOUNDRELS",
    "ROTE-P1-COR-QIRA-YHAN",
    [
      team("rote-p1-cor-qira-leia", "ROTE-P1-COR-QIRA-YHAN-LEIA", ["Qi'ra", "Leia Organa", "Captain Drogan", "R2-D2", "Young Han Solo"]),
      team("rote-p1-cor-qira-scoundrels", "ROTE-P1-COR-QIRA-YHAN-SCOUNDRELS", ["Qi'ra", "Dash Rendar", "IG-11", "Kuiil", "Young Han Solo"]),
    ],
  ),
  "corellia-fleet": tactical(
    "Fleet · Lando's Falcon",
    ["Corellia fleet encounter"],
    "FLEET | EXECUTOR",
    "ROTE-P1-COR-FLEET",
    [EXECUTOR("rote-p1-cor-fleet-executor", "ROTE-P1-COR-FLEET-EXECUTOR")],
  ),

  // ── P1 · Coruscant ─────────────────────────────────────────────────────────
  "coruscant-mace-kit": tactical(
    "Mace + Kit · Clone Guard",
    ["Clone Commander / Royal Guard", "Darth Sidious / Jedi Knight Anakin / Royal Guard"],
    "MACE+KIT | GR JEDI",
    "ROTE-P1-CUS-MACE-KIT",
    [team("rote-p1-cus-mace-kit-grj", "ROTE-P1-CUS-MACE-KIT-GR-JEDI", ["Mace Windu", "Jedi Master Kenobi", "Ahsoka Tano", "Ki-Adi-Mundi", "Kit Fisto"])],
  ),
  "coruscant-jedi": tactical(
    "Jedi · Clones → Lord Vader",
    ["Clone Commander squad", "Lord Vader / Clone squad"],
    "JEDI | CLONES → LV | JML",
    "ROTE-P1-CUS-JEDI",
    [JML_JEDI("rote-p1-cus-jedi-jml", "ROTE-P1-CUS-JEDI-JML")],
  ),
  "coruscant-generic-1": tactical(
    "Combat · Clone Forces",
    ["Clone Commander squad", "Clone Commander / Clone Medic squad"],
    "CLONES | LEIA / MM+KK / PADME / JMK",
    "ROTE-P1-CUS-CLONES-A",
    [
      LEIA("rote-p1-cus-c3-leia", "ROTE-P1-CUS-CLONES-A-LEIA"),
      MM_KYLE("rote-p1-cus-c3-mm", "ROTE-P1-CUS-CLONES-A-MM-KYLE"),
      team("rote-p1-cus-c3-padme", "ROTE-P1-CUS-CLONES-A-PADME", ["Padme Amidala", "Commander Ahsoka Tano", "General Kenobi", "General Skywalker", "Jedi Knight Anakin"]),
      JMK("rote-p1-cus-c3-jmk", "ROTE-P1-CUS-CLONES-A-JMK"),
    ],
  ),
  "coruscant-generic-2": tactical(
    "Combat · Clone Forces",
    ["Clone Commander squad", "Clone Commander / Clone Medic squad"],
    "CLONES | LEIA / MM+KK / PADME / JMK",
    "ROTE-P1-CUS-CLONES-B",
    [
      LEIA("rote-p1-cus-c5-leia", "ROTE-P1-CUS-CLONES-B-LEIA"),
      MM_KYLE("rote-p1-cus-c5-mm", "ROTE-P1-CUS-CLONES-B-MM-KYLE"),
      team("rote-p1-cus-c5-padme", "ROTE-P1-CUS-CLONES-B-PADME", ["Padme Amidala", "Commander Ahsoka Tano", "General Kenobi", "General Skywalker", "Jedi Knight Anakin"]),
      JMK("rote-p1-cus-c5-jmk", "ROTE-P1-CUS-CLONES-B-JMK"),
    ],
  ),
  "coruscant-fleet": tactical(
    "Fleet · Endurance",
    ["Endurance / BTL-B Y-wing / Clone ARC-170 fleet"],
    "FLEET | PROFUNDITY / HOME ONE",
    "ROTE-P1-CUS-FLEET",
    [
      PROFUNDITY("rote-p1-cus-fleet-profundity", "ROTE-P1-CUS-FLEET-PROFUNDITY"),
      team("rote-p1-cus-fleet-homeone", "ROTE-P1-CUS-FLEET-HOME-ONE", ["Home One", "Han's Millennium Falcon", "Rebel Y-wing", "Outrider", "Biggs Darklighter's X-wing", "Phantom II", "Cassian's U-wing", "Ghost"]),
    ],
  ),

  // ── P2 · Geonosis ──────────────────────────────────────────────────────────
  "geonosis-generic-1": tactical(
    "Combat · Nexu",
    ["Nexu"],
    "NEXU | SLKR / LV",
    "ROTE-P2-GEO-NEXU",
    [SLKR("rote-p2-geo-nexu-slkr", "ROTE-P2-GEO-NEXU-SLKR"), LV("rote-p2-geo-nexu-lv", "ROTE-P2-GEO-NEXU-LV")],
  ),
  "geonosis-generic-2": tactical(
    "Combat · Acklay",
    ["Acklay"],
    "ACKLAY | SLKR / LV / BH+WAT / INQS",
    "ROTE-P2-GEO-ACKLAY",
    [
      SLKR("rote-p2-geo-acklay-slkr", "ROTE-P2-GEO-ACKLAY-SLKR"),
      LV("rote-p2-geo-acklay-lv", "ROTE-P2-GEO-ACKLAY-LV"),
      team("rote-p2-geo-acklay-bh-wat", "ROTE-P2-GEO-ACKLAY-BH-WAT", ["Bossk", "Boba Fett", "Jango Fett", "Boba Fett, Scion of Jango", "Wat Tambor"]),
      INQS("rote-p2-geo-acklay-inqs", "ROTE-P2-GEO-ACKLAY-INQS"),
    ],
  ),
  "geonosis-generic-3": tactical(
    "Combat · Reek",
    ["Reek"],
    "REEK | SEE+WAT / INQS / LV / SLKR / TRENCH",
    "ROTE-P2-GEO-REEK",
    [
      SEE_WAT("rote-p2-geo-reek-see-wat", "ROTE-P2-GEO-REEK-SEE-WAT"),
      INQS("rote-p2-geo-reek-inqs", "ROTE-P2-GEO-REEK-INQS"),
      LV("rote-p2-geo-reek-lv", "ROTE-P2-GEO-REEK-LV"),
      SLKR("rote-p2-geo-reek-slkr", "ROTE-P2-GEO-REEK-SLKR"),
      team("rote-p2-geo-reek-trench", "ROTE-P2-GEO-REEK-TRENCH", ["Admiral Trench", "Nute Gunray", "Jango Fett", "Count Dooku", "Wat Tambor"]),
    ],
  ),
  "geonosis-geos": tactical(
    "Geonosians · Partisans → Phoenix",
    ["Partisan Fighters", "Kanan Jarrus / Ezra Bridger / Chopper / Captain Rex"],
    "GEOS | GBA LEAD",
    "ROTE-P2-GEO-GEOS",
    [team("rote-p2-geo-geos", "ROTE-P2-GEO-GEOS", ["Geonosian Brood Alpha", "Geonosian Soldier", "Geonosian Spy", "Poggle the Lesser", "Sun Fac"])],
  ),
  "geonosis-fleet": tactical(
    "Fleet · Malevolence Geonosians",
    ["Malevolence / Geonosian fleet"],
    "FLEET | LEVIATHAN",
    "ROTE-P2-GEO-FLEET",
    [team("rote-p2-geo-fleet-leviathan", "ROTE-P2-GEO-FLEET-LEVIATHAN", ["Leviathan", "Sith Fighter", "Fury-class Interceptor", "B-28 Extinction-class Bomber", "Mark VI Interceptor", "TIE Dagger", "Scimitar"])],
  ),

  // ── P2 · Felucia ───────────────────────────────────────────────────────────
  "felucia-jabba": tactical(
    "Jabba · Imperial Forces",
    ["Imperial Officer squad", "Imperial Officer / Scout Trooper squad"],
    "JABBA | IMPERIALS",
    "ROTE-P2-FEL-JABBA",
    [JABBA("rote-p2-fel-jabba", "ROTE-P2-FEL-JABBA")],
  ),
  "felucia-lando": tactical(
    "Young Lando · Imperials → Iden",
    ["Imperial Officer squad", "Iden Versio / Imperial squad"],
    "YOUNG LANDO | SLKR / JMK / SEE",
    "ROTE-P2-FEL-LANDO",
    [
      team("rote-p2-fel-lando-slkr", "ROTE-P2-FEL-LANDO-SLKR", ["Supreme Leader Kylo Ren", "Kylo Ren (Unmasked)", "Sith Trooper", "General Hux", "Young Lando Calrissian"]),
      team("rote-p2-fel-lando-jmk", "ROTE-P2-FEL-LANDO-JMK", ["Jedi Master Kenobi", "Commander Ahsoka Tano", "General Kenobi", "Wat Tambor", "Young Lando Calrissian"]),
      team("rote-p2-fel-lando-see", "ROTE-P2-FEL-LANDO-SEE", ["Sith Eternal Emperor", "Darth Malak", "Darth Malgus", "Darth Nihilus", "Young Lando Calrissian"]),
    ],
  ),
  "felucia-generic-1": tactical(
    "Combat · Pirates → Hondo",
    ["Pirate Leader squad", "Hondo Ohnaka / Pirate squad"],
    "PIRATES → HONDO | REY+501ST / INQS / REBELS",
    "ROTE-P2-FEL-PIRATES-HONDO",
    [
      team("rote-p2-fel-generic-rey501", "ROTE-P2-FEL-PIRATES-HONDO-REY501", ["Rey", "CT-21-0408 Echo", "CT-7567 Rex", "ARC Trooper", "CT-5555 Fives"]),
      INQS("rote-p2-fel-generic-inqs", "ROTE-P2-FEL-PIRATES-HONDO-INQS"),
      CLS("rote-p2-fel-generic-rebels", "ROTE-P2-FEL-PIRATES-HONDO-REBELS"),
    ],
  ),
  "felucia-hondo": tactical(
    "Hondo · Imperials → Tarkin",
    ["Imperial Officer squad", "Grand Moff Tarkin / Imperial squad"],
    "HONDO | REY+UFU / BH / LV",
    "ROTE-P2-FEL-HONDO",
    [
      team("rote-p2-fel-hondo-rey", "ROTE-P2-FEL-HONDO-REY-UFU", ["Rey", "Hondo Ohnaka", "Ben Solo", "Rey (Jedi Training)", "Cal Kestis"]),
      team("rote-p2-fel-hondo-bh", "ROTE-P2-FEL-HONDO-BH", ["Bossk", "Hondo Ohnaka", "Jango Fett", "The Mandalorian", "Greef Karga"]),
      team("rote-p2-fel-hondo-lv", "ROTE-P2-FEL-HONDO-LV", ["Lord Vader", "Admiral Piett", "Grand Admiral Thrawn", "Royal Guard", "Hondo Ohnaka"]),
    ],
    { missionType: "combat" },
  ),
  "felucia-fleet": tactical(
    "Fleet · Chimaera",
    ["Chimaera / Imperial fleet"],
    "FLEET | EXECUTOR / MALEVOLENCE",
    "ROTE-P2-FEL-FLEET",
    [
      EXECUTOR("rote-p2-fel-fleet-executor", "ROTE-P2-FEL-FLEET-EXECUTOR"),
      team("rote-p2-fel-fleet-malevolence", "ROTE-P2-FEL-FLEET-MALEVOLENCE", ["Malevolence", "Hyena Bomber", "Vulture Droid", "Sun Fac's Geonosian Starfighter", "Geonosian Spy's Starfighter", "Geonosian Soldier's Starfighter"]),
    ],
  ),

  // ── P2 · Bracca ────────────────────────────────────────────────────────────
  "bracca-generic-1": tactical(
    "Combat · Purge Troopers → Second Sister",
    ["Stormtrooper Commando / Purge Troopers", "Second Sister / Purge Troopers"],
    "PURGE → 2ND SISTER | JMK / oROLO / LEIA / MM+KK",
    "ROTE-P2-BRA-PURGE-SECOND",
    [
      JMK("rote-p2-bra-c1-jmk", "ROTE-P2-BRA-PURGE-SECOND-JMK"),
      team("rote-p2-bra-c1-rolo", "ROTE-P2-BRA-PURGE-SECOND-oROLO", ["Rebel Officer Leia Organa", "Han Solo", "Chewbacca", "Threepio & Chewie", "Ahsoka Tano (Fulcrum)"]),
      LEIA("rote-p2-bra-c1-leia", "ROTE-P2-BRA-PURGE-SECOND-LEIA"),
      MM_KYLE("rote-p2-bra-c1-mm", "ROTE-P2-BRA-PURGE-SECOND-MM-KYLE"),
    ],
  ),
  "bracca-jedi": tactical(
    "Jedi · Purge Troopers → Ninth Sister",
    ["Stormtrooper Commando / Purge Troopers", "Ninth Sister / Purge Troopers"],
    "JEDI | PURGE → 9TH SISTER | JML",
    "ROTE-P2-BRA-JEDI",
    [JML_JEDI("rote-p2-bra-jedi-jml", "ROTE-P2-BRA-JEDI-JML")],
  ),
  "bracca-generic-2": tactical(
    "Combat · Purge Troopers → Crosshair",
    ["Stormtrooper Commando / Purge Troopers", "Crosshair / Purge Troopers"],
    "PURGE → CROSSHAIR | JMK / oROLO / LEIA / MM+KK",
    "ROTE-P2-BRA-PURGE-CROSSHAIR",
    [
      JMK("rote-p2-bra-c3-jmk", "ROTE-P2-BRA-PURGE-CROSSHAIR-JMK"),
      team("rote-p2-bra-c3-rolo", "ROTE-P2-BRA-PURGE-CROSSHAIR-oROLO", ["Rebel Officer Leia Organa", "Han Solo", "Chewbacca", "Threepio & Chewie", "Ahsoka Tano (Fulcrum)"]),
      LEIA("rote-p2-bra-c3-leia", "ROTE-P2-BRA-PURGE-CROSSHAIR-LEIA"),
      MM_KYLE("rote-p2-bra-c3-mm", "ROTE-P2-BRA-PURGE-CROSSHAIR-MM-KYLE"),
    ],
  ),
  "bracca-zeffo-unlock": tactical(
    "Unlock Zeffo · Cere + Cal vs Second Sister",
    ["Purge Troopers", "Second Sister / Purge Troopers"],
    "ZEFFO UNLOCK | CERE + CAL",
    "ROTE-P2-BRA-ZEFFO",
    [team("rote-p2-bra-zeffo-cere-cal", "ROTE-P2-BRA-ZEFFO-CERE-CAL", ["Cere Junda", "Jedi Knight Cal Kestis"])],
  ),
  "bracca-fleet": tactical(
    "Fleet · Chimaera + Scythe",
    ["Chimaera / TIE Advanced x1 / Scythe / Imperial fleet"],
    "FLEET | PROFUNDITY",
    "ROTE-P2-BRA-FLEET",
    [PROFUNDITY("rote-p2-bra-fleet-profundity", "ROTE-P2-BRA-FLEET-PROFUNDITY")],
  ),
});

export function roteTacticalP1P2Override(missionId) {
  return ROTE_TACTICAL_P1_P2_OVERRIDES[String(missionId || "")] || null;
}
