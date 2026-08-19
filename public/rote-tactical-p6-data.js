const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";

export const ROTE_TACTICAL_P6_SOURCE = Object.freeze({
  sourceId: "genskaar-rote",
  repository: "https://github.com/genskaar/tb_empire",
  sourceRevision: SOURCE_REVISION,
  lastVerified: "2026-08-19",
  note: "Encounter labels are pinned to the cited community map. Complete squads are only marked community-reference where the source supplies them; incomplete source squads remain planning/TBD rather than being fabricated.",
});

const team = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "community",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze([ROTE_TACTICAL_P6_SOURCE.sourceId]),
  lastVerified: ROTE_TACTICAL_P6_SOURCE.lastVerified,
});

const planning = (id, name, members) => Object.freeze({
  id,
  name,
  confidence: "unknown",
  verifiedLegal: false,
  members: Object.freeze(members.map((member) => Object.freeze(typeof member === "string" ? { name: member } : member))),
  sourceIds: Object.freeze(["planning-template"]),
  lastVerified: ROTE_TACTICAL_P6_SOURCE.lastVerified,
});

const tactical = (name, enemies, commandTag, presetPrefix, recommendations = []) => Object.freeze({
  name,
  enemies: Object.freeze(enemies),
  commandTag,
  presetPrefix,
  recommendations: Object.freeze(recommendations),
});

const PROFUNDITY = (id, name) => team(id, name, ["Profundity", "Han's Millennium Falcon", "Rebel Y-wing", "Outrider", "Ghost", "Biggs Darklighter's X-wing", "Phantom II", "Cassian's U-wing"]);
const JABBA = (id, name) => team(id, name, ["Jabba the Hutt", "Krrsantan", "Skiff Guard (Lando Calrissian)", "Boushh (Leia Organa)", "Boba Fett"]);

