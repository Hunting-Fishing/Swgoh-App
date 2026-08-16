const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_P6_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentOperations: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Operations",
  currentRewards: "https://swgoh.gg/territory-battles/t05D/rewards/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Death Star, Hoth and Scarif use source-pinned planet art and node coordinates. Current Zone 6 evidence requires R9 for character missions and 7-star ships for fleets. Hoth Doctor Aphra is treated as a current Special Mission even though the pinned GenSkaar revision labels that node as usual combat.",
});

const node = (id, type, top, left, label, requirement, reward, internal = {}) => Object.freeze({
  id,
  type,
  top,
  left,
  label,
  requirement,
  reward,
  missionId: internal.missionId || "",
  teamId: internal.teamId || "",
  note: internal.note || "",
});

const planet = (id, background, nodes) => Object.freeze({
  id,
  background: `${RAW}/media/planets/${background}`,
  nodes: Object.freeze(nodes),
});

const OPERATIONS_REWARD = "86,486,400 TP per completed Operation · 518,918,400 max";

export const ROTE_P6_MISSION_MAPS = Object.freeze({
  "death-star": planet("death-star", "deathstar.png", [
    node("c1", "fleet", 28, 58, "Fleet · Imperial TIE Fighter", "7★ Dark Side ships including Imperial TIE Fighter", "2,303,438 TP"),
    node("c2", "combat", 28, 47, "Darth Vader", "5x Dark Side or Neutral characters at Relic 9+ including Darth Vader", "460,668 → 1,151,719 TP", {
      missionId: "death-star-vader",
      teamId: "rote-lv",
    }),
    node("c3", "combat", 61, 29, "Combat Mission", "5x Dark Side or Neutral characters at Relic 9+", "460,668 → 1,151,719 TP"),
    node("c4", "combat", 57, 50, "Combat Mission", "5x Dark Side or Neutral characters at Relic 9+", "460,668 → 1,151,719 TP"),
    node("c6", "combat", 50, 19, "Iden Versio", "5x Dark Side or Neutral characters at Relic 9+ including Iden Versio", "460,668 → 1,151,719 TP", {
      missionId: "death-star-iden",
      teamId: "rote-iden",
    }),
    node("c7", "deployment", 40, 33, "Deployment", "Territory deployment", "1★ 582,632,425 · 2★ 1,059,331,682 · 3★ 1,246,272,567"),
    node("m2", "operations", 30, 25, "Operations", "Characters Relic 9 · Ships 7★", OPERATIONS_REWARD),
  ]),

  hoth: planet("hoth", "hoth.png", [
    node("c1", "fleet", 25, 58, "Fleet Mission", "7★ ships", "2,303,438 TP"),
    node("c2", "combat", 27, 42, "Combat Mission", "5x characters at Relic 9+", "460,668 → 1,151,719 TP"),
    node("c3", "combat", 60, 28, "Combat Mission", "5x characters at Relic 9+", "460,668 → 1,151,719 TP"),
    node("c4", "special", 44, 50, "Doctor Aphra + BT-1 + 0-0-0", "5x characters at Relic 9+ including Doctor Aphra, BT-1, and 0-0-0", "460,668 → 1,151,719 TP", {
      missionId: "hoth-aphra",
      teamId: "rote-aphra",
      note: "Current SWGOH Wiki identifies this as a Special Mission. The pinned GenSkaar revision labels the node as usual combat, so current mission typing overrides the stale source type.",
    }),
    node("c6", "combat", 32, 25, "Jabba the Hutt", "5x characters at Relic 9+ including Jabba the Hutt", "460,668 → 1,151,719 TP", {
      missionId: "hoth-jabba",
      teamId: "rote-jabba",
    }),
    node("c7", "deployment", 44, 35, "Deployment", "Territory deployment", "1★ 582,632,425 · 2★ 1,059,331,682 · 3★ 1,246,272,567"),
    node("m2", "operations", 60, 46, "Operations", "Characters Relic 9 · Ships 7★", OPERATIONS_REWARD),
  ]),

  scarif: planet("scarif", "scarif.png", [
    node("c1", "fleet", 28, 55, "Fleet · Profundity", "7★ Light Side ships including Profundity", "2,303,438 TP"),
    node("c2", "combat", 29, 40, "Cassian Andor + Pao + K-2SO", "5x Light Side or Neutral characters at Relic 9+ including Cassian Andor, Pao, and K-2SO", "460,668 → 1,151,719 TP", {
      missionId: "scarif-cassian",
      teamId: "rote-scarif-cassian",
    }),
    node("c3", "combat", 63, 27, "Combat Mission", "5x Light Side or Neutral characters at Relic 9+", "460,668 → 1,151,719 TP"),
    node("c4", "combat", 51, 49, "Combat Mission", "5x Light Side or Neutral characters at Relic 9+", "460,668 → 1,151,719 TP"),
    node("c6", "combat", 36, 27, "Baze Malbus + Chirrut Îmwe + Scarif Rebel Pathfinder", "5x Light Side or Neutral characters at Relic 9+ including Baze Malbus, Chirrut Îmwe, and Scarif Rebel Pathfinder", "460,668 → 1,151,719 TP", {
      missionId: "scarif-baze",
      teamId: "rote-scarif-baze",
    }),
    node("c7", "deployment", 53, 40, "Deployment", "Territory deployment", "1★ 555,710,999 · 2★ 1,010,383,635 · 3★ 1,188,686,629"),
    node("m2", "operations", 58, 56, "Operations", "Characters Relic 9 · Ships 7★", OPERATIONS_REWARD),
  ]),
});

export function roteP6MissionMap(planetId) {
  return ROTE_P6_MISSION_MAPS[String(planetId || "")] || null;
}
