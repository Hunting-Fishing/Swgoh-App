const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";

export const ROTE_TACTICAL_BONUS_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  repository: "https://github.com/genskaar/tb_empire",
  sourceRevision: SOURCE_REVISION,
  lastVerified: "2026-08-19",
  note: "Zeffo and Mandalore encounter labels and squads are community-reference tactical aids. Current unlock, relic and mission-entry rules remain authoritative for legality.",
});

const team = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "community",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze([ROTE_TACTICAL_BONUS_SOURCE.sourceId]),
  lastVerified: ROTE_TACTICAL_BONUS_SOURCE.lastVerified,
});

const tactical = (name, enemies, commandTag, presetPrefix, recommendations = []) => Object.freeze({
  name,
  enemies: Object.freeze(enemies),
  commandTag,
  presetPrefix,
  recommendations: Object.freeze(recommendations),
});

const JMK = (id, name) => team(id, name, ["Jedi Master Kenobi", "Commander Ahsoka Tano", "Padme Amidala", "General Kenobi", "General Skywalker"]);
const LEIA = (id, name) => team(id, name, ["Leia Organa", "Commander Luke Skywalker", "Han Solo", "Admiral Raddus", "Kanan Jarrus"]);
const REY_UFU = (id, name) => team(id, name, ["Rey", "Ahsoka Tano (Fulcrum)", "Cere Junda", "Cal Kestis", "Ben Solo"]);
const BKM = (id, name) => team(id, name, ["Bo-Katan (Mand'alor)", "IG-12 & Grogu", "Paz Vizsla", "The Mandalorian (Beskar Armor)", "Bo-Katan Kryze"]);

