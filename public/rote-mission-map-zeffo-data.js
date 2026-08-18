const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_ZEFFO_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentRewards: "https://swgoh.gg/territory-battles/t05D/rewards/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Zeffo is an unlocked Zone 3 bonus territory. Planet art and node positions are pinned to GenSkaar; R7 requirements, reward tiers and the Bracca 30-clear unlock condition are cross-checked against current references.",
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

export const ROTE_ZEFFO_MISSION_MAP = Object.freeze({
  id: "zeffo",
  background: `${RAW}/media/planets/zeffo.png`,
  nodes: Object.freeze([
    node("c1", "fleet", 72, 50, "Fleet · Negotiator", "7★ Light Side ships including Negotiator", "682,500 TP", { missionId: "zeffo-fleet", teamId: "rote-zeffo-fleet-marauder" }),
    node("c2", "combat", 38, 49, "Unaligned Force Users", "5x Light Side Unaligned Force Users at Relic 7+", "162,500 → 341,250 TP", { missionId: "zeffo-ufu", teamId: "rote-zeffo-ufu-rey" }),
    node("c3", "special", 58, 21, "Clone Troopers", "5x Clone Troopers at Relic 7+", "50 Mk II Guild Event Tokens", { missionId: "zeffo-clones", teamId: "rote-zeffo-clones-crex", note: "Tomb Guardians cannot be defeated unless stunned; the existing app strategy layer carries the verified control guidance for this mission." }),
    node("c6", "combat", 58, 43, "Combat Mission", "5x Light Side characters at Relic 7+", "162,500 → 341,250 TP", { missionId: "zeffo-generic-1", teamId: "rote-zeffo-generic-leia" }),
    node("c7", "deployment", 34, 26, "Deployment", "Unlocked Zeffo territory deployment", "Tier 1: 143,589,583 · Tier 2: 229,743,333 · 1★: 287,179,167"),
    node("c8", "combat", 71, 32, "Jedi Knight Cal Kestis", "5x Light Side characters at Relic 7+ including Jedi Knight Cal Kestis", "487,500 → 1,023,750 TP", { missionId: "zeffo-jkck", teamId: "rote-zeffo-jkck" }),
    node("m2", "operations", 34, 38, "Operations", "Characters Relic 7 · Ships 7★", "Supports Zeffo Operations"),
  ]),
});

export function roteZeffoMissionMap(planetId) {
  return String(planetId || "") === "zeffo" ? ROTE_ZEFFO_MISSION_MAP : null;
}