export const ROTE_TACTICAL_P6_OVERRIDES = Object.freeze({
  // ── Death Star ─────────────────────────────────────────────────────────────
  "death-star-fleet": tactical(
    "Fleet · Home One Rebels",
    ["Home One / Rebel X-wings / Phantom II / Han's Millennium Falcon"],
    "FLEET | EMPIRE + SCYTHE",
    "ROTE-P6-DS-FLEET",
    [team("rote-p6-ds-fleet-empire", "ROTE-P6-DS-FLEET-EMPIRE", ["Executrix", "Imperial TIE Fighter", "Scythe", "TIE Advanced x1", "Imperial TIE Bomber", "TIE Defender", "TIE/IN Interceptor Prototype", "Gauntlet Starfighter"])],
  ),
  "death-star-vader": tactical(
    "Darth Vader · Rebel Officer / Old Ben",
    ["Rebel Officer / Rebel Soldier / Old Ben combination — source wave breakdown incomplete"],
    "VADER | REBELS | SOLO SOURCE",
    "ROTE-P6-DS-VADER",
    [team("rote-p6-ds-vader-solo", "ROTE-P6-DS-VADER-SOLO", ["Darth Vader"])],
  ),
  "death-star-generic-1": tactical(
    "Combat · Rebel Forces",
    ["Rebel Officer / Rebel Soldiers / Rebel Pilots"],
    "REBELS | SOURCE TEAM TBD",
    "ROTE-P6-DS-REBELS-A",
    [],
  ),
  "death-star-generic-2": tactical(
    "Combat · Rebel Forces",
    ["Rebel Officer / Rebel Soldiers / Rebel Pilots"],
    "REBELS | SOURCE TEAM TBD",
    "ROTE-P6-DS-REBELS-B",
    [],
  ),
  "death-star-iden": tactical(
    "Iden Versio · Rebel Heroes",
    ["Luke / R2-D2 / C-3PO / Stormtrooper Han / Leia / Chewbacca combination — source wave breakdown incomplete"],
    "IDEN | REBEL HEROES",
    "ROTE-P6-DS-IDEN",
    [team("rote-p6-ds-iden", "ROTE-P6-DS-IDEN-TROOPERS", ["Iden Versio", "Shoretrooper", "Stormtrooper", "Death Trooper", "Range Trooper"])],
  ),

  // ── Hoth ───────────────────────────────────────────────────────────────────
  "hoth-fleet": tactical(
    "Fleet · Mon Calamari Cruiser",
    ["Mon Calamari Cruiser / X-wing / Red Two / Red Three"],
    "FLEET | EXECUTOR",
    "ROTE-P6-HOT-FLEET",
    [team("rote-p6-hot-fleet-executor", "ROTE-P6-HOT-FLEET-EXECUTOR", ["Executor", "Hound's Tooth", "Razor Crest", "Xanadu Blood", "Slave I", "IG-2000", "Ebon Hawk"])],
  ),
  "hoth-generic-1": tactical(
    "Combat · Wampas",
    ["3x Wampa", "3x Wampa"],
    "WAMPAS | LV / CLS",
    "ROTE-P6-HOT-WAMPAS",
    [team("rote-p6-hot-wampas-lv", "ROTE-P6-HOT-WAMPAS-LV", ["Lord Vader", "Dark Trooper Moff Gideon", "Royal Guard", "Admiral Piett", "Maul"]), team("rote-p6-hot-wampas-cls", "ROTE-P6-HOT-WAMPAS-CLS", ["Commander Luke Skywalker", "Han Solo", "Chewbacca", "Threepio & Chewie", "C-3PO"])],
  ),
  "hoth-generic-2": tactical(
    "Combat · Cartel",
    ["Mob Enforcer / Cartel Spies / Bruisers / Saboteurs"],
    "CARTEL | SEE / REVA INQS",
    "ROTE-P6-HOT-CARTEL",
    [team("rote-p6-hot-cartel-see", "ROTE-P6-HOT-CARTEL-SEE", ["Sith Eternal Emperor", "Darth Malak", "Darth Revan", "Darth Malgus", "Wat Tambor"]), team("rote-p6-hot-cartel-inqs", "ROTE-P6-HOT-CARTEL-REVA-INQS", ["Third Sister", "Grand Inquisitor", "Seventh Sister", "Ninth Sister", "Fifth Brother"])],
  ),
  "hoth-aphra": tactical(
    "Doctor Aphra · Hoth Rebels → Sana",
    ["Hoth Rebel Commander / Soldiers / Scout", "Sana Starros / Chewbacca / ROLO / Hoth Rebel Soldier / C-3PO / Captain Han"],
    "APHRA | HOTH REBELS → SANA",
    "ROTE-P6-HOT-APHRA",
    [team("rote-p6-hot-aphra", "ROTE-P6-HOT-APHRA-DROIDS", ["Doctor Aphra", "BT-1", "0-0-0", "IG-88", "HK-47"])],
  ),
  "hoth-jabba": tactical(
    "Jabba · Cartel → Dash Rendar",
    ["Mob Enforcer / Cartel Spies / Bruisers / Saboteurs", "Dash Rendar / Cartel squad"],
    "JABBA | CARTEL → DASH",
    "ROTE-P6-HOT-JABBA",
    [JABBA("rote-p6-hot-jabba", "ROTE-P6-HOT-JABBA")],
  ),

  // ── Scarif ─────────────────────────────────────────────────────────────────
  "scarif-fleet": tactical(
    "Fleet · Chimaera Imperials",
    ["Chimaera / Imperial TIE Fighter / TIE Advanced x1 / TIE Bomber"],
    "FLEET | PROFUNDITY",
    "ROTE-P6-SCA-FLEET",
    [PROFUNDITY("rote-p6-sca-fleet-profundity", "ROTE-P6-SCA-FLEET-PROFUNDITY")],
  ),
  "scarif-cassian": tactical(
    "Cassian + Pao + K-2SO · Imperial Forces",
    ["Stormtroopers / AT-ST Drivers / Death Troopers / Imperial Officers / Shoretroopers / Krennic / Scouts — source wave combination incomplete"],
    "CASSIAN+PAO+K2 | IMPERIALS | ROGUE ONE PLAN",
    "ROTE-P6-SCA-CASSIAN",
    [planning("rote-p6-sca-cassian-plan", "ROTE-P6-SCA-CASSIAN-ROGUE-ONE-PLAN", ["Admiral Raddus", "Cassian Andor", "Pao", "K-2SO", "Jyn Erso"])],
  ),
  "scarif-generic-1": tactical(
    "Combat · Imperial Forces",
    ["Stormtroopers / AT-ST Drivers / Death Troopers / Imperial Officers / Shoretroopers / Krennic / Scouts — source wave combination incomplete"],
    "IMPERIALS | SOURCE TEAM TBD",
    "ROTE-P6-SCA-IMPERIALS-A",
    [],
  ),
  "scarif-generic-2": tactical(
    "Combat · Imperial Forces",
    ["Stormtroopers / AT-ST Drivers / Death Troopers / Imperial Officers / Shoretroopers / Krennic / Scouts — source wave combination incomplete"],
    "IMPERIALS | SOURCE TEAM TBD",
    "ROTE-P6-SCA-IMPERIALS-B",
    [],
  ),
  "scarif-baze": tactical(
    "Baze + Chirrut + SRP · Imperial Forces",
    ["Stormtroopers / AT-ST Drivers / Death Troopers / Imperial Officers / Shoretroopers / Krennic / Scouts — source wave combination incomplete"],
    "BAZE+CHIRRUT+SRP | IMPERIALS | RADDUS PLAN",
    "ROTE-P6-SCA-BAZE",
    [planning("rote-p6-sca-baze-plan", "ROTE-P6-SCA-BAZE-RADDUS-PLAN", ["Baze Malbus", "Chirrut Îmwe", "Scarif Rebel Pathfinder", "Admiral Raddus", "Jyn Erso"])],
  ),
});

export function roteTacticalP6Override(missionId) {
  return ROTE_TACTICAL_P6_OVERRIDES[String(missionId || "")] || null;
}