export const ROTE_TACTICAL_BONUS_OVERRIDES = Object.freeze({
  // ── Zeffo ──────────────────────────────────────────────────────────────────
  "zeffo-fleet": tactical(
    "Fleet · Malevolence",
    ["Malevolence / Hyena Bomber / Vulture Droid"],
    "ZEFFO FLEET | NEGOTIATOR",
    "ROTE-ZEFFO-FLEET",
    [
      team("rote-zeffo-fleet-marauder", "ROTE-ZEFFO-FLEET-NEGOTIATOR-MARAUDER", ["Negotiator", "Anakin's Eta-2 Starfighter", "BTL-B Y-wing Starfighter", "Marauder", "Umbaran Starfighter", "Ahsoka Tano's Jedi Starfighter", "Plo Koon's Jedi Starfighter", "Rex's ARC-170"]),
      team("rote-zeffo-fleet-standard", "ROTE-ZEFFO-FLEET-NEGOTIATOR", ["Negotiator", "Anakin's Eta-2 Starfighter", "BTL-B Y-wing Starfighter", "Rex's ARC-170", "Umbaran Starfighter", "Ahsoka Tano's Jedi Starfighter", "Plo Koon's Jedi Starfighter", "Clone Sergeant's ARC-170"]),
    ],
  ),
  "zeffo-ufu": tactical(
    "UFU · Purge Troopers → Imperial AT-ST",
    ["Stormtrooper Commando / Purge Troopers / KX Security Droids", "Imperial AT-ST"],
    "UFU | PURGE → AT-ST | REY+UFU",
    "ROTE-ZEFFO-UFU",
    [REY_UFU("rote-zeffo-ufu-rey", "ROTE-ZEFFO-UFU-REY")],
  ),
  "zeffo-clones": tactical(
    "Clone Troopers · Tomb Guardians → Jedi General Chiata",
    ["Miktrull / Eilram Tomb Guardians", "Jedi General Chiata / Padawan Marseph"],
    "CLONES | STUN TOMB GUARDIANS",
    "ROTE-ZEFFO-CLONES",
    [
      team("rote-zeffo-clones-crex", "ROTE-ZEFFO-CLONES-CREX", ["CT-7567 Rex", "ARC Trooper", "CT-21-0408 Echo", "CT-5555 Fives", "Captain Rex"]),
      team("rote-zeffo-clones-bbecho", "ROTE-ZEFFO-CLONES-BB-ECHO", ["CT-7567 Rex", "Captain Rex", "CT-21-0408 Echo", "CT-5555 Fives", "Echo"]),
      team("rote-zeffo-clones-badbatch", "ROTE-ZEFFO-CLONES-BAD-BATCH", ["Hunter", "Echo", "Wrecker", "Tech", "Omega"]),
    ],
  ),
  "zeffo-generic-1": tactical(
    "Combat · Haxion Brood → Tomb Guardians",
    ["Haxion Brood Droid Captain / Bounty Droids / Bounty Hunters", "Miktrull / Eilram Tomb Guardians"],
    "HAXION → TOMB GUARDIANS | LEIA / JMK / REBELS",
    "ROTE-ZEFFO-COMBAT",
    [
      LEIA("rote-zeffo-generic-leia", "ROTE-ZEFFO-COMBAT-LEIA"),
      JMK("rote-zeffo-generic-jmk", "ROTE-ZEFFO-COMBAT-JMK"),
      team("rote-zeffo-generic-rebels", "ROTE-ZEFFO-COMBAT-REBELS", ["Rebel Officer Leia Organa", "Han Solo", "Chewbacca", "Threepio & Chewie", "C-3PO"]),
    ],
  ),
  "zeffo-jkck": tactical(
    "JKCK · Purge Troopers → Second Sister",
    ["Purge Trooper / KX Security Droids / Stormtroopers", "Second Sister / Purge Troopers"],
    "JKCK | PURGE → 2ND SISTER",
    "ROTE-ZEFFO-JKCK",
    [team("rote-zeffo-jkck", "ROTE-ZEFFO-JKCK-GOOD-JEDI", ["Jedi Knight Cal Kestis", "Jedi Master Luke Skywalker", "Jedi Knight Luke Skywalker", "General Skywalker", "Shaak Ti"])],
  ),

  // ── Mandalore ──────────────────────────────────────────────────────────────
  "mandalore-fleet": tactical(
    "Fleet · Negotiator Marauder",
    ["Negotiator / Anakin's Eta-2 / Marauder / Republic Y-wing"],
    "MANDALORE FLEET | CHIMAERA / PROF / MALEV / LEVI",
    "ROTE-MANDO-FLEET",
    [
      team("rote-mando-fleet-chimaera", "ROTE-MANDO-FLEET-CHIMAERA", ["Chimaera", "Scythe", "Gauntlet Starfighter", "TIE Advanced x1", "TIE/IN Interceptor Prototype", "TIE Defender", "Imperial TIE Bomber", "Imperial TIE Fighter"]),
      team("rote-mando-fleet-profundity", "ROTE-MANDO-FLEET-PROFUNDITY", ["Profundity", "Han's Millennium Falcon", "Gauntlet Starfighter", "Rebel Y-wing", "Outrider", "Phantom II", "Cassian's U-wing", "Biggs Darklighter's X-wing"]),
      team("rote-mando-fleet-malevolence", "ROTE-MANDO-FLEET-MALEVOLENCE", ["Malevolence", "Hyena Bomber", "Gauntlet Starfighter", "Vulture Droid", "Sun Fac's Geonosian Starfighter", "Geonosian Spy's Starfighter", "Geonosian Soldier's Starfighter"]),
      team("rote-mando-fleet-leviathan", "ROTE-MANDO-FLEET-LEVIATHAN", ["Leviathan", "B-28 Extinction-class Bomber", "Gauntlet Starfighter", "TIE Dagger", "Fury-class Interceptor", "Mark VI Interceptor", "Sith Fighter", "Scimitar"]),
    ],
  ),
  "mandalore-generic-1": tactical(
    "Combat · Veers → Moff Gideon",
    ["General Veers / Death Trooper / Stormtroopers / Scout Trooper", "Moff Gideon / Dark Trooper / Death Trooper / Scout Trooper / Stormtrooper"],
    "VEERS → GIDEON | JMK / LEIA / NS / BKM",
    "ROTE-MANDO-COMBAT",
    [
      JMK("rote-mando-generic-jmk", "ROTE-MANDO-COMBAT-JMK"),
      LEIA("rote-mando-generic-leia", "ROTE-MANDO-COMBAT-LEIA"),
      team("rote-mando-generic-ns", "ROTE-MANDO-COMBAT-NIGHTSISTERS", ["Mother Talzin", "Old Daka", "Merrin", "Asajj Ventress", "Nightsister Zombie"]),
      BKM("rote-mando-generic-bkm", "ROTE-MANDO-COMBAT-BKM"),
    ],
  ),
  "mandalore-bkm": tactical(
    "Bo-Katan Mand'alor · Veers → DTMG",
    ["General Veers / Death Trooper / Stormtroopers / Scout Trooper", "Dark Trooper Moff Gideon / Moff Gideon / Death Trooper / Scout Trooper / Stormtrooper"],
    "BKM R9 | VEERS → DTMG",
    "ROTE-MANDO-BKM",
    [BKM("rote-mando-bkm", "ROTE-MANDO-BKM-R9")],
  ),
  "mandalore-dtmg": tactical(
    "DTMG · Maul → Bo-Katan Mand'alor",
    ["Maul / Canderous Ordo / Jango Fett / Imperial Super Commando / Gar Saxon", "Bo-Katan (Mand'alor) / Armorer / Beskar Mando / Paz Vizsla / IG-12 & Grogu"],
    "DTMG | MAUL → BKM",
    "ROTE-MANDO-DTMG",
    [team("rote-mando-dtmg", "ROTE-MANDO-DTMG-LV", ["Dark Trooper Moff Gideon", "Lord Vader", "Royal Guard", "Admiral Piett", "Scout Trooper"])],
  ),
});

export function roteTacticalBonusOverride(missionId) {
  return ROTE_TACTICAL_BONUS_OVERRIDES[String(missionId || "")] || null;
}
